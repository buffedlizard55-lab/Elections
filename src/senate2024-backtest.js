/**
 * Elections — 2024 per-state Senate market backtest (ROADMAP R2).
 * =====================================================================
 * Extends the 2024 market backtest from the 3 chamber/presidential markets
 * in src/kalshi-data.js to the full set of Kalshi per-state Senate race
 * markets captured by scripts/collect-senate-2024-races.mjs
 * (data/kalshi/historical-2024/senate-races.json).
 *
 * Methodology is IDENTICAL to src/backtest.js (same metric functions are
 * imported, not re-implemented): no look-ahead (at T-N only bars with
 * end <= that date are used; the last known trade close is the forecast
 * price), Brier = (p-o)^2, clipped log-loss, hold-to-settlement PnL per
 * contract, daily bars parsed with the same 17-field cents layout.
 *
 * Every captured market's settled `result` is cross-checked against the
 * official outcome (data/outcomes/senate-2024-official.json — winners
 * transcribed from the Wikipedia 2024 Senate elections race-summary table
 * fetched 2026-09-19 via the MediaWiki API; per-state pages cite certified
 * results). A mismatch is published as FAIL, never normalized away.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brier, logloss, holdPnlPerContract, lastCloseOnOrBefore, LEAD_TIMES_DAYS } from './backtest.js';
import { parseBar } from './kalshi-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CAPTURE_PATH = 'data/kalshi/historical-2024/senate-races.json';
export const OFFICIAL_PATH = 'data/outcomes/senate-2024-official.json';

// Same election-day anchor as src/backtest.js (2024-11-05T00:00:00Z).
export const ELECTION_DAY_TS = 1730851200;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** T-7 confidence band of a market's own YES price (descriptive, labeled). */
export function bandOf(p) {
  if (p == null) return 'no-price';
  const c = p * 100;
  if (c >= 35 && c <= 65) return 'competitive (35-65c)';
  if ((c > 65 && c <= 90) || (c >= 10 && c < 35)) return 'lean (10-35c / 65-90c)';
  return 'safe (<10c / >90c)';
}

/**
 * @returns {object|null} null when the capture file does not exist yet
 * (the capture is produced on a networked runner; analytics skip honestly).
 */
export function runSenate2024Backtest(root = ROOT) {
  const captureFile = join(root, CAPTURE_PATH);
  if (!existsSync(captureFile)) return null;
  const capture = readJson(captureFile);
  const official = readJson(join(root, OFFICIAL_PATH));

  const expectedByTicker = {};
  const raceByState = {};
  for (const r of official.races) {
    raceByState[r.state] = r;
    for (const [t, res] of Object.entries(r.expectedKalshi || {})) expectedByTicker[t] = { result: res, race: r };
  }

  const markets = [];
  const mismatches = [];
  for (const [ticker, m] of Object.entries(capture.markets)) {
    const st = (m.series || '').replace(/^SENATE/, '');
    const exp = expectedByTicker[ticker];
    const outcomeIsYes = m.result === 'yes';
    const crossCheck = !exp ? 'NO-OFFICIAL-ROW' : exp.result === m.result ? 'PASS' : 'FAIL';
    if (crossCheck === 'FAIL') mismatches.push({ ticker, kalshiResult: m.result, expectedFromOfficial: exp.result, winner: exp.race.winner });
    const bars = capture.bars[ticker] || [];
    const series = [];
    for (const raw of bars) {
      const bar = parseBar(raw);
      if (bar.price.close !== null) series.push({ date: bar.date, ts: bar.endPeriodTs, p: bar.price.close });
    }
    const leadTimes = LEAD_TIMES_DAYS.map((nDays) => {
      const ts = ELECTION_DAY_TS - nDays * 86400;
      const p = lastCloseOnOrBefore(bars, ts);
      if (p === null) return { nDays, p: null, brier: null, logloss: null, holdPnlPerContract: null };
      return { nDays, p, brier: brier(p, outcomeIsYes ? 1 : 0), logloss: logloss(p, outcomeIsYes ? 1 : 0), holdPnlPerContract: holdPnlPerContract(p, outcomeIsYes) };
    });
    const p7 = (leadTimes.find((l) => l.nDays === 7) || {}).p ?? null;
    markets.push({
      ticker, state: st, series: m.series, event: m.event_ticker,
      side: m.yes_sub_title || null, title: m.title || null,
      result: m.result || null, outcomeIsYes,
      officialWinner: exp ? exp.race.winner : null, officialWinnerParty: exp ? exp.race.winnerParty : null,
      expirationValue: m.expiration_value ?? null,
      crossCheck, bandT7: bandOf(p7), p7,
      settlementTs: m.settlement_ts || null, closeTime: m.close_time || null,
      volume: m.volume ?? null,
      nBars: bars.length, nTradeBars: series.length,
      leadTimes,
      dailySeries: series,
    });
  }

  const aggregate = LEAD_TIMES_DAYS.map((nDays) => {
    const vals = markets.map((m) => m.leadTimes.find((lt) => lt.nDays === nDays)).filter((v) => v && v.p !== null);
    if (!vals.length) return { nDays, nMarkets: 0, meanProbYes: null, meanBrier: null, meanLogloss: null, meanHoldPnlPerContract: null };
    const mean = (f) => vals.reduce((s, v) => s + f(v), 0) / vals.length;
    return { nDays, nMarkets: vals.length, meanProbYes: mean((v) => v.p), meanBrier: mean((v) => v.brier), meanLogloss: mean((v) => v.logloss), meanHoldPnlPerContract: mean((v) => v.holdPnlPerContract) };
  });

  const bands = {};
  for (const m of markets) {
    const b = (bands[m.bandT7] = bands[m.bandT7] || { band: m.bandT7, nMarkets: 0, meanP7: null, meanBrierT7: null, winnersAtT7: 0 });
    b.nMarkets++;
    if (m.p7 != null) {
      b.meanP7 = b.meanP7 == null ? m.p7 : b.meanP7 + m.p7;
      b.meanBrierT7 = b.meanBrierT7 == null ? (m.p7 - (m.outcomeIsYes ? 1 : 0)) ** 2 : b.meanBrierT7 + (m.p7 - (m.outcomeIsYes ? 1 : 0)) ** 2;
      if (m.p7 > 0.5 && m.outcomeIsYes) b.winnersAtT7++;
      if (m.p7 <= 0.5 && !m.outcomeIsYes) b.winnersAtT7++;
    }
  }
  for (const b of Object.values(bands)) {
    const n = markets.filter((m) => m.bandT7 === b.band && m.p7 != null).length || 1;
    if (b.meanP7 != null) { b.meanP7 /= n; b.meanBrierT7 /= n; }
  }

  // "Hold the official winner at T-N": for each race, the winning-side market only.
  const holdWinners = LEAD_TIMES_DAYS.map((nDays) => {
    const rows = [];
    for (const r of official.races) {
      const winTicker = Object.entries(r.expectedKalshi || {}).find(([, res]) => res === 'yes')?.[0];
      const m = markets.find((x) => x.ticker === winTicker);
      const lt = m && m.leadTimes.find((l) => l.nDays === nDays);
      if (lt && lt.p !== null) rows.push({ state: r.state, ticker: winTicker, p: lt.p, holdPnl: lt.holdPnlPerContract });
    }
    if (!rows.length) return { nDays, nRaces: 0, meanPrice: null, meanHoldPnlPerContract: null };
    return {
      nDays, nRaces: rows.length,
      meanPrice: rows.reduce((s, r) => s + r.p, 0) / rows.length,
      meanHoldPnlPerContract: rows.reduce((s, r) => s + r.holdPnl, 0) / rows.length,
    };
  });

  const statesWith = Object.entries(capture.states).filter(([, v]) => (v.markets2024 || []).length).map(([st]) => st);
  const statesWithout = Object.entries(capture.states).filter(([, v]) => v.seriesExists && !(v.markets2024 || []).length).map(([st]) => st);
  const statesNoSeries = Object.entries(capture.states).filter(([, v]) => v.seriesExists === false).map(([st]) => st);

  return {
    electionDayTs: ELECTION_DAY_TS,
    capture: { capturedFrom: capture.capturedFrom, capturedAt: capture.capturedAt, capturedBy: capture.capturedBy, method: capture.method },
    official: { sourcePage: official.sourcePage, fetchedVia: official.fetchedVia, verifiedOn: official.verifiedOn },
    nMarkets: markets.length,
    settlementCrossCheck: { n: markets.length, pass: markets.filter((m) => m.crossCheck === 'PASS').length, fail: mismatches.length, noOfficialRow: markets.filter((m) => m.crossCheck === 'NO-OFFICIAL-ROW').length, mismatches },
    markets,
    aggregate,
    aggregateByBandT7: Object.values(bands),
    holdOfficialWinners: holdWinners,
    universeCoverage: {
      statesWith2024Markets: statesWith,
      statesWithSeriesButNo2024Market: statesWithout,
      statesWithoutSeries: statesNoSeries,
      note: official.universeCoverageNote,
    },
    captureErrors: capture.errors || [],
  };
}
