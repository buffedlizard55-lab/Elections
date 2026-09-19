#!/usr/bin/env node
/**
 * Run the paper-trading contest (The Leap model) on the captured 2024
 * Kalshi election markets and write data/contest-results.json.
 * Deterministic; no network.
 *
 * Two universes are scored so the 2026-09-18 pilot stays reproducible:
 *   core-2024  — PRES-2024-DJT, CONTROLH-2024-R, CONTROLS-2024-R (the pilot)
 *   all-2024   — core + every captured per-state 2024 Senate market (R2)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETS_2024, CANDLESTICKS_2024 } from '../src/kalshi-data.js';
import { MARKETS_2024_ALL, CANDLESTICKS_2024_ALL, SENATE_SERIES_FEES, universeSummary } from '../src/kalshi-data-2024.js';
import { STRATEGIES } from '../src/contest/strategies.js';
import { runStrategy, STARTING_CAPITAL, FILL_CAP_OF_BAR_VOLUME, MIN_TRADING_DAYS_TO_RANK } from '../src/contest/engine.js';
import { registerSeriesFees } from '../src/fees.js';
import { nationalMargin, marginToProb, loadNationalAverages } from '../src/poll-backtest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const feesRegistered = registerSeriesFees(SENATE_SERIES_FEES);

// Poll anchor for the poll-driven strategy (last verified 538 national average).
const byDate = loadNationalAverages(join(ROOT, 'data/polls/538-national-averages.csv'));
const dates = [...byDate.keys()].sort();
const anchorDate = dates[dates.length - 1];
const anchorMargin = nationalMargin(byDate, anchorDate);
const pollSignal = {
  anchorDate,
  margin: anchorMargin,
  trumpProb: marginToProb(anchorMargin),
  source: 'data/polls/538-national-averages.csv (final 538 national average, 2024-09-12)',
};

function runUniverse(name, marketsAll, candlesAll) {
  const tickers = Object.keys(candlesAll);
  const markets = {};
  const candlesticks = {};
  for (const t of tickers) { markets[t] = marketsAll[t]; candlesticks[t] = candlesAll[t]; }
  const results = STRATEGIES.map((strategy) => runStrategy({ strategy, markets, candlesticks, pollSignal }));
  const ranked = results.filter((r) => r.ranked).sort((a, b) => b.realizedPnl - a.realizedPnl);
  return {
    name,
    universe: tickers,
    universeSize: tickers.length,
    results,
    leaderboard: ranked.map((r, i) => ({ rank: i + 1, username: r.username, finalEquity: r.finalEquity, realizedPnl: r.realizedPnl, realizedPnlPct: r.realizedPnlPct, feesPaid: r.feesPaid, trades: r.trades, tradingDays: r.tradingDays, marketsTraded: r.marketsTraded })),
    unranked: results.filter((r) => !r.ranked).map((r) => ({ username: r.username, reason: r.unrankedReason })),
  };
}

const core = runUniverse('core-2024', MARKETS_2024, CANDLESTICKS_2024);
const all = runUniverse('all-2024', MARKETS_2024_ALL, CANDLESTICKS_2024_ALL);

const out = {
  generatedAt: new Date().toISOString(),
  model: {
    name: 'The Leap (paper) — election markets adaptation',
    source: 'https://www.tradingview.com/the-leap/crypto-series-may-2026/ (contest mechanics, verified 2026-09-18)',
    startingCapitalPerEntrant: STARTING_CAPITAL,
    fillCap: FILL_CAP_OF_BAR_VOLUME,
    minTradingDaysToRank: MIN_TRADING_DAYS_TO_RANK,
    fees: `Kalshi official quadratic taker schedule (src/fees.js); M=1 for PRES/CONTROLH/CONTROLS (captured GET /series); ${feesRegistered} SENATE{ST} series fee configs registered from data/kalshi/historical/senate-2024.json`,
    ranking: 'realized P&L at settlement; entrants with fewer than the minimum trading days are unranked (reported with reason)',
    note: 'NO-side fills are derived reciprocal prices (1 - yesClose) and labeled per fill. No-trade bars are refused.',
  },
  universeSummary: universeSummary(),
  pollSignal,
  inputs: [
    { path: 'src/kalshi-data.js', source: 'https://api.elections.kalshi.com/trade-api/v2/historical/... (per-market capturedFrom fields inside)' },
    { path: 'data/kalshi/historical/senate-2024.json', source: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets?series_ticker=SENATE{ST} (+ candlesticks; per-object capturedFrom inside)' },
    { path: 'src/fees.js', source: 'https://kalshi.com/docs/kalshi-fee-schedule.pdf' },
    { path: 'data/polls/538-national-averages.csv', source: 'https://github.com/fivethirtyeight/data/blob/master/polls/2024-averages/presidential_general_averages_2024-09-12_uncorrected.csv' },
  ],
  // Backwards-compatible top level = the pilot universe (core-2024)
  results: core.results,
  leaderboard: core.leaderboard,
  unranked: core.unranked.map((u) => u.username),
  universes: { 'core-2024': core, 'all-2024': all },
};

const dir = join(ROOT, 'data');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'contest-results.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote data/contest-results.json');
for (const u of [core, all]) {
  console.log(`leaderboard [${u.name}] (${u.universeSize} markets):`);
  for (const row of u.leaderboard) console.log(`  #${row.rank} ${row.username}: $${row.finalEquity} (${row.realizedPnlPct}%) trades=${row.trades} days=${row.tradingDays}`);
  console.log('  unranked:', u.unranked.map((x) => `${x.username} (${x.reason})`).join(', ') || 'none');
}
