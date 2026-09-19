/**
 * Elections — Live calibration tracker (ROADMAP R3)
 * =====================================================================
 * Scores the forward-collected daily prices of open Kalshi political markets
 * against their eventual official settlements ("track expected vs actual").
 *
 * Inputs (all produced by scripts/collect-kalshi.mjs; nothing is invented):
 *   dailyRows   — rows of data/kalshi/tracker/daily/YYYY-MM-DD.csv
 *                 {date, ticker, yes_bid, yes_ask, last_price, ...} (dollars)
 *   settlements — {ticker: {result: 'yes'|'no', settlement_ts, close_time, title, ...}}
 *
 * Outputs (pure function of the inputs; deterministic):
 *   perMarket   — for every settled market: implied p at each lead time
 *                 (last observation on or before settlement_date - N days),
 *                 Brier and log-loss per lead.
 *   byLead      — mean Brier/log-loss/N over markets that had a price at that lead.
 *   pooled      — calibration curve pooling EVERY (day, market) observation:
 *                 10 price buckets -> observed YES frequency. This is the
 *                 construction behind the exchange's "priced at 70% it happens
 *                 ~70% of the time" claim, re-tested here on forward data.
 *   The empty state (no settlements yet) is reported explicitly, never padded.
 */

import { impliedProb } from './kalshi-api.js';

export const LEAD_DAYS = [1, 3, 7, 14, 30];
const clip = (p) => Math.min(1 - 1e-4, Math.max(1e-4, p));
export const brier = (p, o) => (p - o) ** 2;
export const logloss = (p, o) => { const q = clip(p); return -o * Math.log(q) - (1 - o) * Math.log(1 - q); };

/** Group rows by ticker -> sorted [{date, p, basis}] using the documented implied-probability rule. */
export function seriesByTicker(dailyRows) {
  const out = new Map();
  for (const r of dailyRows) {
    const row = {
      yes_bid: r.yes_bid === '' || r.yes_bid == null ? null : Number(r.yes_bid),
      yes_ask: r.yes_ask === '' || r.yes_ask == null ? null : Number(r.yes_ask),
      last_price: r.last_price === '' || r.last_price == null ? null : Number(r.last_price),
    };
    const { p, basis } = impliedProb(row);
    if (p === null) continue;
    if (!out.has(r.ticker)) out.set(r.ticker, []);
    out.get(r.ticker).push({ date: r.date, p, basis });
  }
  for (const arr of out.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

const isoDay = (ts) => new Date(ts).toISOString().slice(0, 10);
const shiftDays = (day, n) => isoDay(Date.parse(day + 'T00:00:00Z') + n * 86400000);

/** Last observation with date <= cutoffDay, or null. */
export function lastOnOrBefore(series, cutoffDay) {
  let last = null;
  for (const pt of series) {
    if (pt.date > cutoffDay) break;
    last = pt;
  }
  return last;
}

/**
 * @param {Array<object>} dailyRows
 * @param {Record<string, object>} settlements
 * @param {number[]} [leads]
 */
export function scoreCalibration(dailyRows, settlements, leads = LEAD_DAYS) {
  const series = seriesByTicker(dailyRows);
  const perMarket = [];
  for (const [ticker, s] of Object.entries(settlements)) {
    if (s.result !== 'yes' && s.result !== 'no') continue; // only binary official results are scored
    const o = s.result === 'yes' ? 1 : 0;
    const obs = series.get(ticker) || [];
    const settleDay = isoDay(Date.parse(s.settlement_ts || s.close_time));
    const leadScores = leads.map((n) => {
      const pt = lastOnOrBefore(obs, shiftDays(settleDay, -n));
      if (!pt) return { nDays: n, p: null, date: null, brier: null, logloss: null };
      return { nDays: n, p: pt.p, basis: pt.basis, date: pt.date, brier: brier(pt.p, o), logloss: logloss(pt.p, o) };
    });
    perMarket.push({
      ticker,
      title: s.title || '',
      series_ticker: s.series_ticker || '',
      result: s.result,
      settlementDay: settleDay,
      observations: obs.length,
      firstObserved: obs.length ? obs[0].date : null,
      lastObserved: obs.length ? obs[obs.length - 1].date : null,
      leads: leadScores,
    });
  }
  perMarket.sort((a, b) => (a.settlementDay < b.settlementDay ? -1 : a.settlementDay > b.settlementDay ? 1 : a.ticker < b.ticker ? -1 : 1));

  const byLead = leads.map((n) => {
    const vals = perMarket.map((m) => m.leads.find((l) => l.nDays === n)).filter((l) => l && l.p !== null);
    if (!vals.length) return { nDays: n, nMarkets: 0, meanBrier: null, meanLogloss: null, meanP: null };
    const mean = (f) => vals.reduce((s, v) => s + f(v), 0) / vals.length;
    return { nDays: n, nMarkets: vals.length, meanBrier: mean((v) => v.brier), meanLogloss: mean((v) => v.logloss), meanP: mean((v) => v.p) };
  });

  // Pooled calibration curve over every daily observation of every settled market.
  const buckets = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10, n: 0, sumP: 0, yes: 0 }));
  for (const m of perMarket) {
    const o = m.result === 'yes' ? 1 : 0;
    for (const pt of series.get(m.ticker) || []) {
      const i = Math.min(9, Math.floor(pt.p * 10));
      buckets[i].n += 1; buckets[i].sumP += pt.p; buckets[i].yes += o;
    }
  }
  const pooled = buckets.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, meanP: b.n ? b.sumP / b.n : null, observedYesRate: b.n ? b.yes / b.n : null }));

  return {
    method: 'Implied p = order-book midpoint when a two-sided book (spread <= 10c) exists, else last trade price; lead-time p = last observation on or before settlement_day - N days; Brier (p-o)^2; log-loss clipped at 1e-4. Pooled curve uses every (day, market) observation of settled markets.',
    settledMarkets: perMarket.length,
    trackedMarkets: series.size,
    observationDays: [...new Set(dailyRows.map((r) => r.date))].sort(),
    byLead,
    pooled,
    perMarket,
  };
}
