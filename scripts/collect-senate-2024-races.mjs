#!/usr/bin/env node
/**
 * Elections — 2024 per-state Senate market capture (ROADMAP R2).
 * =====================================================================
 * Enumerates Kalshi's settled 2024 Senate race markets state-by-state from
 * the official historical tier and captures their daily candlesticks, so the
 * 2024 market backtest grows beyond the 3 chamber/presidential markets in
 * src/kalshi-data.js. Runs where general internet is available.
 *
 * Discovery is exhaustive over all 50 state codes for the SENATE{ST} series
 * pattern — a state without a series or without a 2024-cycle market is
 * recorded as such. Nothing is guessed or imputed. A market counts as
 * 2024-cycle when its close_time falls in [2024-11-01, 2025-02-01), which
 * also catches early-close settlements (markets close on the senator's
 * swearing-in, e.g. Ohio settled 2025-01-03).
 *
 * Candles: market open -> 2024-12-01 (covers the pre-election window, the
 * 2024-11-05 election day itself — addressing irregularity #11 for these
 * markets — and post-election convergence), normalised verbatim into the
 * repo's 17-field integer-cents layout (src/kalshi-data.js header).
 *
 * Output: data/kalshi/historical-2024/senate-races.json
 * Idempotent: if the output file already exists, the script does nothing
 * unless run with --force (verified historical captures are not rewritten).
 *
 * Usage: node scripts/collect-senate-2024-races.mjs [--force] [--states AZ,OH,…]
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE, getJson, paginate, normalizeBar, sleep } from '../src/kalshi-live.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'data/kalshi/historical-2024');
const OUT_FILE = join(OUT_DIR, 'senate-races.json');
const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const statesArg = argv.indexOf('--states') >= 0 ? argv[argv.indexOf('--states') + 1].split(',') : null;

export const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

const CYCLE_CLOSE_MIN = '2024-11-01T00:00:00Z';
const CYCLE_CLOSE_MAX = '2025-02-01T00:00:00Z';
const CANDLE_END_TS = Math.floor(Date.parse('2024-12-01T00:00:00Z') / 1000);

const capturedAt = new Date().toISOString();
const errors = [];
const log = (...a) => console.log('[senate-2024]', ...a);

async function main() {
  if (existsSync(OUT_FILE) && !FORCE) {
    log('capture already exists — skipping (use --force to re-capture). Nothing was rewritten.');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const states = statesArg || US_STATES;
  const out = {
    capturedFrom: `${API_BASE}/series/SENATE{ST} + ${API_BASE}/historical/markets?series_ticker=SENATE{ST} + ${API_BASE}/historical/markets/{ticker}/candlesticks?period_interval=1440`,
    capturedAt,
    capturedBy: 'scripts/collect-senate-2024-races.mjs',
    method: `Exhaustive over ${states.length} state codes; 2024-cycle = close_time in [${CYCLE_CLOSE_MIN}, ${CYCLE_CLOSE_MAX}); candles from market open through ${CANDLE_END_TS} (daily, period_interval=1440), normalised verbatim to the 17-field integer-cents layout documented in src/kalshi-data.js.`,
    cycleWindow: { closeTimeMin: CYCLE_CLOSE_MIN, closeTimeMax: CYCLE_CLOSE_MAX, candleEndTs: CANDLE_END_TS },
    states: {},
    series: {},
    markets: {},
    bars: {},
    errors,
  };

  for (const st of states) {
    const series = `SENATE${st}`;
    const rec = { series, seriesExists: null, markets2024: [], note: '' };
    out.states[st] = rec;
    try {
      const s = await getJson(`/series/${series}`);
      const so = s.series || s;
      rec.seriesExists = true;
      out.series[series] = {
        ticker: so.ticker, title: so.title, category: so.category, tags: so.tags || [],
        fee_type: so.fee_type, fee_multiplier: so.fee_multiplier ?? null,
        settlement_sources: (so.settlement_sources || []).map((x) => ({ name: x.name, url: x.url })),
        contract_terms_url: so.contract_terms_url || null,
        capturedFrom: `${API_BASE}/series/${series}`, capturedAt,
      };
    } catch (e) {
      if (/HTTP 404/.test(String(e.message))) { rec.seriesExists = false; rec.note = 'no SENATE{ST} series on the exchange'; log(`${st}: no series`); await sleep(60); continue; }
      errors.push(`${series} series: ${e.message}`);
      rec.note = `series fetch failed: ${e.message}`;
      continue;
    }
    await sleep(60);

    let hist;
    try {
      hist = await paginate((c) => `/historical/markets?series_ticker=${series}&limit=200${c ? `&cursor=${encodeURIComponent(c)}` : ''}`, 'markets');
    } catch (e) {
      errors.push(`${series} historical markets: ${e.message}`);
      rec.note = `historical markets fetch failed: ${e.message}`;
      continue;
    }
    const in2024 = hist.filter((m) => m.close_time && m.close_time >= CYCLE_CLOSE_MIN && m.close_time < CYCLE_CLOSE_MAX);
    rec.markets2024 = in2024.map((m) => m.ticker);
    if (hist.length && !in2024.length) rec.note = 'series exists but no market closed in the 2024 cycle window';
    for (const m of in2024) {
      out.markets[m.ticker] = {
        ticker: m.ticker, series, event_ticker: m.event_ticker,
        title: m.title || null, yes_sub_title: m.yes_sub_title || null, no_sub_title: m.no_sub_title || null,
        rules_primary: m.rules_primary || null, early_close_condition: m.early_close_condition || null,
        open_time: m.open_time || null, close_time: m.close_time || null,
        settlement_ts: m.settlement_ts || null, expiration_value: m.expiration_value ?? null,
        result: m.result || null, settlement_value_dollars: m.settlement_value_dollars ?? null,
        status: m.status || null, volume: m.volume_fp ?? null, open_interest: m.open_interest_fp ?? null,
        capturedFrom: `${API_BASE}/historical/markets?series_ticker=${series}`, capturedAt,
      };
      // candles: open -> 2024-12-01
      const startTs = Math.floor(Date.parse(m.open_time || m.created_time || '2024-08-01T00:00:00Z') / 1000);
      try {
        const d = await paginate(
          (c) => `/historical/markets/${encodeURIComponent(m.ticker)}/candlesticks?start_ts=${startTs}&end_ts=${CANDLE_END_TS}&period_interval=1440${c ? `&cursor=${encodeURIComponent(c)}` : ''}`,
          'candlesticks',
        );
        out.bars[m.ticker] = d.map(normalizeBar);
      } catch (e) {
        errors.push(`candles ${m.ticker}: ${e.message}`);
        out.bars[m.ticker] = null;
      }
      await sleep(80);
    }
    log(`${st}: ${in2024.length ? in2024.map((m) => m.ticker).join(', ') : 'no 2024-cycle markets'}`);
  }

  const nMarkets = Object.keys(out.markets).length;
  const nBars = Object.values(out.bars).filter((b) => b && b.length).length;
  log(`captured ${nMarkets} markets across ${Object.values(out.states).filter((s) => s.markets2024.length).length} states; bars for ${nBars}; ${errors.length} errors`);
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n');
  log(`wrote ${OUT_FILE.replace(ROOT + '/', '')}`);
  if (nMarkets === 0) process.exit(1); // a capture with zero markets is not publishable
}

main().catch((e) => { console.error('[senate-2024] fatal:', e.message); process.exit(1); });
