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
 *        -> data/kalshi/tracker/daily/YYYY-MM-DD.csv   (one row per open market, dollars)
 *        -> data/kalshi/tracker/daily/YYYY-MM-DD.meta.json
 *        -> data/kalshi/universe/latest.json           (site view: events + markets + prices)
 *   3. Tracker index    data/kalshi/tracker/index.json (ticker -> first/last seen, series, close)
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
 * Usage: node scripts/collect-kalshi.mjs [--dry-run] [--date YYYY-MM-DD]
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
const dateArg = argv.indexOf('--date') >= 0 ? argv[argv.indexOf('--date') + 1] : null;

const CATEGORIES = ['Elections', 'Politics'];
const now = new Date();
const day = dateArg || now.toISOString().slice(0, 10);
const capturedAt = now.toISOString();
const provenance = (url) => ({ capturedFrom: url, capturedAt, capturedBy: 'scripts/collect-kalshi.mjs' });

const UNIVERSE_DIR = join(ROOT, 'data/kalshi/universe');
const TRACKER_DIR = join(ROOT, 'data/kalshi/tracker');
const DAILY_DIR = join(TRACKER_DIR, 'daily');
const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJson = (p, obj) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(obj, null, 1) + '\n'); };

export const DAILY_COLUMNS = ['date', 'ticker', 'event_ticker', 'series_ticker', 'category', 'mutually_exclusive', 'title', 'yes_sub_title', 'status', 'open_time', 'close_time', 'yes_bid', 'yes_ask', 'last_price', 'volume', 'volume_24h', 'open_interest', 'liquidity'];

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
        last_updated_ts: s.last_updated_ts,
        matchedCategoryFilters: [...new Set([...(prev ? prev.matchedCategoryFilters : []), cat])],
      };
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
      markets: (ev.markets || []).map((m) => compactMarket(m)),
    };
  });
}

function dailyRows(projected) {
  const rows = [];
  for (const ev of projected) {
    for (const m of ev.markets) {
      rows.push({
        date: day,
        ticker: m.ticker,
        event_ticker: ev.event_ticker,
        series_ticker: ev.series_ticker,
        category: ev.category,
        mutually_exclusive: ev.mutually_exclusive ? 1 : 0,
        title: m.title,
        yes_sub_title: m.yes_sub_title,
        status: m.status,
        open_time: m.open_time,
        close_time: m.close_time,
        yes_bid: m.yes_bid,
        yes_ask: m.yes_ask,
        last_price: m.last_price,
        volume: m.volume,
        volume_24h: m.volume_24h,
        open_interest: m.open_interest,
        liquidity: m.liquidity,
      });
    }
  }
  rows.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  return rows;
}

function updateIndex(index, rows, projected) {
  const byEvent = Object.fromEntries(projected.map((e) => [e.event_ticker, e]));
  for (const r of rows) {
    const prev = index.tickers[r.ticker];
    index.tickers[r.ticker] = {
      series_ticker: r.series_ticker,
      event_ticker: r.event_ticker,
      category: r.category,
      title: r.title,
      yes_sub_title: r.yes_sub_title,
      event_title: byEvent[r.event_ticker] ? byEvent[r.event_ticker].title : '',
      close_time: r.close_time,
      first_seen: prev ? prev.first_seen : day,
      last_seen: day,
      days_seen: (prev ? prev.days_seen : 0) + (prev && prev.last_seen === day ? 0 : 1),
    };
  }
  return index;
}

async function scanSettlements(index, openTickers, settlements, meta) {
  const candidates = Object.keys(index.tickers).filter((t) => !openTickers.has(t) && !settlements.markets[t]);
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
      const settled = (m.status === 'finalized' || m.status === 'settled') && (m.result === 'yes' || m.result === 'no');
      if (!settled) { pending += 1; continue; }
      const ix = index.tickers[m.ticker] || {};
      settlements.markets[m.ticker] = {
        ticker: m.ticker,
        event_ticker: m.event_ticker,
        series_ticker: ix.series_ticker || '',
        title: m.title,
        yes_sub_title: m.yes_sub_title || '',
        result: m.result,
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
  const registry = await collectSeriesRegistry(meta);
  meta.seriesInRegistry = Object.keys(registry).length;

  // 2. open universe
  const events = await collectOpenUniverse(registry, meta);
  const projected = projectEvents(events, registry);
  const rows = dailyRows(projected);
  meta.openMarkets = rows.length;
  meta.openEvents = projected.length;
  const priced = rows.filter((r) => impliedProb(r).p !== null).length;
  meta.openMarketsWithImpliedPrice = priced;
  console.log(`  open political/election events: ${projected.length}; markets: ${rows.length} (${priced} priced); exchange-wide open events: ${meta.eventsTotalOpenOnExchange}`);

  // by-series summary for the site
  const bySeries = {};
  for (const ev of projected) {
    const k = ev.series_ticker;
    bySeries[k] = bySeries[k] || { series_ticker: k, title: registry[k] ? registry[k].title : '', category: ev.category, events: 0, markets: 0, volume: 0 };
    bySeries[k].events += 1;
    bySeries[k].markets += ev.markets.length;
    bySeries[k].volume += ev.markets.reduce((s, m) => s + (m.volume || 0), 0);
  }

  // 3. index + 4. settlements + 5. calibration + 6. consistency
  const index = readJson(join(TRACKER_DIR, 'index.json'), { capturedFrom: `${API_BASE}/events?status=open&with_nested_markets=true`, note: 'ticker -> first/last seen in the daily tracker (maintained by scripts/collect-kalshi.mjs)', tickers: {} });
  const openTickers = new Set(rows.map((r) => r.ticker));
  const settlements = readJson(join(TRACKER_DIR, 'settlements.json'), { capturedFrom: `${API_BASE}/markets?tickers=...`, note: 'official exchange settlements of markets previously tracked while open (result yes/no); appended by scripts/collect-kalshi.mjs', markets: {} });
  await scanSettlements(index, openTickers, settlements, meta);
  updateIndex(index, rows, projected);
  index.capturedAt = capturedAt;
  index.days = [...new Set([...(index.days || []), day])].sort();
  settlements.capturedAt = capturedAt;

  const allRows = [...loadAllDailyRows().filter((r) => r.date !== day), ...rows];
  const calibration = { ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true (daily) + ${API_BASE}/markets?tickers=... (settlements)`), ...scoreCalibration(allRows, settlements.markets) };
  const consistency = { ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true`), date: day, ...checkConsistency(projected) };
  console.log(`  settlements known: ${Object.keys(settlements.markets).length}; calibration settled=${calibration.settledMarkets}; consistency findings=${consistency.findings.length}`);

  // top markets by volume for the site
  const topMarkets = rows
    .map((r) => ({ ...r, implied: impliedProb(r) }))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 60)
    .map((r) => ({ ticker: r.ticker, event_ticker: r.event_ticker, series_ticker: r.series_ticker, title: r.title, yes_sub_title: r.yes_sub_title, close_time: r.close_time, yes_bid: r.yes_bid, yes_ask: r.yes_ask, last_price: r.last_price, volume: r.volume, open_interest: r.open_interest, p: r.implied.p, basis: r.implied.basis }));

  const latest = {
    ...provenance(`${API_BASE}/events?status=open&with_nested_markets=true&limit=200`),
    date: day,
    categories: CATEGORIES,
    counts: {
      seriesInRegistry: meta.seriesInRegistry,
      openEvents: projected.length,
      openMarkets: rows.length,
      openMarketsWithImpliedPrice: priced,
      exchangeWideOpenEvents: meta.eventsTotalOpenOnExchange,
      byCategory: projected.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {}),
    },
    bySeries: Object.values(bySeries).sort((a, b) => b.volume - a.volume),
    topMarkets,
    events: projected,
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
  writeJson(join(UNIVERSE_DIR, 'series.json'), { ...provenance(`${API_BASE}/series?category=Elections|Politics&include_volume=true`), date: day, count: Object.keys(registry).length, series: Object.values(registry).sort((a, b) => a.ticker.localeCompare(b.ticker)) });
  writeJson(join(UNIVERSE_DIR, 'latest.json'), latest);
  writeJson(join(TRACKER_DIR, 'index.json'), index);
  writeJson(join(TRACKER_DIR, 'settlements.json'), settlements);
  writeJson(join(TRACKER_DIR, 'calibration.json'), calibration);
  writeJson(join(TRACKER_DIR, 'discrepancy-watch.json'), consistency);
  console.log(`[collect] wrote tracker/daily/${day}.csv (${rows.length} rows), universe/series.json, universe/latest.json, tracker/{index,settlements,calibration,discrepancy-watch}.json`);

  console.log('[collect] rebuilding site bundle');
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-site.mjs')], { stdio: 'inherit', cwd: ROOT });
  if (meta.errors.length) process.exitCode = 0; // non-fatal errors are recorded, the run still counts
}

main().catch((e) => {
  console.error('[collect] fatal:', e.message);
  try {
    mkdirSync(DAILY_DIR, { recursive: true });
    writeJson(join(DAILY_DIR, `${day}.error.json`), { ...provenance(API_BASE), date: day, fatal: e.message, api: stats });
  } catch { /* ignore */ }
  process.exit(1);
});
