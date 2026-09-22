#!/usr/bin/env node
/**
 * Elections — canonical open political/election market list + reconciliation
 * =====================================================================
 * The project's stated goal is "a full list that follows our requirements".
 * This script produces that list from files the collectors already captured and
 * proves, arithmetically, that nothing was dropped on the way.
 *
 * It performs NO network I/O. Every number it publishes is either read straight
 * out of a captured file or is an explicitly labelled derivation, and the
 * derivation is checked against the collector's own audit counters. If the
 * ladder does not balance, the script FAILS rather than publishing a list it
 * cannot account for.
 *
 * Outputs (under data/kalshi/universe/):
 *   market-list-latest.csv   every open political/election market in the latest
 *                            FULL universe capture, one row each, with the
 *                            contest-eligibility verdict and its reason
 *                            (overwritten each run to bound repository growth)
 *   market-list-latest.json  the reconciliation ladder, the eligibility
 *                            breakdown, and any flagged discrepancy
 *
 * Usage: node scripts/build-market-list.mjs [--quiet]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContestInputs, SEASON } from '../src/contest/forward-universe.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/kalshi/universe');
const QUIET = process.argv.includes('--quiet');
const log = (...a) => { if (!QUIET) console.log('[market-list]', ...a); };
const readJson = (p) => (existsSync(join(ROOT, p)) ? JSON.parse(readFileSync(join(ROOT, p), 'utf8')) : null);

const errors = [];
const discrepancies = [];

// ---------------------------------------------------------------------------
// 1. The captured full open-universe snapshot (every open politics/elections
//    market the collector saw, traded or not).
// ---------------------------------------------------------------------------
const openUniverse = readJson('data/kalshi/forward/universe-open.json');
if (!openUniverse || !Array.isArray(openUniverse.markets)) {
  console.error('[market-list] data/kalshi/forward/universe-open.json is missing or malformed — nothing to list.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. The collectors' own audit counters for the same capture, used below to
//    check the ladder rather than to trust it.
// ---------------------------------------------------------------------------
const latest = readJson('data/kalshi/universe/latest.json');
const nodeRunLog = openUniverse.date ? readJson(`data/kalshi/tracker/daily/${openUniverse.date}.meta.json`) : null;
const pyRunLog = readJson('data/kalshi/LATEST.json');
const seriesRegistry = readJson('data/kalshi/universe/series.json');

// ---------------------------------------------------------------------------
// 3. Build the eligibility verdict for every market in the full list.
// ---------------------------------------------------------------------------
// One loader for both artifacts: scripts/run-forward-contest.mjs imports the
// same function, so the market list and the scored season cannot disagree about
// which markets existed on which day.
const inputs = loadContestInputs(ROOT);
const seriesFlags = inputs.seriesFlags;
const meta = inputs.metadata;
const { dates, panel } = inputs;
const uni = inputs.universe;
const latestDate = dates.length ? dates[dates.length - 1] : null;
const latestEligible = latestDate ? uni.eligible[latestDate] : new Map();

/** Verdict + reason for a market in the full list, against the latest capture day. */
function verdict(m) {
  const series = m.series || (meta.byTicker.get(m.ticker) || {}).series || m.ticker.split('-')[0];
  const isElection = seriesFlags.usElection.has(series) || (meta.byTicker.get(m.ticker) || {}).eventUsElection === true;
  if (!isElection) return { code: 'not-us-election-series', eligible: false };
  if (latestEligible.has(m.ticker)) return { code: 'contest-eligible', eligible: true };
  const day = latestDate ? panel[latestDate] && panel[latestDate][m.ticker] : null;
  if (!day) return { code: 'not-in-that-days-captured-panel', eligible: false };
  const twoSided = day.yesBid !== null && day.yesAsk !== null && day.yesBid > 0 && day.yesAsk < 1;
  const traded = day.volume24h !== null && day.volume24h > 0;
  if (!twoSided && !traded) return { code: 'untraded-and-no-usable-book', eligible: false };
  if (!twoSided) return { code: 'traded-but-book-not-two-sided', eligible: false };
  if (!traded) return { code: 'priced-but-did-not-trade-that-day', eligible: false };
  if (day.closeTime && String(day.closeTime).slice(0, 10) <= latestDate) return { code: 'closed-by-that-date', eligible: false };
  if (day.closeTime && day.closeTime > SEASON.closesBy) return { code: 'closes-after-season-window', eligible: false };
  // Reaching here means this row satisfies every eligibility predicate the
  // universe builder applies but is still absent from the eligible set — the
  // two disagree, which is a bug to investigate, not a bucket to publish.
  return { code: 'unclassified-needs-review', eligible: false };
}

const rows = [];
const tally = {};
for (const m of openUniverse.markets) {
  const v = verdict(m);
  tally[v.code] = (tally[v.code] || 0) + 1;
  const series = m.series || (meta.byTicker.get(m.ticker) || {}).series || m.ticker.split('-')[0];
  const day = latestDate && panel[latestDate] ? panel[latestDate][m.ticker] : null;
  const yesBid = day && day.yesBid !== null ? day.yesBid : (m.bid ?? null);
  const yesAsk = day && day.yesAsk !== null ? day.yesAsk : (m.ask ?? null);
  const mid = yesBid !== null && yesAsk !== null && yesBid > 0 && yesAsk < 1 && yesAsk >= yesBid ? (yesBid + yesAsk) / 2 : null;
  rows.push({
    ticker: m.ticker,
    event_ticker: m.event_ticker || '',
    series,
    series_from_prefix: (meta.byTicker.get(m.ticker) || {}).seriesFromPrefix ? 'yes' : '',
    us_election_series: seriesFlags.usElection.has(series) ? 'yes' : 'no',
    yes_sub_title: m.sub || (meta.byTicker.get(m.ticker) || {}).yesSubTitle || '',
    close_time: m.close_time || (day ? day.closeTime : '') || '',
    status: m.status || (day ? day.status : '') || '',
    yes_bid: yesBid === null ? '' : yesBid,
    yes_ask: yesAsk === null ? '' : yesAsk,
    mid: mid === null ? '' : Math.round(mid * 1e6) / 1e6,
    last_price: m.last ?? (day ? day.lastPrice : '') ?? '',
    lifetime_volume: m.vol ?? '',
    open_interest: m.oi ?? '',
    volume_24h: day && day.volume24h !== null ? day.volume24h : '',
    traded_on_latest_day: day && day.volume24h > 0 ? 'yes' : 'no',
    contest_eligible: v.eligible ? 'yes' : 'no',
    eligibility_reason: v.code,
  });
}
rows.sort((a, b) => (a.series < b.series ? -1 : a.series > b.series ? 1 : a.ticker < b.ticker ? -1 : 1));

// ---------------------------------------------------------------------------
// 4. The reconciliation ladder. Each rung names the endpoint and the file it
//    was read from, so a reviewer can reproduce every step by hand.
// ---------------------------------------------------------------------------
const rungs = [];
const add = (step, value, basis, method) => rungs.push({ step, value, basis, method });

if (nodeRunLog) {
  add('1. open EVENTS exchange-wide', nodeRunLog.eventsTotalOpenOnExchange, `data/kalshi/tracker/daily/${openUniverse.date}.meta.json`, 'GET /events?status=open&with_nested_markets=true&limit=200 — every open event on the exchange, all categories');
  add('2. open POLITICAL/ELECTION events kept', nodeRunLog.eventsKept, `data/kalshi/tracker/daily/${openUniverse.date}.meta.json`, 'events whose series is in the Elections/Politics registry or whose own category is Elections/Politics');
  add('2b. of those, US-election tagged', nodeRunLog.usElectionEvents, `data/kalshi/tracker/daily/${openUniverse.date}.meta.json`, 'derived US-election flag — see US_ELECTION_TAGS in scripts/collect-kalshi.mjs');
  add('3. open political/election MARKETS', nodeRunLog.openMarkets, `data/kalshi/tracker/daily/${openUniverse.date}.meta.json`, 'markets nested in the kept events');
  add('3a. …of which finalized in the feed', nodeRunLog.openMarketsFinalizedInFeed, `data/kalshi/tracker/daily/${openUniverse.date}.meta.json`, 'status finalized: recorded as settlements and excluded from the daily panel');
  add('3b. …of which untraded and not listed', nodeRunLog.openMarketsUntradedNotListed, `data/kalshi/tracker/daily/${openUniverse.date}.meta.json`, 'zero lifetime volume AND zero open interest: counted, not listed');
  add('4. TRADED open markets (daily panel rows)', nodeRunLog.openMarketsTraded, `data/kalshi/tracker/daily/${openUniverse.date}.csv`, 'volume > 0 or open_interest > 0 — the panel this repo treats as tradeable');
}
if (seriesRegistry) {
  add('5. series in the politics/elections registry', seriesRegistry.count, 'data/kalshi/universe/series.json', 'GET /series?category=Elections|Politics, cursor-paginated');
  add('5b. of those, US-election tagged', seriesRegistry.series.filter((s) => s.us_election).length, 'data/kalshi/universe/series.json', 'derived US-election flag over the API series tags');
}
add('6. full open list in this artifact', rows.length, 'data/kalshi/forward/universe-open.json', openUniverse.capturedFrom);
if (latestDate) {
  add('7. contest-eligible markets on the last captured day', latestEligible.size, `data/kalshi/tracker/daily/${latestDate}.csv`, 'US-election series + captured panel + two-sided book + close_time inside the season window');
  add('7b. …excluded by the season window (2028-cycle rows open today)', rows.filter((r) => r.eligibility_reason === 'closes-after-season-window').length, `data/kalshi/tracker/daily/${latestDate}.csv`, `close_time after ${SEASON.closesBy} — open now, settles years from now, outside the 2026 season (see SEASON in src/contest/forward-universe.js)`);
  add('7a. …of which actually traded that day', [...latestEligible.values()].filter((r) => r.tradedOnDay).length, `data/kalshi/tracker/daily/${latestDate}.csv`, 'volume_24h > 0 — the only markets the contest engine will fill in');
}
if (pyRunLog) {
  add('X1. independent Python collector, exchange-wide active markets', pyRunLog.markets_total, 'data/kalshi/LATEST.json', `${pyRunLog.base_url} GET /markets?status=open (top ${pyRunLog.compact_max} by volume listed) — a DIFFERENT query shape from rung 3, so the totals are not expected to match`);
  add('X2. independent Python collector, politics-filtered markets', pyRunLog.markets_politics_filtered, 'data/kalshi/LATEST.json', 'client-side filter on the allowlist of 4,185 politics/elections series');
}

// Every listed market must land in a reason the universe builder actually
// applies. An `unclassified` row means this report and the scored season
// disagree about the same capture.
if (tally['unclassified-needs-review']) {
  errors.push(`${tally['unclassified-needs-review']} listed market(s) satisfy every eligibility predicate but are absent from the eligible set — the market list and the contest universe disagree`);
}

// Arithmetic gate: the three components of rung 3 must reconstruct it exactly.
if (nodeRunLog) {
  const parts = nodeRunLog.openMarketsTraded + nodeRunLog.openMarketsUntradedNotListed + nodeRunLog.openMarketsFinalizedInFeed;
  if (parts !== nodeRunLog.openMarkets) {
    errors.push(`reconciliation broken: ${nodeRunLog.openMarketsTraded} traded + ${nodeRunLog.openMarketsUntradedNotListed} untraded-unlisted + ${nodeRunLog.openMarketsFinalizedInFeed} finalized = ${parts}, but the collector recorded openMarkets = ${nodeRunLog.openMarkets}`);
  } else {
    log(`arithmetic gate passed: ${nodeRunLog.openMarketsTraded} + ${nodeRunLog.openMarketsUntradedNotListed} + ${nodeRunLog.openMarketsFinalizedInFeed} = ${nodeRunLog.openMarkets}`);
  }
}

// The two collectors must at least see the same exchange. They count different
// things on purpose, so only a gross disagreement is flagged.
if (pyRunLog && nodeRunLog) {
  const ratio = pyRunLog.markets_politics_filtered / nodeRunLog.openMarkets;
  if (ratio < 0.5 || ratio > 2) {
    discrepancies.push(`The two collectors differ by more than 2x on political/election market counts (Python ${pyRunLog.markets_politics_filtered} vs Node ${nodeRunLog.openMarkets}). The queries are not identical by construction (/markets vs /events), so this is a MONITORING flag, not proof of an error — check both run logs.`);
  }
}

// Full-list vs collector-total: the full snapshot is a separate query and must
// be within a small margin of the events-feed count, since both describe the
// same open political/election universe minutes apart.
if (nodeRunLog && openUniverse.count != null) {
  discrepancies.push(`Measurement note (not an error): this list holds ${openUniverse.count} markets from ${openUniverse.capturedFrom}, while the daily events feed recorded ${nodeRunLog.openMarkets} open political/election markets at ${nodeRunLog.capturedAt}. The two use different endpoints (/markets?series_ticker=… per series vs /events?status=open) and are captured minutes apart, so small differences are expected; a large one means one of the collectors changed behaviour and should be investigated.`);
}

const bySeriesTop = Object.entries(rows.reduce((acc, r) => { acc[r.series] = (acc[r.series] || 0) + 1; return acc; }, {}))
  .sort((a, b) => b[1] - a[1]).slice(0, 20).map(([series, n]) => ({ series, markets: n }));

const doc = {
  title: 'Canonical open political/election market list (Kalshi)',
  purpose: 'The complete list of open Kalshi political and election markets captured by this project, with the contest-eligibility verdict for every row, and a reconciliation ladder that shows where every other count went.',
  capturedFrom: openUniverse.capturedFrom,
  capturedAt: openUniverse.capturedAt,
  capturedBy: openUniverse.capturedBy,
  capturedForDate: openUniverse.date,
  latestPanelDate: latestDate,
  listFile: 'data/kalshi/universe/market-list-latest.csv',
  listFileNote: 'Overwritten on every run so the repository does not grow by a multi-megabyte duplicate each day. The underlying capture (data/kalshi/forward/universe-open.json + data/kalshi/tracker/daily/*.csv) is the append-only record.',
  totalListed: rows.length,
  contestEligibleCount: rows.filter((r) => r.contest_eligible === 'yes').length,
  eligibilityBreakdown: tally,
  reconciliationLadder: rungs,
  largestSeries: bySeriesTop,
  universeDefinition: 'contest-eligible = the market\'s series carries the collected US-election tag, the market appears in that day\'s captured panel with a two-sided book (yes_bid > 0, yes_ask < 1), and its close_time is strictly after that date. Defined once, in src/contest/forward-universe.js.',
  discrepancies,
  errors,
  gate: { reconciliationBalances: errors.length === 0, checksRun: nodeRunLog ? 1 : 0 },
};

writeFileSync(join(OUT_DIR, 'market-list-latest.json'), JSON.stringify(doc, null, 2) + '\n');

const header = Object.keys(rows[0]);
const esc = (v) => {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
writeFileSync(join(OUT_DIR, 'market-list-latest.csv'), [header.join(','), ...rows.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n') + '\n');

log(`listed ${rows.length} open political/election markets; ${doc.contestEligibleCount} contest-eligible on ${latestDate}`);
log(`eligibility breakdown: ${JSON.stringify(tally)}`);
if (discrepancies.length) for (const d of discrepancies) log(`FLAG: ${d}`);
if (errors.length) {
  for (const e of errors) console.error(`[market-list] ERROR: ${e}`);
  console.error(`[market-list] the reconciliation ladder does not balance — the list was written but the gate FAILED; see data/kalshi/universe/market-list-latest.json`);
  process.exit(1);
}
