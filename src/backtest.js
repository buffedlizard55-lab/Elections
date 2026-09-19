/**
 * Elections — Market backtest engine
 * =====================================================================
 * Backtests Kalshi election markets against their official settlement
 * outcomes. No randomness. No look-ahead: at "T-N days" only data with
 * endPeriodTs <= that date's close is used (last known trade close).
 *
 * Universe (src/kalshi-data-2024.js): the 3 hand-transcribed core markets
 * (presidency + both chamber controls) plus every machine-captured 2024
 * per-state Senate race market with candles and an official yes/no result
 * (ROADMAP R2). Each output row says which group it belongs to.
 *
 * Metrics per (market, lead time):
 *   brier   — (p - outcome)^2
 *   logloss — -o*ln(p) - (1-o)*ln(1-p), p clipped to [1e-4, 1-1e-4]
 *   holdPnl — dollars per contract if you bought YES at p and held to
 *             settlement: (1-p) if yes, (-p) if no.
 * Plus a daily (date, p) series for charting, a per-lead aggregate (overall
 * and per group), and a pooled calibration table across markets.
 */

import { parseBar } from './kalshi-data.js';
import { MARKETS_2024_ALL, CANDLESTICKS_2024_ALL, groupOf, universeSummary } from './kalshi-data-2024.js';

export const ELECTION_DAY_TS = 1730851200; // 2024-11-05T00:00:00Z
const ELECTION_DAY_TS_INTERNAL = ELECTION_DAY_TS;
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
 * @returns {{ticker, title, group, outcomeIsYes, series: Array<{date, ts, p}>, leadTimes: Array<object>}}
 */
export function backtestMarket(ticker, markets = MARKETS_2024_ALL, candlesticks = CANDLESTICKS_2024_ALL) {
  const market = markets[ticker];
  const { bars } = candlesticks[ticker];
  const outcomeIsYes = market.result === 'yes';

  const series = [];
  for (const raw of bars) {
    const bar = parseBar(raw);
    if (bar.price.close !== null) series.push({ date: bar.date, ts: bar.endPeriodTs, p: bar.price.close });
  }
  // Pre-election series only (bars ending on or before election day 00:00Z + 1 day
  // are the trading days through Nov 4; the Nov 5 bar ends 05:00Z Nov 6).
  const preElection = series.filter((pt) => pt.date <= '2024-11-05');

  const leadTimes = LEAD_TIMES_DAYS.map((nDays) => {
    const ts = ELECTION_DAY_TS_INTERNAL - nDays * 86400;
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

  const calibration = calibrateDaily(preElection, outcomeIsYes);

  return {
    ticker,
    title: market.title,
    group: groupOf(ticker),
    state: market.state || null,
    yesSubTitle: market.yes_sub_title || null,
    outcomeIsYes,
    result: market.result,
    settlementTs: market.settlementTs || null,
    volume: market.totalVolumeContracts ?? null,
    series,
    barsTotal: bars.length,
    barsPreElection: preElection.length,
    electionDayBarCaptured: series.some((pt) => pt.date === '2024-11-05'),
    leadTimes,
    calibration,
  };
}

/**
 * Daily calibration: for each price bucket, how often the market's daily close
 * landed in that bucket (descriptive spread for a single market).
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

/**
 * Pooled calibration across markets: every pre-election (day, market) close is
 * an observation (p, outcome). Buckets report mean p vs observed YES rate.
 * NOTE: D and R sides of the same race are complementary observations; the
 * table is the exchange's own "priced at X% happens X%" construction, which
 * pools all contracts. The de-duplicated variant keeps only the higher-volume
 * side of each event.
 */
export function pooledCalibration(marketResults, { dedupe = false } = {}) {
  let list = marketResults;
  if (dedupe) {
    const byEvent = new Map();
    for (const m of marketResults) {
      const ev = (MARKETS_2024_ALL[m.ticker] && MARKETS_2024_ALL[m.ticker].event) || m.ticker;
      const prev = byEvent.get(ev);
      if (!prev || (m.volume || 0) > (prev.volume || 0)) byEvent.set(ev, m);
    }
    list = [...byEvent.values()];
  }
  const buckets = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10, n: 0, sumP: 0, yes: 0, markets: new Set() }));
  for (const m of list) {
    const o = m.outcomeIsYes ? 1 : 0;
    for (const pt of m.series) {
      if (pt.date > '2024-11-04') continue; // strictly pre-election-day closes
      const i = Math.min(9, Math.floor(pt.p * 10));
      buckets[i].n += 1; buckets[i].sumP += pt.p; buckets[i].yes += o; buckets[i].markets.add(m.ticker);
    }
  }
  return {
    dedupe,
    marketsUsed: list.length,
    buckets: buckets.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, markets: b.markets.size, meanP: b.n ? b.sumP / b.n : null, observedYesRate: b.n ? b.yes / b.n : null })),
  };
}

function aggregateLeads(markets) {
  return LEAD_TIMES_DAYS.map((nDays) => {
    const vals = markets.map((m) => m.leadTimes.find((lt) => lt.nDays === nDays)).filter((v) => v && v.p !== null);
    if (vals.length === 0) {
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
}

/**
 * Favorite accuracy at a lead: among markets priced >= 0.5 (favorite side YES)
 * or < 0.5 (favorite side NO), how often did the favorite side win?
 */
function favoriteAccuracy(markets, nDays) {
  let n = 0; let hits = 0;
  for (const m of markets) {
    const lt = m.leadTimes.find((x) => x.nDays === nDays);
    if (!lt || lt.p === null || lt.p === 0.5) continue;
    n += 1;
    const favoriteIsYes = lt.p > 0.5;
    if (favoriteIsYes === m.outcomeIsYes) hits += 1;
  }
  return { nDays, n, hits, rate: n ? hits / n : null };
}

/** Aggregate backtest across all captured 2024 markets. */
export function runAllBacktests() {
  const markets = Object.keys(CANDLESTICKS_2024_ALL).map((t) => backtestMarket(t));
  const groups = {};
  for (const g of ['core-2024', 'senate-2024']) {
    const sub = markets.filter((m) => m.group === g);
    groups[g] = { nMarkets: sub.length, aggregate: aggregateLeads(sub), favoriteAccuracy: LEAD_TIMES_DAYS.map((n) => favoriteAccuracy(sub, n)) };
  }
  return {
    universe: universeSummary(),
    markets,
    aggregate: aggregateLeads(markets),
    favoriteAccuracy: LEAD_TIMES_DAYS.map((n) => favoriteAccuracy(markets, n)),
    groups,
    pooledCalibration: pooledCalibration(markets),
    pooledCalibrationDeduped: pooledCalibration(markets, { dedupe: true }),
    electionDayTs: ELECTION_DAY_TS,
  };
}
