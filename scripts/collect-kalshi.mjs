#!/usr/bin/env node
/**
 * Elections — daily Kalshi collector (ROADMAP R1 + R3 + R5)
 * =====================================================================
 * Runs where general internet is available (GitHub Actions: see
 * .github/workflows/daily-collection.yml). Every artifact carries
 * capturedFrom + capturedAt; the provenance lint enforces it.
 *
 * What one run does (all documented public endpoints, no API key):
 *   1. Series registry  GET /series?category=Elections|Politics(&include_volume=true)
 *        -> data/kalshi/universe/series.json (compact; overwritten daily)
 *   2. Open universe    GET /events?status=open&with_nested_markets=true&limit=200 (paginated
 *        over the whole exchange; multivariate combos excluded by the endpoint), filtered to
 *        events whose series is in the registry OR whose event.category is Elections/Politics
 *        -> data/kalshi/tracker/daily/YYYY-MM-DD.csv   (one row per TRADED open market, dollars;
 *           "traded" = lifetime volume > 0 or open interest > 0 — never-traded strike-ladder rungs
 *           are counted in meta/latest but not listed, to keep the daily file ~1 MB)
 *        -> data/kalshi/tracker/daily/YYYY-MM-DD.meta.json
 *        -> data/kalshi/universe/latest.json           (site view: all events, traded markets + prices)
 *   3. Tracker index    data/kalshi/tracker/index.json (ticker -> static descriptors: series, event,
 *        category, title, yes_sub_title, us_election flag, first/last seen; the daily CSV carries
 *        only the fields that change day to day)
 *   4. Settlement scan  tickers previously tracked but not open today ->
 *        GET /markets?tickers=a,b,... (batched) -> data/kalshi/tracker/settlements.json
 *   5. Calibration      src/calibration.js over all daily CSVs + settlements
 *        -> data/kalshi/tracker/calibration.json  (the "expected vs actual" record)
 *   6. Consistency      src/consistency.js over today's events
 *        -> data/kalshi/tracker/discrepancy-watch.json
 *   7. Rebuild the site bundle (scripts/build-site.mjs).
 *
 * It never rewrites verified historical files. Failures record to the day's
 * meta.json and exit non-zero so the workflow commits nothing partial.
 *
 * Usage: node scripts/collect-kalshi.mjs [--dry-run] [--date YYYY-MM-DD] [--replay] [--force]
 *   --replay  offline: rebuild today's outputs from the saved universe/series.json +
 *             universe/latest.json (no network; settlement scan skipped). Used for format
 *             migrations and tests.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE, getJson, paginate, compactMarket, impliedProb, toCsv, parseCsv, stats } from '../src/kalshi-api.js';
import { scoreCalibration } from '../src/calibration.js';
import { checkConsistency } from '../src/consistency.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const REPLAY = argv.includes('--replay');
const FORCE = argv.includes('--force'); // bypass the shrink guard (a universe < 50% of yesterday's is treated as a failed capture)
const dateArg = argv.indexOf('--date') >= 0 ? argv[argv.indexOf('--date') + 1] : null;

const CATEGORIES = ['Elections', 'Politics'];
const now = new Date();
const day = dateArg || now.toISOString().slice(0, 10);
// In --replay mode capturedAt is reset to the ORIGINAL live capture time (the data is as-of that
// moment); the replay time is recorded separately as replayedAt.
let capturedAt = now.toISOString();
let replayedAt;
const provenance = (url) => ({ capturedFrom: url, capturedAt, ...(replayedAt ? { replayedAt } : {}), capturedBy: 'scripts/collect-kalshi.mjs' });

// COLLECT_DATA_DIR (tests only) redirects every read/write to a scratch copy of data/kalshi.
const DATA_DIR = process.env.COLLECT_DATA_DIR ? process.env.COLLECT_DATA_DIR : join(ROOT, 'data/kalshi');
const UNIVERSE_DIR = join(DATA_DIR, 'universe');
const TRACKER_DIR = join(DATA_DIR, 'tracker');
const DAILY_DIR = join(TRACKER_DIR, 'daily');
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJson = (p, obj) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 1) + '\n'); };
// Large machine-read files: one record per line (readable diffs, ~40% smaller than indented JSON).
const writeJsonLines = (p, header, key, records) => {
  mkdirSync(dirname(p), { recursive: true });
  const head = JSON.stringify({ ...header, [key]: '__RECORDS__' }, null, 1);
  const body = records.map((r) => '  ' + JSON.stringify(r)).join(',\n');
  writeFileSync(p, head.replace('"__RECORDS__"', '[\n' + body + '\n ]') + '\n');
};

// Day-to-day fields only; static descriptors live in tracker/index.json (keyed by ticker).
export const DAILY_COLUMNS = ['date', 'ticker', 'yes_bid', 'yes_ask', 'last_price', 'volume', 'volume_24h', 'open_interest', 'liquidity', 'close_time', 'status'];
// Exchange market status as returned that day ('active' = tradable; 'closed' = trading ended, awaiting
// determination/settlement; 'finalized'/'settled' = result known). Blank = not captured (first-day files).
export const isOpenForTrading = (m) => !m.status || m.status === 'active' || m.status === 'open';
export const isFinalized = (m) => m.status === 'finalized' || m.status === 'settled';
// Series tags (from GET /series) that mark a series as a U.S. election market; derived flag only,
// used to focus the site and the contest universe. Kalshi's own tag vocabulary, captured 2026-09-19.
export const US_ELECTION_TAGS = ['US Elections', 'Senate', 'House', 'Governor', 'Other US Elections', 'Local', 'Primaries', 'Election Combos', 'Senate Combos', 'House Combos', 'Governor Combos', 'Referendums', 'NYC', '2028'];
export const isTraded = (m) => (m.volume || 0) > 0 || (m.open_interest || 0) > 0;
export const isUsElectionSeries = (reg) => !!reg && ((reg.tags || []).some((t) => US_ELECTION_TAGS.includes(t)) || /^(SENATE|CONTROL|HOUSE|GOV|PRES|KXSENATE|KXGOV|KXMAYOR|KXHOUSE|KXPRES)/.test(reg.ticker));

async function collectSeriesRegistry(meta) {
  const registry = {};
  for (const cat of CATEGORIES) {
    const url = `${API_BASE}/series?category=${cat}&include_volume=true`;
    const page = await getJson(url);
    let n = 0;
    for (const s of page.series || []) {
      n += 1;
      const prev = registry[s.ticker];
      registry[s.ticker] = {
        ticker: s.ticker,
        title: s.title,
        category: s.category,
        categories: s.categories || [],
        tags: s.tags || [],
        frequency: s.frequency,
        fee_type: s.fee_type,
        fee_multiplier: s.fee_multiplier,
        settlement_sources: (s.settlement_sources || []).map((x) => ({ name: x.name, url: x.url })),
        contract_url: s.contract_url,
        volume: s.volume_fp !== undefined ? Number(s.volume_fp) : (prev ? prev.volume : null),
        matchedCategoryFilters: [...new Set([...(prev ? prev.matchedCategoryFilters : []), cat])],
      };
      registry[s.ticker].us_election = isUsElectionSeries(registry[s.ticker]);
    }
    meta.seriesByCategoryFilter[cat] = n;
    console.log(`  series?category=${cat}: ${n}`);
  }
  return registry;
}

async function collectOpenUniverse(registry, meta) {
  const url = `${API_BASE}/events?status=open&with_nested_markets=true&limit=200`;
  const { items, pages } = await paginate(url, 'events', {
    maxPages: 600,
    onPage: (p, n) => { if (p % 10 === 0) console.log(`  events page ${p} (+${n})`); },
  });
  meta.eventsPagesFetched = pages;
  meta.eventsTotalOpenOnExchange = items.length;
  const kept = [];
  const seenSeriesOutsideRegistry = new Set();
  for (const ev of items) {
    const inRegistry = !!registry[ev.series_ticker];
    const byCategory = CATEGORIES.includes(ev.category);
    if (!inRegistry && !byCategory) continue;
    if (!inRegistry) seenSeriesOutsideRegistry.add(ev.series_ticker);
    kept.push(ev);
  }
  meta.eventsKept = kept.length;
  meta.seriesSeenByEventCategoryOnly = [...seenSeriesOutsideRegistry].sort();
  return kept;
}

function projectEvents(events, registry) {
  return events.map((ev) => {
    const reg = registry[ev.series_ticker];
    return {
      event_ticker: ev.event_ticker,
      series_ticker: ev.series_ticker,
      category: ev.category || (reg ? reg.category : ''),
      title: ev.title,
      sub_title: ev.sub_title || '',
      mutually_exclusive: !!ev.mutually_exclusive,
      settlement_sources: (ev.settlement_sources || []).map((x) => ({ name: x.name, url: x.url })),
      tags: reg ? reg.tags : [],
      us_election: isUsElectionSeries(reg),
      markets: (ev.markets || []).map((m) => compactMarket(m)),
    };
  });
}

// One row per traded open market (see header). `descriptors` carries the static fields for the index.
function dailyRows(projected) {
  const rows = [];
  const descriptors = {};
  const finalized = []; // settled rungs still nested in open events: recorded once in settlements.json, not tracked daily
  let untraded = 0;
  for (const ev of projected) {
    for (const m of ev.markets) {
      if (!isTraded(m)) { untraded += 1; continue; }
      if (isFinalized(m)) { finalized.push(m.ticker); continue; }
      rows.push({
        date: day,
        ticker: m.ticker,
        yes_bid: m.yes_bid,
        yes_ask: m.yes_ask,
        last_price: m.last_price,
        volume: m.volume,
        volume_24h: m.volume_24h,
        open_interest: m.open_interest,
        liquidity: m.liquidity,
        close_time: m.close_time,
        status: m.status || '',
      });
      descriptors[m.ticker] = {
        event_ticker: ev.event_ticker,
        series_ticker: ev.series_ticker,
        category: ev.category,
        mutually_exclusive: ev.mutually_exclusive ? 1 : 0,
        us_election: ev.us_election ? 1 : 0,
        title: m.title,
        yes_sub_title: m.yes_sub_title,
        event_title: ev.title,
        open_time: m.open_time,
        status: m.status,
      };
    }
  }
  rows.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  return { rows, descriptors, untraded, finalized };
}

function updateIndex(index, rows, descriptors) {
  for (const r of rows) {
    const prev = index.tickers[r.ticker];
    const d = descriptors[r.ticker];
    index.tickers[r.ticker] = {
      series_ticker: d.series_ticker,
      event_ticker: d.event_ticker,
      category: d.category,
      mutually_exclusive: d.mutually_exclusive,
      us_election: d.us_election,
      title: d.title,
      yes_sub_title: d.yes_sub_title,
      open_time: d.open_time,
      close_time: r.close_time,
      first_seen: prev ? prev.first_seen : day,
      last_seen: day,
      days_seen: (prev ? prev.days_seen : 0) + (prev && prev.last_seen === day ? 0 : 1),
    };
  }
  return index;
}

// Re-attach static descriptors to daily rows (index is the join key) so downstream
// scoring (calibration, consistency, site) sees the same shape as before.
export function joinRows(rows, index) {
  return rows.map((r) => {
    const d = index.tickers[r.ticker] || {};
    return { ...r, series_ticker: d.series_ticker || '', event_ticker: d.event_ticker || '', category: d.category || '', us_election: d.us_election || 0, title: d.title || '', yes_sub_title: d.yes_sub_title || '' };
  });
}

async function scanSettlements(index, openTickers, settlements, meta, extraCandidates = new Set()) {
  // (a) tickers we tracked that left the open feed; (b) tickers still nested in an open event but no
  // longer 'active' (closed rungs of a multi-market event settle long before the event closes).
  const candidates = [...new Set([...Object.keys(index.tickers).filter((t) => !openTickers.has(t)), ...extraCandidates])].filter((t) => !settlements.markets[t]);
  meta.settlementCandidates = candidates.length;
  let found = 0;
  let pending = 0;
  for (let i = 0; i < candidates.length; i += 20) {
    const batch = candidates.slice(i, i + 20);
    const url = `${API_BASE}/markets?tickers=${encodeURIComponent(batch.join(','))}&limit=${batch.length}`;
    let page;
    try {
      page = await getJson(url);
    } catch (e) {
      meta.errors.push(`settlement batch ${i / 20}: ${e.message}`);
      continue;
    }
    for (const m of page.markets || []) {
      const finalized = m.status === 'finalized' || m.status === 'settled';
      if (!finalized) { pending += 1; continue; }
      const binary = m.result === 'yes' || m.result === 'no';
      const ix = index.tickers[m.ticker] || {};
      // Non-binary outcomes (voided / scalar / '') are recorded so they are not re-queried forever;
      // src/calibration.js scores only result === yes|no.
      settlements.markets[m.ticker] = {
        nonBinary: binary ? undefined : true,
        ticker: m.ticker,
        event_ticker: m.event_ticker,
        series_ticker: ix.series_ticker || '',
        title: m.title,
        yes_sub_title: m.yes_sub_title || '',
        result: binary ? m.result : (m.result || 'void'),
        status: m.status,
        close_time: m.close_time,
        settlement_ts: m.settlement_ts || null,
        settlement_value_dollars: m.settlement_value_dollars || null,
        volume: m.volume_fp !== undefined ? Number(m.volume_fp) : null,
        capturedFrom: url,
        capturedAt,
      };
      found += 1;
    }
  }
  meta.settlementsFound = found;
  meta.settlementsPending = pending;
  return settlements;
}

// tracker/index.json is stored as a records array; in memory it is a ticker -> descriptor map.
export function loadIndex(path) {
  const raw = readJson(path, null);
  if (!raw) return { capturedFrom: `${API_BASE}/events?status=open&with_nested_markets=true`, note: 'traded tickers seen in the daily tracker -> static descriptors + first/last seen (maintained by scripts/collect-kalshi.mjs)', tickers: {} };
  if (Array.isArray(raw.tickers)) {
    const tickers = {};
    for (const { ticker, ...v } of raw.tickers) tickers[ticker] = v;
    return { ...raw, tickers };
  }
  return raw;
}

function loadAllDailyRows() {
  if (!existsSync(DAILY_DIR)) return [];
  const rows = [];
  for (const f of readdirSync(DAILY_DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(n)).sort()) {
    rows.push(...parseCsv(readFileSync(join(DAILY_DIR, f), 'utf8')));
  }
  return rows;
}

async function main() {
  console.log(`[collect] ${DRY ? 'DRY RUN' : 'LIVE'} ${day} base=${API_BASE}`);
  const meta = { date: day, capturedAt, base: API_BASE, seriesByCategoryFilter: {}, errors: [] };

  // 1. series registry
  let registry;
  let projected;
  if (REPLAY) {
    const savedSeries = readJson(join(UNIVERSE_DIR, 'series.json'), null);
    const savedLatest = readJson(join(UNIVERSE_DIR, 'latest.json'), null);
    if (!savedSeries || !savedLatest) throw new Error('--replay needs universe/series.json and universe/latest.json');
    const srcTable = savedSeries.settlementSources || [];
    registry = Object.fromEntries(savedSeries.series.map((x) => {
      const { settlement_source_ids, ...rest } = x;
      const settlement_sources = x.settlement_sources || (settlement_source_ids || []).map((i) => srcTable[i]).filter(Boolean);
      return [x.ticker, { ...rest, settlement_sources, us_election: isUsElectionSeries(x) }];
    }));
    const savedIndex = loadIndex(join(TRACKER_DIR, 'index.json'));
    // files written since the status column exists list status only when it is not 'active'
    const statusAware = !!(savedLatest.counts && savedLatest.counts.openMarketsTradedNotActive != null);
    meta.replayOf = savedLatest.capturedAt;
    replayedAt = capturedAt;
    capturedAt = savedLatest.capturedAt;
    meta.capturedAt = capturedAt;
    meta.replayedAt = replayedAt;
    meta.seriesByCategoryFilter = savedLatest.counts ? { replay: savedLatest.counts.seriesInRegistry } : {};
    meta.eventsTotalOpenOnExchange = savedLatest.counts ? savedLatest.counts.exchangeWideOpenEvents : null;
    // saved events are already projected; recompute the derived flag and make sure market rows are complete
    // titles/open_time are not in the compact listing: take them from the saved index (exact), else synthesise
    projected = savedLatest.events.map((ev) => ({ ...ev, us_election: isUsElectionSeries(registry[ev.series_ticker]), markets: (ev.markets || []).map((m) => { const ix = savedIndex.tickers[m.ticker] || {}; return { title: m.title || ix.title || `${ev.title}${m.yes_sub_title ? ' — ' + m.yes_sub_title : ''}`, status: m.status || (statusAware ? 'active' : ''), open_time: m.open_time || ix.open_time || '', volume_24h: m.volume_24h ?? null, liquidity: m.liquidity ?? null, ...m }; }) }));
    meta.eventsKept = projected.length;
    console.log(`  replaying ${projected.length} saved events captured ${savedLatest.capturedAt}`);
  } else {
    registry = await collectSeriesRegistry(meta);
  }
  meta.seriesInRegistry = Object.keys(registry).length;

  // 2. open universe
  if (!REPLAY) {
    const events = await collectOpenUniverse(registry, meta);
    projected = projectEvents(events, registry);
  }
  // Shrink guard: a partial capture must never overwrite yesterday's universe as if it were the truth.
  // (Pagination that stops early, an API outage mid-run, or a category rename would all show up here.)
  const prevLatest = readJson(join(UNIVERSE_DIR, 'latest.json'), null);
  if (!REPLAY && prevLatest && prevLatest.counts && prevLatest.counts.openEvents > 0) {
    const ratio = projected.length / prevLatest.counts.openEvents;
    meta.shrinkRatioVsPrevious = Number(ratio.toFixed(3));
    if (ratio < 0.5 && !FORCE) {
      throw new Error(`universe shrank to ${projected.length} events from ${prevLatest.counts.openEvents} (${(ratio * 100).toFixed(0)}%); refusing to overwrite — rerun with --force if this is real`);
    }
  }
  const daily = dailyRows(projected);
  const { rows, descriptors, finalized } = daily;
  // In replay the saved events list only traded markets; the untraded count is carried per event.
  const untraded = REPLAY ? projected.reduce((s, ev) => s + (ev.markets_untraded || 0), 0) : daily.untraded;
  const openMarketsTotal = rows.length + finalized.length + untraded;
  meta.openMarkets = openMarketsTotal;
  meta.openMarketsTraded = rows.length;
  meta.openMarketsFinalizedInFeed = finalized.length;
  meta.openMarketsUntradedNotListed = untraded;
  meta.openEvents = projected.length;
  const priced = rows.filter((r) => impliedProb(r).p !== null).length;
  meta.openMarketsWithImpliedPrice = priced;
  meta.usElectionEvents = projected.filter((e) => e.us_election).length;
  console.log(`  open political/election events: ${projected.length} (${meta.usElectionEvents} US-election); markets: ${openMarketsTotal} (${rows.length} traded, ${priced} priced); exchange-wide open events: ${meta.eventsTotalOpenOnExchange}`);

  // by-series summary for the site
  const bySeries = {};
  for (const ev of projected) {
    const k = ev.series_ticker;
    bySeries[k] = bySeries[k] || { series_ticker: k, title: registry[k] ? registry[k].title : '', category: ev.category, us_election: ev.us_election ? 1 : 0, events: 0, markets: 0, traded: 0, volume: 0 };
    bySeries[k].events += 1;
    bySeries[k].markets += REPLAY && ev.markets_total != null ? ev.markets_total : ev.markets.length;
    bySeries[k].traded += ev.markets.filter((m) => isTraded(m) && !isFinalized(m)).length;
    bySeries[k].volume += ev.markets.reduce((s, m) => s + (m.volume || 0), 0);
  }
  // Self-consistency guard (irregularity #65, 2026-09-20): the derived summary blocks must reconcile
  // with the event list they were computed from. A file where bySeries totals more events than the file
  // holds is an in-run fetch anomaly (or a rebased-in chimera of two captures) and must never be written.
  {
    const bsEvents = Object.values(bySeries).reduce((s, x) => s + x.events, 0);
    const bsMarkets = Object.values(bySeries).reduce((s, x) => s + x.markets, 0);
    if (bsEvents !== projected.length || bsMarkets !== openMarketsTotal) {
      throw new Error(`universe self-consistency check failed: bySeries totals ${bsEvents} events / ${bsMarkets} markets but the projected feed holds ${projected.length} events / ${openMarketsTotal} markets — refusing to write an internally inconsistent universe (rerun; if it repeats, the events feed is returning different pages per request)`);
    }
  }

  // 3. index + 4. settlements + 5. calibration + 6. consistency
  const index = loadIndex(join(TRACKER_DIR, 'index.json'));
  const openTickers = new Set(rows.map((r) => r.ticker));
  const settlements = readJson(join(TRACKER_DIR, 'settlements.json'), { capturedFrom: `${API_BASE}/markets?tickers=...`, note: 'official exchange settlements of markets previously tracked while open (result yes/no); appended by scripts/collect-kalshi.mjs', markets: {} });
  // closed-pending rungs stay in the daily rows (their status can flip); finalized rungs are not rows but must be
  // settlement candidates the first time they are seen (they were never in the index if they settled before day 1)
  const notActive = new Set(rows.filter((r) => !isOpenForTrading(r)).map((r) => r.ticker));
  meta.openMarketsTradedNotActive = notActive.size;
  meta.openMarketsClosedBeforeCapture = rows.filter((r) => r.close_time && r.close_time < capturedAt).length + finalized.length;
  if (REPLAY) { meta.settlementScan = 'skipped (replay)'; } else { await scanSettlements(index, openTickers, settlements, meta, new Set([...notActive, ...finalized])); }
  updateIndex(index, rows, descriptors);
  index.capturedAt = capturedAt;
  index.days = [...new Set([...(index.days || []), day])].sort();
  settlements.capturedAt = capturedAt;

  const allRows = joinRows([...loadAllDailyRows().filter((r) => r.date !== day), ...rows], index);
  const calibration = { ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true (daily) + ${API_BASE}/markets?tickers=... (settlements)`), ...scoreCalibration(allRows, settlements.markets) };
  // Consistency checks need the full ladders (untraded rungs with a quoted book still carry implied
  // probability). The compact universe drops them, so a replay keeps the live file for the same day
  // instead of recomputing an approximation.
  const prevConsistency = REPLAY ? readJson(join(TRACKER_DIR, 'discrepancy-watch.json'), null) : null;
  const consistency = prevConsistency && prevConsistency.date === day && !prevConsistency.replayApproximation
    ? prevConsistency
    : { ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true`), date: day, ...(REPLAY ? { replayApproximation: true, note: 'computed from the compact universe (traded markets only); live runs include untraded rungs' } : {}), ...checkConsistency(projected) };
  console.log(`  settlements known: ${Object.keys(settlements.markets).length}; calibration settled=${calibration.settledMarkets}; consistency findings=${consistency.findings.length}`);

  // top markets by volume for the site
  const topMarkets = joinRows(rows, index)
    .map((r) => ({ ...r, implied: impliedProb(r) }))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 120)
    .map((r) => ({ ticker: r.ticker, event_ticker: r.event_ticker, series_ticker: r.series_ticker, us_election: r.us_election, title: r.title, yes_sub_title: r.yes_sub_title, close_time: r.close_time, ...(r.status && r.status !== 'active' ? { status: r.status } : {}), yes_bid: r.yes_bid, yes_ask: r.yes_ask, last_price: r.last_price, volume: r.volume, open_interest: r.open_interest, p: r.implied.p, basis: r.implied.basis }));

  // Compact universe listing: every kept event, but only traded markets are listed
  // (untraded rungs are counted per event). Per-market titles are omitted: they are
  // event title + yes_sub_title and live in tracker/index.json for traded tickers.
  const eventsCompact = projected.map((ev) => ({
    event_ticker: ev.event_ticker,
    series_ticker: ev.series_ticker,
    category: ev.category,
    us_election: ev.us_election ? 1 : 0,
    title: ev.title,
    sub_title: ev.sub_title,
    mutually_exclusive: ev.mutually_exclusive,
    // live: full ladder present; replay: the saved listing is traded-only, so keep the saved totals
    markets_total: ev.markets_total != null ? ev.markets_total : ev.markets.length,
    markets_untraded: ev.markets_untraded != null ? ev.markets_untraded : ev.markets.filter((m) => !isTraded(m)).length,
    markets: ev.markets.filter(isTraded).map((m) => ({ ticker: m.ticker, yes_sub_title: m.yes_sub_title, close_time: m.close_time, yes_bid: m.yes_bid, yes_ask: m.yes_ask, last_price: m.last_price, volume: m.volume, volume_24h: m.volume_24h, open_interest: m.open_interest, liquidity: m.liquidity, ...(m.status && m.status !== 'active' ? { status: m.status } : {}) })),
  }));

  const latest = {
    ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true&limit=200`),
    date: day,
    categories: CATEGORIES,
    note: 'Full open political/election universe. Every kept event is listed; markets with zero lifetime volume and zero open interest are counted (markets_untraded) but not listed. Prices are dollars per YES contract. status is listed only when it is not active (closed = trading ended, awaiting settlement; finalized = settled, recorded in tracker/settlements.json and excluded from the daily CSV; the event stays open until every market settles).',
    counts: {
      seriesInRegistry: meta.seriesInRegistry,
      openEvents: projected.length,
      usElectionEvents: meta.usElectionEvents,
      openMarkets: openMarketsTotal,
      openMarketsTraded: rows.length,
      openMarketsWithImpliedPrice: priced,
      openMarketsTradedNotActive: notActive.size,
      openMarketsFinalizedInFeed: finalized.length,
      openMarketsClosedBeforeCapture: meta.openMarketsClosedBeforeCapture,
      exchangeWideOpenEvents: meta.eventsTotalOpenOnExchange,
      byCategory: projected.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {}),
    },
    bySeries: Object.values(bySeries).sort((a, b) => b.volume - a.volume),
    topMarkets,
    events: eventsCompact,
  };

  if (meta.errors.length) {
    console.error(`[collect] ${meta.errors.length} non-fatal errors recorded in meta`);
  }
  meta.api = { requests: stats.requests, retries: stats.retries, bytesDownloaded: stats.bytes };
  meta.finishedAt = new Date().toISOString();

  if (DRY) {
    console.log('[collect] dry run — nothing written');
    console.log(JSON.stringify(meta, null, 1));
    return;
  }
  mkdirSync(DAILY_DIR, { recursive: true });
  writeFileSync(join(DAILY_DIR, `${day}.csv`), toCsv(rows, DAILY_COLUMNS));
  writeJson(join(DAILY_DIR, `${day}.meta.json`), { ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true&limit=200`), ...meta, columns: DAILY_COLUMNS });
  // series registry: settlement sources are normalised (many series share the same source list)
  const sourceIds = new Map();
  const sources = [];
  const seriesRecords = Object.values(registry).sort((a, b) => a.ticker.localeCompare(b.ticker)).map((x) => {
    const ids = (x.settlement_sources || []).map((src) => {
      const k = `${src.name}|${src.url}`;
      if (!sourceIds.has(k)) { sourceIds.set(k, sources.length); sources.push({ name: src.name, url: src.url }); }
      return sourceIds.get(k);
    });
    const { settlement_sources, ...rest } = x;
    return { ...rest, settlement_source_ids: ids };
  });
  writeJsonLines(join(UNIVERSE_DIR, 'series.json'), { ...provenance(`${API_BASE}/series?category=Elections|Politics&include_volume=true`), date: day, count: seriesRecords.length, note: 'settlement_source_ids index into settlementSources; us_election is a derived flag (see US_ELECTION_TAGS in scripts/collect-kalshi.mjs)', settlementSources: sources }, 'series', seriesRecords);
  const { events: latestEvents, ...latestHeader } = latest;
  writeJsonLines(join(UNIVERSE_DIR, 'latest.json'), latestHeader, 'events', latestEvents);
  const { tickers: indexTickers, ...indexHeader } = index;
  writeJsonLines(join(TRACKER_DIR, 'index.json'), { ...indexHeader, count: Object.keys(indexTickers).length }, 'tickers', Object.entries(indexTickers).sort(([a], [b]) => a.localeCompare(b)).map(([ticker, v]) => ({ ticker, ...v })));
  writeJson(join(TRACKER_DIR, 'settlements.json'), settlements);
  writeJson(join(TRACKER_DIR, 'calibration.json'), calibration);
  writeJson(join(TRACKER_DIR, 'discrepancy-watch.json'), consistency);
  // Per-run history: one record per collection day (re-runs on the same day overwrite that day's record).
  // This is the time series behind the site's Tracker "run log" — counts only, no prices.
  const history = readJson(join(TRACKER_DIR, 'history.json'), { ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true`), note: 'one record per collection day, written by scripts/collect-kalshi.mjs (crosscheck fields merged by scripts/crosscheck-collectors.mjs); a same-day re-run replaces the record', days: [] });
  const t1 = (calibration.byLead || []).find((b) => b.nDays === 1) || null;
  const record = {
    date: day,
    capturedAt,
    replayedAt,
    seriesInRegistry: meta.seriesInRegistry,
    openEvents: projected.length,
    usElectionEvents: meta.usElectionEvents,
    openMarkets: openMarketsTotal,
    openMarketsTraded: rows.length,
    openMarketsTradedNotActive: notActive.size,
    openMarketsFinalizedInFeed: finalized.length,
    openMarketsClosedBeforeCapture: meta.openMarketsClosedBeforeCapture,
    exchangeWideOpenEvents: meta.eventsTotalOpenOnExchange ?? null,
    shrinkRatioVsPrevious: meta.shrinkRatioVsPrevious ?? null,
    settlementsFound: meta.settlementsFound ?? 0,
    settlementsKnown: Object.keys(settlements.markets).length,
    settledMarketsScored: calibration.scoreableMarkets ?? calibration.settledMarkets,
    brierT1: t1 ? t1.meanBrier : null,
    consistency: { ...(consistency.counts || {}), total: consistency.findings.length },
    apiRequests: stats.requests,
    apiBytes: stats.bytes,
    errors: meta.errors.length,
  };
  const prior = history.days.find((d) => d.date === day);
  history.days = [...history.days.filter((d) => d.date !== day), prior && prior.crosscheck ? { ...record, crosscheck: prior.crosscheck } : record].sort((a, b) => a.date.localeCompare(b.date));
  history.capturedAt = capturedAt;
  history.count = history.days.length;
  writeJson(join(TRACKER_DIR, 'history.json'), history);
  console.log(`[collect] wrote tracker/daily/${day}.csv (${rows.length} traded rows; ${untraded} untraded counted only), universe/series.json, universe/latest.json, tracker/{index,settlements,calibration,discrepancy-watch,history}.json`);

  if (process.env.COLLECT_DATA_DIR) { console.log('[collect] scratch data dir — site bundle not rebuilt'); return; }
  console.log('[collect] rebuilding site bundle');
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-site.mjs')], { stdio: 'inherit', cwd: ROOT });
  if (meta.errors.length) process.exitCode = 0; // non-fatal errors are recorded, the run still counts
}

// Run only when executed directly (tests import the pure helpers above without triggering a capture).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error('[collect] fatal:', e.message);
    try {
      mkdirSync(DAILY_DIR, { recursive: true });
      writeJson(join(DAILY_DIR, `${day}.error.json`), { ...provenance(API_BASE), date: day, fatal: e.message, api: stats });
    } catch { /* ignore */ }
    process.exit(1);
  });
}
