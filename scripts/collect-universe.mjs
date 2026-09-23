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
 * Runtime budget (irregularity #81, 2026-09-22)
 * --------------------------------------------
 * The workflow step that runs this script has a hard 25-minute timeout. Before
 * this revision the script fetched the ~4,200 politics series strictly one at a
 * time (measured 0.254 s/series = 3.94 req/s, so ~17.9 min for the open universe
 * alone) and then started the settled-2026 seed phase, which never got to its
 * writeFileSync: the runner killed the step mid-phase on both 2026-09-21 and
 * 2026-09-22, so settled-2026-seed.json stayed frozen at its 2026-09-19 content
 * (9,350 markets / 400 bars) while the step still reported "success" because of
 * continue-on-error. Two changes fix that class of failure for good:
 *
 *   1. Bounded concurrency (--concurrency, default 6) plus a process-wide token
 *      bucket in getJson() (src/kalshi-live.js) holding the aggregate GET rate
 *      under Kalshi's documented Basic-tier ceiling of 200 tokens/s at 10 tokens
 *      per request = 20 req/s
 *      (https://docs.kalshi.com/getting_started/rate_limits.md, read 2026-09-22).
 *   2. A wall-clock DEADLINE (--budget-minutes, default 20 < the step's 25). Each
 *      phase checks the remaining budget and stops enqueuing new work when it is
 *      exhausted. Whatever has been collected is still written, and the run
 *      records `budgetExhausted` + `phasesTruncated` in meta so a short capture is
 *      visible as data rather than inferred from a missing file.
 *
 * What live run 35796490195 (2026-09-22) then proved, and what it exposed
 * ----------------------------------------------------------------------
 * Confirmed fixed: the open phase completed 4225/4225 series and every artifact
 * was written — the step ran 34m30s and was never killed. But the same run
 * surfaced three defects that only a real capture could reveal:
 *
 *   #82 rate limiting. 6 workers x 3.94 req/s = 23.6 req/s, ABOVE the documented
 *       20 req/s ceiling; 18 series were dropped with HTTP 429 after exhausting
 *       their retries. Per-call `sleep(80)` bounds one worker, never the
 *       aggregate. Fixed with a process-wide token bucket + jittered backoff.
 *   #83 starvation. mapPool always restarts at index 0, so a truncated phase
 *       re-walks the same prefix forever: discovery stopped at 738/1890 and
 *       series 739..1890 would never have been reached on any future run. Fixed
 *       with a persisted rotating cursor (seed.discoveryCursor).
 *   #84 phase starvation. Discovery is unbounded (~41 min of work) and consumed
 *       the entire budget, leaving the candle phase 0/400 — so the bars that
 *       feed calibration stayed frozen at 400 since 2026-09-19. Fixed by
 *       reserving --candle-reserve (default 35%) of the budget for candles.
 *
 * Usage: node scripts/collect-universe.mjs [--no-candles] [--max-candles N]
 *                                          [--concurrency N] [--budget-minutes N]
 *                                          [--candle-reserve 0..0.9]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE, getJson, paginate, normalizeBar, compactMarket, compactSeries, isPoliticsSeries } from '../src/kalshi-live.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data/kalshi/forward');
const argv = process.argv.slice(2);
const NO_CANDLES = argv.includes('--no-candles');
const numArg = (flag, dflt) => {
  const i = argv.indexOf(flag);
  if (i < 0) return dflt;
  const v = Number(argv[i + 1]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
const MAX_NEW_CANDLES = numArg('--max-candles', 400);
const CONCURRENCY = Math.max(1, Math.floor(numArg('--concurrency', 6)));
const BUDGET_MINUTES = numArg('--budget-minutes', 20);
// Share of the remaining budget held back for the candle phase so unbounded
// discovery work can never starve it completely (irregularity #84).
const CANDLE_RESERVE_FRACTION = Math.min(0.9, Math.max(0, numArg('--candle-reserve', 0.35)));
// Aggregate GET ceiling enforced by the token bucket in src/kalshi-live.js.
const MAX_RPS = Number(process.env.KALSHI_MAX_RPS) > 0 ? Number(process.env.KALSHI_MAX_RPS) : 14;

const now = new Date();
const day = now.toISOString().slice(0, 10);
const capturedAt = now.toISOString();
const SEED_MIN_CLOSE = '2026-01-01T00:00:00Z';
const CANDLE_WINDOW_DAYS = 95; // T-95d .. close+2d: covers every backtest lead time (T-1..T-60) + convergence

const START_MS = Date.now();
const DEADLINE_MS = START_MS + BUDGET_MINUTES * 60_000;
const timeLeftMs = () => DEADLINE_MS - Date.now();
const outOfTime = () => timeLeftMs() <= 0;
const elapsedMin = () => (Date.now() - START_MS) / 60_000;

const errors = [];
const phasesTruncated = [];
const log = (...a) => console.log('[universe]', ...a);

/**
 * Run `worker` over `items` with at most `limit` in flight, stopping early when
 * the wall-clock budget is gone. Returns how many items were actually attempted
 * so the caller can record truncation honestly.
 */
async function mapPool(items, limit, worker, deadlineMs = DEADLINE_MS) {
  let next = 0;
  let attempted = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      if (Date.now() >= deadlineMs) return;
      attempted++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return attempted;
}

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

  // --- open universe (bounded concurrency, deadline-aware) ---
  const openRows = [];
  const perSeries = {};
  const openAttempted = await mapPool(politics, CONCURRENCY, async (s) => {
    try {
      const ms = await fetchOpenMarkets(s.ticker);
      perSeries[s.ticker] = ms.length;
      for (const m of ms) openRows.push(compactMarket(m, s.ticker));
      // No per-call sleep: pacing is enforced process-wide by the token bucket
      // in getJson(). A per-worker sleep does not bound the aggregate rate.
    } catch (e) {
      errors.push(`open ${s.ticker}: ${e.message}`);
      perSeries[s.ticker] = null;
    }
  });
  if (openAttempted < politics.length) {
    const msg = `open-universe phase stopped at ${openAttempted}/${politics.length} series after ${elapsedMin().toFixed(1)} min (budget ${BUDGET_MINUTES} min)`;
    phasesTruncated.push(msg);
    log(`WARNING: ${msg}`);
  }
  // Deterministic order regardless of completion order under concurrency, so the
  // committed file diffs cleanly day over day and the offline replay test is stable.
  openRows.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  log(`open universe: ${openRows.length} markets across ${openAttempted} series (${elapsedMin().toFixed(1)} min elapsed)`);
  writeFileSync(join(OUT, 'universe-open.json'), JSON.stringify({
    capturedFrom: `${API_BASE}/markets?series_ticker={each politics/elections series}&status=open (cursor-paginated)`,
    capturedAt,
    capturedBy: 'scripts/collect-universe.mjs',
    date: day,
    count: openRows.length,
    seriesQueried: openAttempted,
    seriesEligible: politics.length,
    complete: openAttempted === politics.length,
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
  }).sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));

  // Rotating start offset (irregularity #83, 2026-09-22).
  // ------------------------------------------------------------------
  // mapPool always walks its input from index 0, so a phase that runs out of
  // budget covers the SAME prefix on every subsequent run. Live run
  // 35796490195 stopped discovery at 738/1890 series; because the series list
  // is stable, series 739..1890 would never have been reached on any future
  // run, and the candle phase downstream of it would never get budget again
  // (settled2026WithBars was still 400, frozen since 2026-09-19).
  //
  // Persisting where the last run stopped and starting the next one there
  // turns a permanently starved tail into a round-robin that covers the whole
  // list over a few days. The rotation is recorded in the seed so the cycle is
  // auditable rather than implicit.
  const startAt = electionsSeries.length
    ? (Number.isInteger(prevSeed?.discoveryCursor) ? prevSeed.discoveryCursor : 0) % electionsSeries.length
    : 0;
  const rotated = startAt ? [...electionsSeries.slice(startAt), ...electionsSeries.slice(0, startAt)] : electionsSeries;
  if (startAt) log(`settled-2026 discovery resumes at index ${startAt}/${electionsSeries.length} (${rotated[0]?.ticker})`);

  let newCandles = 0;
  // Phase A — discover settled 2026 markets (bounded concurrency, deadline-aware).
  const pendingCandles = [];
  // Reserve a slice of the budget for the candle phase (irregularity #84).
  // Discovery is unbounded work (1,890 series, ~41 min at the observed rate) and
  // will always consume every minute it is offered. In live run 35796490195 it
  // did exactly that and the candle phase got 0/400 markets — so the bars that
  // actually feed calibration never grow. Capping discovery at a fraction of the
  // remaining budget guarantees the candle phase always makes progress.
  const candleReserveMs = Math.max(0, timeLeftMs()) * CANDLE_RESERVE_FRACTION;
  const discoveryDeadline = DEADLINE_MS - candleReserveMs;
  const seedAttempted = await mapPool(rotated, CONCURRENCY, async (s) => {
    let settled;
    try {
      settled = await fetchSettled2026(s.ticker);
    } catch (e) {
      errors.push(`settled ${s.ticker}: ${e.message}`);
      return;
    }
    for (const m of settled) {
      seed.markets[m.ticker] = {
        ticker: m.ticker, event_ticker: m.event_ticker, series: s.ticker,
        sub: m.yes_sub_title || null, result: m.result || null,
        status: m.status || null, close_time: m.close_time || null,
        settlement_ts: m.settlement_ts || null, expiration_value: m.expiration_value ?? null,
        volume: m.volume_fp ?? null, open_interest: m.open_interest_fp ?? null,
      };
      if (!seed.bars[m.ticker] && !NO_CANDLES && m.close_time) pendingCandles.push(m);
    }
  }, discoveryDeadline);
  // Where the NEXT run should begin: just past the last series this run attempted.
  // A complete sweep resets to 0 so a healthy run always starts at the top.
  seed.discoveryCursor = seedAttempted >= electionsSeries.length || !electionsSeries.length
    ? 0
    : (startAt + seedAttempted) % electionsSeries.length;
  if (seedAttempted < electionsSeries.length) {
    const msg = `settled-2026 discovery stopped at ${seedAttempted}/${electionsSeries.length} Elections series after ${elapsedMin().toFixed(1)} min (budget ${BUDGET_MINUTES} min); next run resumes at index ${seed.discoveryCursor}`;
    phasesTruncated.push(msg);
    log(`WARNING: ${msg}`);
  }

  // Phase B — candles for newly discovered markets, oldest close first so the
  // accumulating seed fills in a stable, reproducible order across runs. Ticker
  // breaks close_time ties: discovery order is nondeterministic under concurrency,
  // so without the tiebreak two runs could pick different markets at the cap.
  pendingCandles.sort((a, b) => (a.close_time < b.close_time ? -1 : a.close_time > b.close_time ? 1
    : a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0));
  const candleTargets = pendingCandles.slice(0, MAX_NEW_CANDLES);
  for (const m of pendingCandles.slice(MAX_NEW_CANDLES)) {
    seed.skipped.push(`${m.ticker} (max-candles ${MAX_NEW_CANDLES} reached this run)`);
  }
  const candlesAttempted = await mapPool(candleTargets, CONCURRENCY, async (m) => {
    const got = await fetchCandles(m);
    if (got) {
      seed.bars[m.ticker] = got.bars;
      seed.candleEndpoint[m.ticker] = got.endpoint;
      newCandles++;
    }
  }, DEADLINE_MS);
  if (candlesAttempted < candleTargets.length) {
    const msg = `candle phase stopped at ${candlesAttempted}/${candleTargets.length} new markets after ${elapsedMin().toFixed(1)} min (budget ${BUDGET_MINUTES} min)`;
    phasesTruncated.push(msg);
    log(`WARNING: ${msg}`);
    for (const m of candleTargets.slice(candlesAttempted)) seed.skipped.push(`${m.ticker} (time budget exhausted this run)`);
  }
  // Key order in the written JSON must not depend on which worker finished first,
  // or the committed diff churns every day for no substantive reason.
  const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  seed.markets = sortKeys(seed.markets);
  seed.bars = sortKeys(seed.bars);
  seed.candleEndpoint = sortKeys(seed.candleEndpoint);
  seed.skipped.sort();
  log(`settled-2026 seed: ${Object.keys(seed.markets).length} markets, ${Object.keys(seed.bars).length} with bars (+${newCandles} new this run, ${elapsedMin().toFixed(1)} min elapsed)`);
  writeFileSync(join(OUT, 'settled-2026-seed.json'), JSON.stringify(seed, null, 1) + '\n');

  // --- run metadata ---
  const meta = {
    capturedFrom: API_BASE,
    capturedAt,
    capturedBy: 'scripts/collect-universe.mjs',
    date: day,
    seriesTotal: all.length,
    seriesPolitics: politics.length,
    seriesPoliticsQueried: openAttempted,
    openMarkets: openRows.length,
    trackerRowsAppended: appended,
    settled2026Markets: Object.keys(seed.markets).length,
    settled2026WithBars: Object.keys(seed.bars).length,
    newCandlesThisRun: newCandles,
    // Runtime budget accounting (irregularity #81): a short capture must be
    // visible in the record, never inferred from a file that failed to update.
    runtime: {
      concurrency: CONCURRENCY,
      budgetMinutes: BUDGET_MINUTES,
      maxRequestsPerSecond: MAX_RPS,
      candleReserveFraction: CANDLE_RESERVE_FRACTION,
      elapsedMinutes: Number(elapsedMin().toFixed(2)),
      budgetExhausted: outOfTime(),
      complete: phasesTruncated.length === 0,
      phasesTruncated,
      // Round-robin state for the settled-2026 discovery sweep (irregularity #83):
      // where this run began and where the next one will pick up.
      discoveryStartedAt: startAt,
      discoveryCursorNext: seed.discoveryCursor,
      rateLimited429: errors.filter((e) => /HTTP 429/.test(e)).length,
    },
    // Sorted: workers finish in arbitrary order, and an unsorted error list would
    // make two otherwise identical runs produce different files.
    errors: [...errors].sort(),
  };
  writeFileSync(join(OUT, `meta-${day}.json`), JSON.stringify(meta, null, 1) + '\n');
  log(`runtime: ${elapsedMin().toFixed(1)} min of ${BUDGET_MINUTES} min budget at concurrency ${CONCURRENCY}; ${phasesTruncated.length ? `${phasesTruncated.length} phase(s) truncated` : 'all phases complete'}`);
  log(errors.length ? `DONE with ${errors.length} errors (see meta-${day}.json)` : 'DONE, no errors');
  // Fail hard only when the core universe came back empty (nothing usable to commit).
  if (openRows.length === 0 && all.length === 0) process.exit(1);
}

main().catch((e) => { console.error('[universe] fatal:', e.message); process.exit(1); });
