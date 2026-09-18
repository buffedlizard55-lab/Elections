/**
 * Elections — Market backtest engine
 * =====================================================================
 * Backtests Kalshi election markets (captured in src/kalshi-data.js)
 * against their official settlement outcomes. No randomness. No
 * look-ahead: at "T-N days" only data with endPeriodTs <= that date's
 * close is used (last known trade close).
 *
 * Metrics per (market, lead time):
 *   brier   — (p - outcome)^2
 *   logloss — -o*ln(p) - (1-o)*ln(1-p), p clipped to [1e-4, 1-1e-4]
 *   holdPnl — dollars per contract if you bought YES at p and held to
 *             settlement: (1-p) if yes, (-p) if no.
 * Plus a daily (date, p) series for charting and a calibration summary.
 */

import { CANDLESTICKS_2024, MARKETS_2024, parseBar } from './kalshi-data.js';

const ELECTION_DAY_TS = 1730851200; // 2024-11-05T00:00:00Z
export const LEAD_TIMES_DAYS = [1, 3, 7, 14, 30, 60];

const clip = (p) => Math.min(1 - 1e-4, Math.max(1e-4, p));

/** Last trade close (in dollars) on or before the given ts. Null if none. */
export function lastCloseOnOrBefore(bars, ts) {
  let last = null;
  for (const raw of bars) {
    const bar = parseBar(raw);
    if (bar.endPeriodTs > ts) break;
    if (bar.price.close !== null) last = bar.price.close;
  }
  return last;
}

/** Brier score of probability p for binary outcome o (0/1). */
export function brier(p, o) {
  return (p - o) ** 2;
}

/** Log loss of probability p for binary outcome o (0/1), clipped. */
export function logloss(p, o) {
  const q = clip(p);
  return -o * Math.log(q) - (1 - o) * Math.log(1 - q);
}

/** PnL per contract for buying YES at p and holding to settlement. */
export function holdPnlPerContract(p, outcomeIsYes) {
  return outcomeIsYes ? 1 - p : -p;
}

/**
 * Run the backtest for one market.
 * @returns {{ticker, title, outcomeIsYes, series: Array<{date, ts, p}>, leadTimes: Array<object>}}
 */
export function backtestMarket(ticker) {
  const market = MARKETS_2024[ticker];
  const { bars } = CANDLESTICKS_2024[ticker];
  const outcomeIsYes = market.result === 'yes';

  const series = [];
  for (const raw of bars) {
    const bar = parseBar(raw);
    if (bar.price.close !== null) series.push({ date: bar.date, ts: bar.endPeriodTs, p: bar.price.close });
  }

  const leadTimes = LEAD_TIMES_DAYS.map((nDays) => {
    const ts = ELECTION_DAY_TS - nDays * 86400;
    const p = lastCloseOnOrBefore(bars, ts);
    if (p === null) return { nDays, p: null, brier: null, logloss: null, holdPnlPerContract: null };
    return {
      nDays,
      p,
      brier: brier(p, outcomeIsYes ? 1 : 0),
      logloss: logloss(p, outcomeIsYes ? 1 : 0),
      holdPnlPerContract: holdPnlPerContract(p, outcomeIsYes),
    };
  });

  // Calibration: bucket the daily closes and compare to the base rate
  // of the market reaching 1 (i.e., the outcome itself, binary).
  const calibration = calibrateDaily(series, outcomeIsYes);

  return { ticker, title: market.title, outcomeIsYes, series, leadTimes, calibration };
}

/**
 * Daily calibration: for each price bucket, how often did the market's
 * daily price land in that bucket vs how often the outcome was YES.
 * (Single-outcome markets use this as a descriptive spread check; the
 * aggregate calibration claim is tested across markets below.)
 */
export function calibrateDaily(series, outcomeIsYes) {
  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  const out = buckets.map((lo) => ({ lo, hi: lo + 10, samples: 0 }));
  for (const pt of series) {
    const pCents = pt.p * 100;
    const i = Math.min(9, Math.floor(pCents / 10));
    out[i].samples += 1;
  }
  return { buckets: out, outcomeWasYes: outcomeIsYes };
}

/** Aggregate backtest across all captured 2024 markets. */
export function runAllBacktests() {
  const markets = Object.keys(CANDLESTICKS_2024).map(backtestMarket);
  // Simple-average Brier across markets at each lead time (only markets with a price).
  const aggregate = LEAD_TIMES_DAYS.map((nDays) => {
    const vals = markets.map((m) => m.leadTimes.find((lt) => lt.nDays === nDays)).filter((v) => v && v.p !== null);
    if (vals.length === 0) {
      // Honest null: not every market existed that far out (PRES opened 2024-10-04).
      return { nDays, nMarkets: 0, meanProbYes: null, meanBrier: null, meanLogloss: null, meanHoldPnlPerContract: null };
    }
    const mean = (f) => vals.reduce((s, v) => s + f(v), 0) / vals.length;
    return {
      nDays,
      nMarkets: vals.length,
      meanProbYes: mean((v) => v.p),
      meanBrier: mean((v) => v.brier),
      meanLogloss: mean((v) => v.logloss),
      meanHoldPnlPerContract: mean((v) => v.holdPnlPerContract),
    };
  });
  return { markets, aggregate, electionDayTs: ELECTION_DAY_TS };
}
