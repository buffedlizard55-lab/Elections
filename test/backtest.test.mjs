import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brier, logloss, holdPnlPerContract, lastCloseOnOrBefore, backtestMarket, runAllBacktests, LEAD_TIMES_DAYS } from '../src/backtest.js';
import { CANDLESTICKS_2024, MARKETS_2024 } from '../src/kalshi-data.js';

test('brier basic values', () => {
  assert.ok(Math.abs(brier(0.7, 1) - 0.09) < 1e-12);
  assert.ok(Math.abs(brier(0.3, 0) - 0.09) < 1e-12);
  assert.equal(brier(0.5, 1), 0.25);
});

test('logloss: calibrated 0.7 vs yes < miscalibrated 0.3 vs yes; finite for extremes', () => {
  assert.ok(logloss(0.7, 1) < logloss(0.3, 1));
  assert.ok(Number.isFinite(logloss(1e-6, 1)));
  assert.ok(Number.isFinite(logloss(1 - 1e-6, 0)));
});

test('holdPnlPerContract: yes outcome gains (1-p), no outcome loses -p', () => {
  assert.equal(holdPnlPerContract(0.5, true), 0.5);
  assert.equal(holdPnlPerContract(0.5, false), -0.5);
  assert.equal(holdPnlPerContract(0.2, true), 0.8);
});

test('lastCloseOnOrBefore equals the last non-null close at/before ts (recomputed directly)', () => {
  const bars = CANDLESTICKS_2024['PRES-2024-DJT'].bars;
  for (const raw of bars) {
    let expected = null;
    for (const r of bars) {
      if (r[0] > raw[0]) break;
      if (r[5] !== null) expected = r[5] / 100;
    }
    const got = lastCloseOnOrBefore(bars, raw[0]);
    assert.equal(got, expected, `ts ${raw[0]}`);
  }
  // and it never uses a bar strictly after ts
  assert.equal(lastCloseOnOrBefore(bars, bars[0][0] - 1), null);
});

test('each captured 2024 market backtests against its official settlement direction', () => {
  for (const t of Object.keys(CANDLESTICKS_2024)) {
    const bt = backtestMarket(t);
    assert.equal(bt.outcomeIsYes, MARKETS_2024[t].result === 'yes');
    // the last price before the election should be on the winning side for the
    // R-favorite markets (market was calibrated in the final stretch)
    const last = bt.series[bt.series.length - 1];
    assert.ok(last.p > 0, `bad last price ${t}: ${last.p}`);
  }
});

test('aggregate: T-60 has no markets (PRES opened 2024-10-04; controls 2024-09-12) — reported honestly as nMarkets=0', () => {
  const { aggregate } = runAllBacktests();
  const t60 = aggregate.find((a) => a.nDays === 60);
  assert.equal(t60.nMarkets, 0);
  assert.equal(t60.meanBrier, null);
  const t30 = aggregate.find((a) => a.nDays === 30);
  assert.equal(t30.nMarkets, 3);
  for (const lt of LEAD_TIMES_DAYS.filter((n) => n <= 30)) {
    const row = aggregate.find((a) => a.nDays === lt);
    assert.ok(row.meanBrier > 0 && row.meanBrier < 0.25);
  }
});

test('calibration spread: the Senate-R favorite never traded below 79c after 2024-10-20', () => {
  // (documented market behavior from the captured bars; guards against transcription corruption)
  const control = backtestMarket('CONTROLS-2024-R');
  const afterOct20 = control.series.filter((s) => s.date >= '2024-10-20');
  assert.ok(afterOct20.length > 8);
  assert.ok(Math.min(...afterOct20.map((s) => s.p)) >= 0.79);
});

test('poll backtest checkpoints are comparison objects (regression: irregularity #36)', async () => {
  const { runPollBacktest } = await import('../src/poll-backtest.js');
  const pb = runPollBacktest();
  assert.ok(Array.isArray(pb.checkpoints) && pb.checkpoints.length >= 4);
  for (const c of pb.checkpoints) {
    assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok('poll2PartyMargin' in c && 'pollImpliedTrumpProb' in c && 'kalshiDjtClose' in c);
  }
  const anchor = pb.checkpoints[pb.checkpoints.length - 1];
  assert.equal(anchor.date, pb.anchorDate);
  assert.ok(Math.abs(anchor.poll2PartyMargin - pb.anchorMargin) < 1e-12);
});
