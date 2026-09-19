/**
 * Elections — Poll vs market vs outcome backtest (2024 presidential)
 * =====================================================================
 * Uses the verified FiveThirtyEight archived national averages
 * (data/polls/538-national-averages.csv, final published 2024-09-12,
 * "uncorrected") and the captured Kalshi PRES-2024-DJT daily closes.
 *
 * HONESTY NOTES:
 *  - The 538 series ENDS 2024-09-12 (the site archive). No late-2024
 *    538 values are invented; the last value is reused as a "poll
 *    anchor" and its age is reported per comparison point.
 *  - Poll margin -> win probability uses the logistic mapping
 *    p = 1 / (1 + exp(-margin / k)) with k = 4.5, the scaling used by
 *    538's own 2020 model for national margins. This is a MODELED
 *    mapping (labeled), not a published 538 probability.
 *  - Outcome margins are the verified official popular-vote margins
 *    (FEC via data/outcomes/verified-outcomes.json).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CANDLESTICKS_2024, parseBar } from './kalshi-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGISTIC_K = 4.5; // modeled mapping, labeled
export const OUTCOME_MARGIN_2024 = 1.45; // Trump +1.45pp 2-party popular (FEC numbers: 77,302,580 / 75,017,613)

function parseCsvLine(line) {
  // minimal CSV (no quoted commas needed in this file's target columns)
  return line.split(',');
}

/**
 * Load national 2024 averages: Map<date, {candidates: {name: pct}}>
 */
export function loadNationalAverages(path = join(ROOT, 'data/polls/538-national-averages.csv')) {
  const text = readFileSync(path, 'utf8');
  const byDate = new Map();
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [candidate, date, , state, cycle] = parseCsvLine(line);
    if (state !== 'National' || cycle !== '2024') continue;
    const est = line.split(',')[6]; // pct_estimate
    if (!est) continue;
    if (!byDate.has(date)) byDate.set(date, {});
    byDate.get(date)[candidate] = Number(est);
  }
  return byDate;
}

/** 2-party margin (points, positive = Trump) for a date, from national averages. */
export function nationalMargin(byDate, date) {
  const row = byDate.get(date);
  if (!row) return null;
  const trump = row['Trump'];
  const dem = row['Harris'] ?? row['Biden'];
  if (trump == null || dem == null) return null;
  return trump - dem; // 2-party leaning
}

/** Logistic margin -> Trump win probability (MODELED mapping, labeled). */
export function marginToProb(trumpMargin, k = LOGISTIC_K) {
  return 1 / (1 + Math.exp(-trumpMargin / k));
}

/** Kalshi DJT last trade close on or before a given ISO date. */
export function kalshiCloseOnOrBefore(dateStr) {
  const ts = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000) + 86399;
  let last = null;
  for (const raw of CANDLESTICKS_2024['PRES-2024-DJT'].bars) {
    const bar = parseBar(raw);
    if (bar.endPeriodTs > ts) break;
    if (bar.price.close !== null) last = { date: bar.date, p: bar.price.close };
  }
  return last;
}

/**
 * Build the poll vs market vs outcome comparison table.
 * @returns {{anchorDate, comparisons: Array<object>, outcome: object}}
 */
export function runPollBacktest() {
  const byDate = loadNationalAverages();
  const dates = [...byDate.keys()].sort();
  const anchorDate = dates[dates.length - 1]; // 2024-09-12 (archive end)
  const anchorMargin = nationalMargin(byDate, anchorDate);

  const checkpoints = ['2024-06-30', '2024-07-21', '2024-08-31', '2024-09-12'];
  const comparisons = checkpoints.map((d) => {
    const m = nationalMargin(byDate, d);
    const pollImpliedTrump = m == null ? null : marginToProb(m);
    const kx = kalshiCloseOnOrBefore(d);
    return {
      date: d,
      poll2PartyMargin: m,
      pollImpliedTrumpProb: pollImpliedTrump,
      pollMapping: 'logistic, k=4.5 (modeled)',
      kalshiDjtClose: kx ? kx.p : null,
      kalshiCloseDate: kx ? kx.date : null,
    };
  });

  const lateWindow = [
    '2024-10-15', '2024-10-28', '2024-11-01', '2024-11-03',
  ].map((d) => {
    const kx = kalshiCloseOnOrBefore(d);
    const ageDays = Math.floor((new Date(d) - new Date(anchorDate)) / 86400000);
    return {
      date: d,
      pollAnchorDate: anchorDate,
      pollAnchorAgeDays: ageDays,
      poll2PartyMargin: anchorMargin,
      pollImpliedTrumpProb: marginToProb(anchorMargin),
      kalshiDjtClose: kx ? kx.p : null,
      kalshiCloseDate: kx ? kx.date : null,
      gapPollVsMarket: kx && anchorMargin != null ? marginToProb(anchorMargin) - kx.p : null,
    };
  });

  const finalMargin = OUTCOME_MARGIN_2024;
  const anchorAbsError = Math.abs(anchorMargin - finalMargin);
  const finalMarket = kalshiCloseOnOrBefore('2024-11-04');
  const marketAbsError = finalMarket ? Math.abs((finalMarket.p - 0.5) * 2 * 100 - finalMargin) : null;
  // (market margin in points: (p - 0.5) * 200 approximates margin points for a 2-way market)

  return {
    anchorDate,
    anchorMargin,
    finalOutcomeMargin: finalMargin,
    finalOutcome: 'Trump +1.45pp (2-party popular vote; FEC 77,302,580 / 75,017,613)',
    pollAnchorAbsErrorPp: anchorAbsError,
    marketAbsErrorPp: marketAbsError,
    checkpoints: comparisons, // bug fixed 2026-09-19: the date list (not the comparisons) was being returned, so the site rendered 'undefined' rows
    lateWindow,
  };
}
