#!/usr/bin/env node
/**
 * Build the static site data bundle for GitHub Pages.
 * Reads verified data files + re-exports the engine's computed results
 * into src/data/site-data.js (committed; the Pages site is fully static).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/kalshi-api.js';
import { compareRacesToMarkets, compareRatingsToMarkets } from '../src/poll-layer.js';
import { scoreSnapshots } from '../src/crosslayer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const readOptional = (p) => (existsSync(join(ROOT, p)) ? read(p) : null);

const snapshot = read('data/kalshi/snapshot-2026-09-18.json');
const sources = read('data/sources/master.json');
const outcomes = read('data/outcomes/verified-outcomes.json');
const polls = read('data/polls/verified-polls.json');
const backtests = read('data/backtest-results.json');
const contestFull = read('data/contest-results.json');
// Slim the contest output for the browser: keep leaderboards, theses, equity curves and
// fill counts; drop per-fill logs (they stay in data/contest-results.json for audit).
const slimResult = (r) => ({ ...r, skipLog: undefined, fillLog: undefined, fillSample: (r.fillLog || []).slice(0, 12) });
const contest = {
  ...contestFull,
  results: contestFull.results.map(slimResult),
  universes: Object.fromEntries(Object.entries(contestFull.universes || {}).map(([k, u]) => [k, { ...u, results: u.results.map(slimResult) }])),
};
// Both toolchains publish irregularities; the site shows the complete list.
const irregularitiesNode = read('data/irregularities.json');
const irregularitiesPython = read('data/irregularities-python-track.json');
const irregularities = {
  title: 'Irregularities & discrepancies — combined (both toolchains)',
  method: 'Node-track items live in data/irregularities.json; Python-track items (13-22) are transcribed verbatim from the IRREGULARITIES.md table into data/irregularities-python-track.json. Combined here in id order for the site.',
  items: [
    ...irregularitiesNode.items.map((i) => ({ ...i, track: 'node' })),
    ...irregularitiesPython.items,
  ].sort((a, b) => a.id - b.id),
};
const roadmap = read('data/roadmap.json');
const pollLayerRaw = readOptional('data/polls/poll-layer-2026.json');

// Forward-collection layer (written by scripts/collect-kalshi.mjs on networked runs; absent until the first run)
const universe = readOptional('data/kalshi/universe/latest.json');
const seriesRegistry = readOptional('data/kalshi/universe/series.json');
const calibration = readOptional('data/kalshi/tracker/calibration.json');
const discrepancyWatch = readOptional('data/kalshi/tracker/discrepancy-watch.json');
const settlements = readOptional('data/kalshi/tracker/settlements.json');
const trackerIndex = readOptional('data/kalshi/tracker/index.json');
const senate2024 = readOptional('data/kalshi/historical/senate-2024.json');
const crosscheck = readOptional('data/kalshi/tracker/collector-crosscheck.json');
const runHistory = readOptional('data/kalshi/tracker/history.json');
// Cross-layer scoreboard (R14): pending until data/crosslayer/outcomes.json carries official canvasses.
const crossSnapshots = readOptional('data/crosslayer/snapshots.json');
const crossOutcomes = readOptional('data/crosslayer/outcomes.json');
const metaculusDaily = readOptional('data/crosslayer/metaculus-daily.json');
const stateNavigateDaily = readOptional('data/statenavigate/forecast-daily.json');
const renderingCrosscheck = readOptional('data/kalshi/tracker/rendering-crosscheck.json');
const crossLayer = crossSnapshots ? {
  capturedFrom: crossSnapshots.capturedFrom,
  capturedAt: crossSnapshots.capturedAt,
  method: crossSnapshots.method,
  questions: crossSnapshots.questions,
  outcomesMethod: crossOutcomes ? crossOutcomes.method : null,
  officialSources: crossOutcomes ? crossOutcomes.officialSources : [],
  scored: scoreSnapshots(crossSnapshots.snapshots, (crossOutcomes && crossOutcomes.outcomes) || {}, { asOf: new Date().toISOString().slice(0, 10) }),
  snapshots: crossSnapshots.snapshots,
  metaculusRows: metaculusDaily ? metaculusDaily.rows.slice(-30) : [],
  stateNavigate: stateNavigateDaily ? { capturedFrom: stateNavigateDaily.capturedFrom, latest: stateNavigateDaily.rows[stateNavigateDaily.rows.length - 1] || null, days: stateNavigateDaily.rows.length } : null,
  renderings: renderingCrosscheck ? { method: renderingCrosscheck.method, rows: renderingCrosscheck.rows.slice(-14) } : null,
} : null;
const testCount = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs')).reduce((n, f) => n + (readFileSync(join(ROOT, 'test', f), 'utf8').match(/^test\(/gm) || []).length, 0);

// Daily tracker history for the site: the implied-probability path of the most-traded open markets
const dailyDir = join(ROOT, 'data/kalshi/tracker/daily');
const dailyFiles = existsSync(dailyDir) ? readdirSync(dailyDir).filter((n) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(n)).sort() : [];
const trackerHistory = {};
const trackedTickers = new Set((universe ? universe.topMarkets : []).map((m) => m.ticker));
for (const f of dailyFiles) {
  for (const r of parseCsv(readFileSync(join(dailyDir, f), 'utf8'))) {
    if (!trackedTickers.has(r.ticker)) continue;
    const bid = r.yes_bid === '' ? null : Number(r.yes_bid);
    const ask = r.yes_ask === '' ? null : Number(r.yes_ask);
    const last = r.last_price === '' ? null : Number(r.last_price);
    (trackerHistory[r.ticker] = trackerHistory[r.ticker] || []).push({ date: r.date, bid, ask, last });
  }
}

// Compact universe for the site. The full listing lives in data/kalshi/universe/latest.json;
// the browser gets: counts, per-series totals (US-election series), the top markets, and a
// watchlist of US-election events (core 2026 series in full, then the highest-volume series),
// each capped to its 12 most-traded markets.
const CORE_SERIES_RE = /^(SENATE|CONTROL|KXGOV|KXMAYOR|KXDSENATESEATS|KXRSENATESEATS|KXDHOUSESEATS|KXRHOUSESEATS|KXBALANCEPOWER)/;
const WATCHLIST_SERIES_MAX = 160;
const MARKETS_PER_EVENT_MAX = 12;
const WATCHLIST_EVENTS_MAX = 600;
const WATCHLIST_MIN_EVENT_VOLUME = 1000; // contracts, lifetime; core-series events are always listed
let universeSite = null;
if (universe) {
  const usSeries = universe.bySeries.filter((s) => s.us_election && s.volume > 0);
  const watch = new Set(usSeries.filter((s) => CORE_SERIES_RE.test(s.series_ticker)).map((s) => s.series_ticker));
  for (const s of usSeries) { if (watch.size >= WATCHLIST_SERIES_MAX) break; watch.add(s.series_ticker); }
  const events = universe.events
    .filter((e) => e.us_election && watch.has(e.series_ticker) && e.markets.length > 0)
    .map((e) => {
      const sorted = [...e.markets].sort((a, b) => (b.volume || 0) - (a.volume || 0));
      return {
        event_ticker: e.event_ticker, series_ticker: e.series_ticker, category: e.category, us_election: 1, title: e.title, sub_title: e.sub_title, mutually_exclusive: e.mutually_exclusive,
        markets_total: e.markets_total, markets_untraded: e.markets_untraded, markets_listed: Math.min(sorted.length, MARKETS_PER_EVENT_MAX),
        volume: sorted.reduce((s, m) => s + (m.volume || 0), 0),
        markets: sorted.slice(0, MARKETS_PER_EVENT_MAX).map((m) => ({ ticker: m.ticker, yes_sub_title: m.yes_sub_title, close_time: m.close_time, yes_bid: m.yes_bid, yes_ask: m.yes_ask, last_price: m.last_price, volume: m.volume, open_interest: m.open_interest, ...(m.status ? { status: m.status } : {}) })),
      };
    })
    .sort((a, b) => b.volume - a.volume)
    .filter((e) => CORE_SERIES_RE.test(e.series_ticker) || e.volume >= WATCHLIST_MIN_EVENT_VOLUME)
    .slice(0, WATCHLIST_EVENTS_MAX);
  universeSite = {
    capturedFrom: universe.capturedFrom,
    capturedAt: universe.capturedAt,
    date: universe.date,
    categories: universe.categories,
    counts: universe.counts,
    bySeries: usSeries.slice(0, 400),
    topMarkets: universe.topMarkets,
    watchlist: { seriesCount: watch.size, eventsListed: events.length, eventsMax: WATCHLIST_EVENTS_MAX, minEventVolume: WATCHLIST_MIN_EVENT_VOLUME, marketsPerEventMax: MARKETS_PER_EVENT_MAX, coreSeriesPattern: String(CORE_SERIES_RE) },
    events,
  };
}

// Discrepancy watch: counts + the most relevant findings (US-election first, then by volume)
const discrepancySite = discrepancyWatch ? {
  capturedFrom: discrepancyWatch.capturedFrom, capturedAt: discrepancyWatch.capturedAt, date: discrepancyWatch.date, method: discrepancyWatch.method,
  eventsChecked: discrepancyWatch.eventsChecked, marketsChecked: discrepancyWatch.marketsChecked, counts: discrepancyWatch.counts || {},
  total: discrepancyWatch.findings.length,
  findings: [...discrepancyWatch.findings].sort((a, b) => (b.us_election || 0) - (a.us_election || 0) || (b.severity === 'high') - (a.severity === 'high') || (b.volume || 0) - (a.volume || 0)).slice(0, 60),
} : null;

const pollLayer = pollLayerRaw ? { ...pollLayerRaw, marketComparison: compareRacesToMarkets(pollLayerRaw, universe), ratingsComparison: compareRatingsToMarkets(pollLayerRaw, universe) } : null;

const senate2024Site = senate2024 ? {
  capturedFrom: senate2024.capturedFrom,
  capturedAt: senate2024.capturedAt,
  method: senate2024.method,
  summary: senate2024.summary,
  states: Object.fromEntries(Object.entries(senate2024.states).map(([st, s]) => [st, { series: s.series, seriesExists: s.seriesExists, markets2024: s.markets2024, eventsSeen: s.eventsSeen, note: s.note }])),
  series: senate2024.series,
  markets: Object.fromEntries(Object.entries(senate2024.markets).map(([t, m]) => [t, { ticker: m.ticker, series: m.series, event: m.event, state: m.state, title: m.title, yes_sub_title: m.yes_sub_title, rules_primary: m.rules_primary, openTime: m.openTime, closeTime: m.closeTime, settlementTs: m.settlementTs, result: m.result, status: m.status, totalVolumeContracts: m.totalVolumeContracts, capturedFrom: m.capturedFrom }])),
  errors: senate2024.errors,
} : null;

// 538 national 2024 average series (downsampled to weekly + key dates for the chart)
import { loadNationalAverages, nationalMargin } from '../src/poll-backtest.js';
const byDate = loadNationalAverages(join(ROOT, 'data/polls/538-national-averages.csv'));
const allDates = [...byDate.keys()].sort();
const keySet = new Set(['2024-03-01', '2024-06-30', '2024-07-21', '2024-08-05', '2024-09-12']);
const weekly = allDates.filter((d, i) => i % 7 === 0 || keySet.has(d));
const pollSeries = weekly.map((d) => ({ date: d, margin: nationalMargin(byDate, d) })).filter((p) => p.margin !== null);

// --- ROADMAP R1-R4 forward-loop artifacts (null until the networked collector runs) ---
const senate2024RacesFull = readOptional('data/senate-2024-backtest.json');
const senate2024Races = senate2024RacesFull && {
  generatedAt: senate2024RacesFull.generatedAt,
  inputs: senate2024RacesFull.inputs,
  note: senate2024RacesFull.note,
  nMarkets: senate2024RacesFull.nMarkets,
  settlementCrossCheck: senate2024RacesFull.settlementCrossCheck,
  aggregate: senate2024RacesFull.aggregate,
  aggregateByBandT7: senate2024RacesFull.aggregateByBandT7,
  holdOfficialWinners: senate2024RacesFull.holdOfficialWinners,
  universeCoverage: senate2024RacesFull.universeCoverage,
  captureErrors: senate2024RacesFull.captureErrors,
  markets: (senate2024RacesFull.markets || []).map((m) => ({
    ticker: m.ticker, state: m.state, side: m.side, title: m.title,
    result: m.result, officialWinner: m.officialWinner, officialWinnerParty: m.officialWinnerParty,
    crossCheck: m.crossCheck, bandT7: m.bandT7, p7: m.p7, volume: m.volume,
    nTradeBars: m.nTradeBars, leadTimes: m.leadTimes,
    series: (m.dailySeries || []).map((p) => ({ date: p.date, p: p.p })),
  })),
};
const calibrationForward = readOptional('data/calibration-2026.json');
const polls2026 = readOptional('data/polls/polls-2026-series.json');
const universeOpen = readOptional('data/kalshi/forward/universe-open.json');
const universeSummary = universeOpen && {
  capturedFrom: universeOpen.capturedFrom,
  capturedAt: universeOpen.capturedAt,
  date: universeOpen.date,
  count: universeOpen.count,
  seriesQueried: universeOpen.seriesQueried,
  top: [...(universeOpen.markets || [])]
    .sort((a, b) => Number(b.vol || 0) - Number(a.vol || 0))
    .slice(0, 15)
    .map((m) => ({ ticker: m.ticker, event: m.event_ticker, series: m.series, sub: m.sub, bid: m.bid, ask: m.ask, vol: m.vol, oi: m.oi, close_time: m.close_time })),
};

const bundle = {
  generatedAt: new Date().toISOString(),
  snapshot,
  sources,
  outcomes,
  polls,
  backtests,
  contest,
  irregularities,
  roadmap,
  pollSeries2024: pollSeries,
  pollLayer,
  crossLayer,
  universe: universeSite,
  seriesRegistry: seriesRegistry ? { capturedFrom: seriesRegistry.capturedFrom, capturedAt: seriesRegistry.capturedAt, count: seriesRegistry.count, byCategory: seriesRegistry.series.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {}) } : null,
  // per-market lead scores stay in data/kalshi/tracker/calibration.json; the site gets the summary plus the scored markets only
  calibration: calibration ? { ...calibration, perMarket: (calibration.perMarket || []).filter((m) => m.observations > 0).slice(0, 200) } : null,
  discrepancyWatch: discrepancySite,
  settlements: settlements ? {
    capturedAt: settlements.capturedAt,
    count: Object.keys(settlements.markets).length,
    byResult: Object.values(settlements.markets).reduce((acc, m) => { acc[m.result] = (acc[m.result] || 0) + 1; return acc; }, {}),
    // compact list for the site (full records with capture URLs stay in data/kalshi/tracker/settlements.json)
    recent: Object.values(settlements.markets).sort((a, b) => String(b.settlement_ts || b.close_time).localeCompare(String(a.settlement_ts || a.close_time))).slice(0, 40)
      .map((m) => ({ ticker: m.ticker, series_ticker: m.series_ticker, title: m.title, yes_sub_title: m.yes_sub_title, result: m.result, settlementDay: String(m.settlement_ts || m.close_time || '').slice(0, 10), volume: m.volume })),
  } : null,
  tracker: trackerIndex ? { days: trackerIndex.days || [], tickers: Object.keys(trackerIndex.tickers).length, history: trackerHistory, runs: runHistory ? runHistory.days.slice(-120) : [] } : null,
  senate2024: senate2024Site,
  senate2024Races,      // ROADMAP R2 forward-loop capture (data/senate-2024-backtest.json)
  calibrationForward,   // ROADMAP R3 live 2026 calibration tracker (data/calibration-2026.json)
  polls2026,            // ROADMAP R4 continuous poll layer (data/polls/polls-2026-series.json)
  universeSummary,      // ROADMAP R1 latest FULL open-universe snapshot summary
  crosscheck: crosscheck ? { ...crosscheck, largestLastPriceDifferences: (crosscheck.largestLastPriceDifferences || []).slice(0, 8) } : null,
  meta: {
    project: 'Elections — collect, analyze, project & estimate',
    updated: new Date().toISOString().slice(0, 10),
    tests: testCount,
    repo: 'https://github.com/buffedlizard55-lab/Elections',
    liveSite: 'https://buffedlizard55-lab.github.io/Elections/',
  },
};

const dir = join(ROOT, 'src/data');
mkdirSync(dir, { recursive: true });
const js = '// GENERATED by scripts/build-site.mjs — do not edit by hand.\nwindow.SITE_DATA = ' + JSON.stringify(bundle) + ';\n';
writeFileSync(join(dir, 'site-data.js'), js);
console.log(`wrote src/data/site-data.js (${(js.length / 1024).toFixed(0)} KB)`);
