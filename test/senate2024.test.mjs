// Integrity tests for the captured 2024 per-state Senate markets (R2) and the merged
// 2024 universe. They run against the captured file when present and check the
// invariants a correct capture must satisfy; the one hard-coded spot check
// (SENATEAZ-24-D, Nov-4 daily bar) was verified by hand against the public API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SENATE_2024_LOADED, SENATE_2024, MARKETS_2024_ALL, CANDLESTICKS_2024_ALL, groupOf, universeSummary } from '../src/kalshi-data-2024.js';
import { MARKETS_2024, CANDLESTICKS_2024 } from '../src/kalshi-data.js';
import { runAllBacktests, backtestMarket } from '../src/backtest.js';

test('merged 2024 universe always contains the hand-verified core markets', () => {
  for (const t of Object.keys(MARKETS_2024)) {
    assert.ok(MARKETS_2024_ALL[t], t);
    assert.equal(groupOf(t), 'core-2024');
  }
  for (const t of Object.keys(CANDLESTICKS_2024)) assert.ok(CANDLESTICKS_2024_ALL[t], t);
  const s = universeSummary();
  assert.equal(s.core2024, Object.keys(CANDLESTICKS_2024).length); // markets with a price history (complement legs share the YES-side candles)
  assert.equal(s.total, s.core2024 + s.senate2024);
});

test('captured Senate 2024 file (when present): provenance, binary results, ordered bars, one winner per state', () => {
  if (!SENATE_2024_LOADED) return; // absent until the networked collector has run in this checkout
  assert.ok(SENATE_2024.capturedFrom.includes('/historical/markets'));
  assert.ok(SENATE_2024.capturedAt);
  assert.equal(SENATE_2024.summary.statesQueried, 50);
  const byState = {};
  for (const [t, m] of Object.entries(SENATE_2024.markets)) {
    assert.ok(m.result === 'yes' || m.result === 'no', `${t} result`);
    assert.ok(m.totalVolumeContracts > 0, `${t} volume`);
    assert.ok(m.closeTime >= '2024-11-01' && m.closeTime < '2025-02-01', `${t} in the 2024 cycle window`);
    const bars = SENATE_2024.candlesticks[t].bars;
    assert.ok(bars.length > 0, `${t} bars`);
    for (let i = 1; i < bars.length; i++) assert.ok(bars[i][0] > bars[i - 1][0], `${t} bars ascending`);
    for (const b of bars) { assert.equal(b.length, 17); if (b[5] !== null) assert.ok(b[5] >= 0 && b[5] <= 100, `${t} close in cents`); }
    (byState[m.state] = byState[m.state] || []).push(m.result);
  }
  for (const [st, results] of Object.entries(byState)) {
    assert.equal(results.filter((r) => r === 'yes').length, 1, `${st}: exactly one candidate market resolved YES`);
  }
  assert.equal(Object.keys(SENATE_2024.markets).length, SENATE_2024.summary.markets);
});

test('spot check verified by hand against the public API: SENATEAZ-24-D daily bar ending 2024-11-05T05:00Z', () => {
  if (!SENATE_2024_LOADED) return;
  const bars = SENATE_2024.candlesticks['SENATEAZ-24-D'].bars;
  const bar = bars.find((b) => b[0] === 1730782800);
  assert.ok(bar, 'bar present');
  assert.equal(bar[1], 93619); // volume (contracts)
  assert.equal(bar[5], 70); // close, cents
  assert.equal(SENATE_2024.markets['SENATEAZ-24-D'].result, 'yes'); // Ruben Gallego won (official outcome O-series)
  assert.equal(SENATE_2024.markets['SENATEAZ-24-R'].result, 'no');
});

test('backtest over the merged universe scores every market once and reports groups', () => {
  const out = runAllBacktests();
  assert.equal(out.markets.length, Object.keys(CANDLESTICKS_2024_ALL).length);
  assert.ok(out.groups['core-2024']);
  assert.ok(out.groups['senate-2024']);
  const t1 = out.aggregate.find((a) => a.nDays === 1);
  assert.ok(t1.nMarkets >= 3);
  assert.ok(t1.meanBrier >= 0 && t1.meanBrier <= 1);
  if (SENATE_2024_LOADED) {
    assert.ok(t1.nMarkets >= 30, 'expanded universe scored at T-1');
    const fav = out.favoriteAccuracy.find((a) => a.nDays === 1);
    assert.ok(fav.rate > 0.5);
    // pooled curves exist in both forms
    assert.equal(out.pooledCalibration.buckets.length, 10);
    assert.equal(out.pooledCalibrationDeduped.dedupe, true);
  }
  // election-day flag is explicit per market
  for (const m of out.markets) assert.equal(typeof m.electionDayBarCaptured, 'boolean');
  const one = backtestMarket(out.markets[0].ticker);
  assert.equal(one.ticker, out.markets[0].ticker);
});
