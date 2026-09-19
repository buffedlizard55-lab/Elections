#!/usr/bin/env node
/**
 * Elections — full open-market universe collector (ROADMAP R1) + forward
 * calibration tracker feed (R3) + settled-2026 seed (R3 calibration input).
 * =====================================================================
 * Runs where general internet is available (GitHub-hosted Actions runner via
 * .github/workflows/universe-collection.yml, or any normal machine).
 *
 * It NEVER rewrites verified historical files. Outputs (all under
 * data/kalshi/forward/, every JSON carrying capturedFrom/capturedAt):
 *
 *   series-registry.json    full /series registry, compacted (overwritten daily; git keeps diffs)
 *   universe-open.json      every OPEN politics/elections market, compacted (overwritten daily)
 *   settled-2026-seed.json  settled 2026 Elections markets + normalised daily bars
 *                           (ACCUMULATES: previously captured tickers keep their bars;
 *                            only newly settled markets are fetched each run)
 *   open-prices.csv         append-only tracker: one row per (date, market) open snapshot
 *   meta-{date}.json        per-run counts, filter definition, errors
 *
 * Universe definition (transparent, from live API fields only): a series is
 * political when its category/categories include "Elections" or "Politics" or
 * its tags include "US Elections"/"Elections" (isPoliticsSeries in
 * src/kalshi-live.js). The settled-2026 seed is restricted to category
 * "Elections" series that are not frequency=="daily" (daily recurring novelty
 * series are excluded from candle capture to bound repo growth; they remain
 * in the registry, the open universe, and the tracker CSV).
 *
 * Usage: node scripts/collect-universe.mjs [--no-candles] [--max-candles N]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE, getJson, paginate, normalizeBar, compactMarket, compactSeries, isPoliticsSeries, sleep } from '../src/kalshi-live.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/kalshi/forward');
const argv = process.argv.slice(2);
const NO_CANDLES = argv.includes('--no-candles');
const maxCandlesArg = argv.indexOf('--max-candles');
const MAX_NEW_CANDLES = maxCandlesArg >= 0 ? Number(argv[maxCandlesArg + 1]) : 400;

const now = new Date();
const day = now.toISOString().slice(0, 10);
const capturedAt = now.toISOString();
const SEED_MIN_CLOSE = '2026-01-01T00:00:00Z';
const CANDLE_WINDOW_DAYS = 95; // T-95d .. close+2d: covers every backtest lead time (T-1..T-60) + convergence

const errors = [];
const log = (...a) => console.log('[universe]', ...a);

function readJsonIfExists(p) {
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; }
}

async function fetchSeriesRegistry() {
  log('fetching full /series registry…');
  const all = await paginate((c) => `/series?limit=200${c ? `&cursor=${encodeURIComponent(c)}` : ''}`, 'series');
  const compact = all.map(compactSeries);
  const politics = compact.filter((s) => {
    const full = all.find((x) => x.ticker === s.ticker);
    return full ? isPoliticsSeries(full) : false;
  });
  return { all: compact, politics };
}

async function fetchOpenMarkets(seriesTicker) {
  // Prefer the server-side status filter; if the API rejects it, fall back to a client-side filter.
  try {
    return await paginate(
      (c) => `/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=open&limit=200${c ? `&cursor=${encodeURIComponent(c)}` : ''}`,
      'markets',
    );
  } catch (e) {
    if (!/HTTP 4\d\d/.test(String(e.message))) throw e;
    const all = await paginate(
      (c) => `/markets?series_ticker=${encodeURIComponent(seriesTicker)}&limit=200${c ? `&cursor=${encodeURIComponent(c)}` : ''}`,
      'markets',
    );
    return all.filter((m) => m.status === 'open');
  }
}

async function fetchSettled2026(seriesTicker) {
  // Both tiers: markets settled after the historical cutoff are on the live
  // tier; earlier 2026 settlements live on /historical.
  const live = await paginate(
    (c) => `/markets?series_ticker=${encodeURIComponent(seriesTicker)}&status=settled&limit=200${c ? `&cursor=${encodeURIComponent(c)}` : ''}`,
    'markets',
  ).catch((e) => { errors.push(`settled(live) ${seriesTicker}: ${e.message}`); return []; });
  const hist = await paginate(
    (c) => `/historical/markets?series_ticker=${encodeURIComponent(seriesTicker)}&limit=200${c ? `&cursor=${encodeURIComponent(c)}` : ''}`,
    'markets',
  ).catch((e) => { errors.push(`settled(hist) ${seriesTicker}: ${e.message}`); return []; });
  const byTicker = new Map();
  for (const m of [...live, ...hist]) {
    if (!m || !m.ticker) continue;
    if ((m.status === 'settled' || m.status === 'finalized') && m.close_time && m.close_time >= SEED_MIN_CLOSE) {
      if (!byTicker.has(m.ticker)) byTicker.set(m.ticker, m);
    }
  }
  return [...byTicker.values()];
}

async function fetchCandles(market) {
  const closeTs = Math.floor(Date.parse(market.close_time) / 1000);
  const startTs = closeTs - CANDLE_WINDOW_DAYS * 86400;
  const endTs = closeTs + 2 * 86400;
  const histPath = `/historical/markets/${encodeURIComponent(market.ticker)}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=1440`;
  try {
    const d = await getJson(histPath);
    return { bars: (d.candlesticks || []).map(normalizeBar), endpoint: 'historical' };
  } catch (e) {
    if (!/HTTP 4\d\d/.test(String(e.message))) throw e;
    const livePath = `/series/${encodeURIComponent(market.event_ticker?.split('-')[0] || '')}/markets/${encodeURIComponent(market.ticker)}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=1440`;
    try {
      const d = await getJson(livePath);
      return { bars: (d.candlesticks || []).map(normalizeBar), endpoint: 'live-series' };
    } catch (e2) {
      errors.push(`candles ${market.ticker}: ${e.message} / fallback ${e2.message}`);
      return null;
    }
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { all, politics } = await fetchSeriesRegistry();
  log(`registry: ${all.length} series total, ${politics.length} politics/elections`);

  writeFileSync(join(OUT, 'series-registry.json'), JSON.stringify({
    capturedFrom: `${API_BASE}/series?limit=200 (cursor-paginated)`,
    capturedAt,
    capturedBy: 'scripts/collect-universe.mjs',
    filter: 'political series = category/categories include Elections or Politics, or tags include US Elections/Elections (fields verbatim from the API)',
    count: all.length,
    politicsCount: politics.length,
    series: all,
  }, null, 1) + '\n');

  // --- open universe ---
  const openRows = [];
  const perSeries = {};
  for (const s of politics) {
    try {
      const ms = await fetchOpenMarkets(s.ticker);
      perSeries[s.ticker] = ms.length;
      for (const m of ms) openRows.push(compactMarket(m, s.ticker));
      await sleep(80);
    } catch (e) {
      errors.push(`open ${s.ticker}: ${e.message}`);
      perSeries[s.ticker] = null;
    }
  }
  log(`open universe: ${openRows.length} markets across ${politics.length} series`);
  writeFileSync(join(OUT, 'universe-open.json'), JSON.stringify({
    capturedFrom: `${API_BASE}/markets?series_ticker={each politics/elections series}&status=open (cursor-paginated)`,
    capturedAt,
    capturedBy: 'scripts/collect-universe.mjs',
    date: day,
    count: openRows.length,
    seriesQueried: politics.length,
    markets: openRows,
  }, null, 1) + '\n');

  // --- append-only daily price tracker (R3 forward calibration feed) ---
  const csvPath = join(OUT, 'open-prices.csv');
  const existing = existsSync(csvPath) ? readFileSync(csvPath, 'utf8') : '';
  const seen = new Set(existing.split('\n').slice(1).map((l) => l.split(',')[0] + '|' + l.split(',')[1]));
  const header = existing ? '' : 'date,ticker,event_ticker,series,yes_sub_title,yes_bid_dollars,yes_ask_dollars,last_price_dollars,volume,open_interest,close_time\n';
  let appended = 0;
  const lines = [];
  for (const r of openRows) {
    const key = `${day}|${r.ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const q = (v) => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`);
    lines.push([day, r.ticker, r.event_ticker || '', r.series || '', q(r.sub), r.bid ?? '', r.ask ?? '', r.last ?? '', r.vol ?? '', r.oi ?? '', r.close_time || ''].join(','));
    appended++;
  }
  if (header || lines.length) {
    const { appendFileSync } = await import('node:fs');
    if (header) appendFileSync(csvPath, header);
    appendFileSync(csvPath, lines.join('\n') + (lines.length ? '\n' : ''));
  }
  log(`tracker: appended ${appended} rows to open-prices.csv`);

  // --- settled-2026 seed with daily bars (R3 calibration on already-settled 2026 markets) ---
  const prevSeed = readJsonIfExists(join(OUT, 'settled-2026-seed.json'));
  const seed = {
    capturedFrom: `${API_BASE}/markets + /historical/markets (status=settled, close_time >= ${SEED_MIN_CLOSE}) + candlesticks period_interval=1440`,
    capturedAt,
    capturedBy: 'scripts/collect-universe.mjs',
    scope: 'category Elections series, frequency != daily; bars = T-95d..close+2d, normalised to the 17-field integer-cents layout (src/kalshi-data.js header)',
    markets: prevSeed?.markets || {},
    bars: prevSeed?.bars || {},
    candleEndpoint: prevSeed?.candleEndpoint || {},
    skipped: [],
  };
  const electionsSeries = politics.filter((s) => {
    const cats = [s.category, ...(s.categories || [])].filter(Boolean);
    return cats.includes('Elections') && s.frequency !== 'daily';
  });
  let newCandles = 0;
  for (const s of electionsSeries) {
    let settled;
    try {
      settled = await fetchSettled2026(s.ticker);
    } catch (e) {
      errors.push(`settled ${s.ticker}: ${e.message}`);
      continue;
    }
    for (const m of settled) {
      const row = {
        ticker: m.ticker, event_ticker: m.event_ticker, series: s.ticker,
        sub: m.yes_sub_title || null, result: m.result || null,
        status: m.status || null, close_time: m.close_time || null,
        settlement_ts: m.settlement_ts || null, expiration_value: m.expiration_value ?? null,
        volume: m.volume_fp ?? null, open_interest: m.open_interest_fp ?? null,
      };
      seed.markets[m.ticker] = row;
      if (!seed.bars[m.ticker] && !NO_CANDLES && m.close_time) {
        if (newCandles >= MAX_NEW_CANDLES) { seed.skipped.push(`${m.ticker} (max-candles ${MAX_NEW_CANDLES} reached this run)`); continue; }
        const got = await fetchCandles(m);
        if (got) {
          seed.bars[m.ticker] = got.bars;
          seed.candleEndpoint[m.ticker] = got.endpoint;
          newCandles++;
        }
        await sleep(80);
      }
    }
  }
  log(`settled-2026 seed: ${Object.keys(seed.markets).length} markets, ${Object.keys(seed.bars).length} with bars (+${newCandles} new this run)`);
  writeFileSync(join(OUT, 'settled-2026-seed.json'), JSON.stringify(seed, null, 1) + '\n');

  // --- run metadata ---
  const meta = {
    capturedFrom: API_BASE,
    capturedAt,
    capturedBy: 'scripts/collect-universe.mjs',
    date: day,
    seriesTotal: all.length,
    seriesPolitics: politics.length,
    openMarkets: openRows.length,
    trackerRowsAppended: appended,
    settled2026Markets: Object.keys(seed.markets).length,
    settled2026WithBars: Object.keys(seed.bars).length,
    newCandlesThisRun: newCandles,
    errors,
  };
  writeFileSync(join(OUT, `meta-${day}.json`), JSON.stringify(meta, null, 1) + '\n');
  log(errors.length ? `DONE with ${errors.length} errors (see meta-${day}.json)` : 'DONE, no errors');
  // Fail hard only when the core universe came back empty (nothing usable to commit).
  if (openRows.length === 0 && all.length === 0) process.exit(1);
}

main().catch((e) => { console.error('[universe] fatal:', e.message); process.exit(1); });
