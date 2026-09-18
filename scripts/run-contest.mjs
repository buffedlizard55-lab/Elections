#!/usr/bin/env node
/**
 * Run the paper-trading contest (The Leap model) on the captured 2024
 * Kalshi election markets and write data/contest-results.json.
 * Deterministic; no network.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETS_2024, CANDLESTICKS_2024 } from '../src/kalshi-data.js';
import { STRATEGIES } from '../src/contest/strategies.js';
import { runStrategy, STARTING_CAPITAL, FILL_CAP_OF_BAR_VOLUME } from '../src/contest/engine.js';
import { nationalMargin, marginToProb, loadNationalAverages } from '../src/poll-backtest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CANDLE_TICKERS = Object.keys(CANDLESTICKS_2024);

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

const results = STRATEGIES.map((strategy) => {
  const markets = {};
  const candlesticks = {};
  for (const t of CANDLE_TICKERS) markets[t] = MARKETS_2024[t];
  for (const t of CANDLE_TICKERS) candlesticks[t] = CANDLESTICKS_2024[t];
  return runStrategy({ strategy, markets, candlesticks, pollSignal });
});

const ranked = results.filter((r) => r.ranked).sort((a, b) => b.realizedPnl - a.realizedPnl);
const out = {
  generatedAt: new Date().toISOString(),
  model: {
    name: 'The Leap (paper) — election markets adaptation',
    source: 'https://www.tradingview.com/the-leap/crypto-series-may-2026/ (contest mechanics, verified 2026-09-18)',
    startingCapitalPerEntrant: STARTING_CAPITAL,
    fillCap: FILL_CAP_OF_BAR_VOLUME,
    fees: 'Kalshi official quadratic taker schedule (src/fees.js); M=1 for PRES/CONTROLH/CONTROLS (captured GET /series)',
    ranking: 'realized P&L at settlement; 0-trade entrants unranked',
    universe: CANDLE_TICKERS,
    note: 'NO-side fills are derived reciprocal prices (1 - yesClose) and labeled per fill. No-trade bars are refused.',
  },
  pollSignal,
  inputs: [
    { path: 'src/kalshi-data.js', source: 'https://api.elections.kalshi.com/trade-api/v2/historical/... (per-market capturedFrom fields inside)' },
    { path: 'src/fees.js', source: 'https://kalshi.com/docs/kalshi-fee-schedule.pdf' },
    { path: 'data/polls/538-national-averages.csv', source: 'https://github.com/fivethirtyeight/data/blob/master/polls/2024-averages/presidential_general_averages_2024-09-12_uncorrected.csv' },
  ],
  results,
  leaderboard: ranked.map((r, i) => ({ rank: i + 1, username: r.username, finalEquity: r.finalEquity, realizedPnl: r.realizedPnl, realizedPnlPct: r.realizedPnlPct, feesPaid: r.feesPaid, trades: r.trades })),
  unranked: results.filter((r) => !r.ranked).map((r) => r.username),
};

const dir = join(ROOT, 'data');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'contest-results.json'), JSON.stringify(out, null, 2) + '\n');
console.log('wrote data/contest-results.json');
console.log('leaderboard:');
for (const row of out.leaderboard) console.log(`  #${row.rank} ${row.username}: $${row.finalEquity} (${row.realizedPnlPct}%)`);
console.log('unranked:', out.unranked.join(', ') || 'none');
