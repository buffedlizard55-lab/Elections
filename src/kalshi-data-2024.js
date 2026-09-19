/**
 * Elections — unified 2024 market universe (core 3 + per-state Senate)
 * =====================================================================
 * Merges the hand-transcribed core captures (src/kalshi-data.js: PRES-2024-DJT,
 * CONTROLH-2024-*, CONTROLS-2024-*) with the machine-captured per-state 2024
 * Senate markets (data/kalshi/historical/senate-2024.json, produced by
 * scripts/collect-senate-2024.mjs on a networked runner — ROADMAP R2).
 *
 * If the Senate file is absent the universe silently equals the core set and
 * `SENATE_2024_LOADED` is false — the backtest and contest report the universe
 * they actually ran on (never an assumed one).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETS_2024 as CORE_MARKETS, CANDLESTICKS_2024 as CORE_CANDLES } from './kalshi-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SENATE_2024_PATH = join(ROOT, 'data/kalshi/historical/senate-2024.json');

let senate = null;
if (existsSync(SENATE_2024_PATH)) {
  senate = JSON.parse(readFileSync(SENATE_2024_PATH, 'utf8'));
}

export const SENATE_2024_LOADED = !!senate;
export const SENATE_2024 = senate;

/** Only markets whose candles were captured and that have an official yes/no result enter the backtest. */
function usableSenateMarkets() {
  if (!senate) return {};
  const out = {};
  for (const [t, m] of Object.entries(senate.markets)) {
    const c = senate.candlesticks[t];
    if (!c || !c.bars || c.bars.length === 0) continue;
    if (m.result !== 'yes' && m.result !== 'no') continue;
    out[t] = m;
  }
  return out;
}

const senateMarkets = usableSenateMarkets();

export const MARKETS_2024_ALL = Object.freeze({ ...CORE_MARKETS, ...senateMarkets });
export const CANDLESTICKS_2024_ALL = Object.freeze({
  ...CORE_CANDLES,
  ...Object.fromEntries(Object.keys(senateMarkets).map((t) => [t, senate.candlesticks[t]])),
});

/** Per-series fee configuration captured from GET /series/{ticker} for the Senate series (M values). */
export const SENATE_SERIES_FEES = Object.freeze(senate ? senate.series : {});

/** Group labels used by the backtest/contest outputs. */
export function groupOf(ticker) {
  return CORE_MARKETS[ticker] ? 'core-2024' : 'senate-2024';
}

export function universeSummary() {
  const tickers = Object.keys(CANDLESTICKS_2024_ALL);
  return {
    total: tickers.length,
    core2024: tickers.filter((t) => groupOf(t) === 'core-2024').length,
    senate2024: tickers.filter((t) => groupOf(t) === 'senate-2024').length,
    senate2024Loaded: SENATE_2024_LOADED,
    senate2024CapturedAt: senate ? senate.capturedAt : null,
    senate2024Source: senate ? senate.capturedFrom : null,
    senate2024StatesWithMarkets: senate ? Object.entries(senate.states).filter(([, s]) => s.markets2024.length).map(([st]) => st) : [],
  };
}
