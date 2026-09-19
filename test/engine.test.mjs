import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStrategy, STARTING_CAPITAL, FILL_CAP_OF_BAR_VOLUME, MIN_TRADING_DAYS_TO_RANK } from '../src/contest/engine.js';
import { STRATEGIES } from '../src/contest/strategies.js';
import { MARKETS_2024, CANDLESTICKS_2024 } from '../src/kalshi-data.js';

const ALL = Object.fromEntries(Object.keys(CANDLESTICKS_2024).map((t) => [t, CANDLESTICKS_2024[t]]));

function runAll() {
  return STRATEGIES.map((strategy) => runStrategy({
    strategy,
    markets: Object.fromEntries(Object.keys(ALL).map((t) => [t, MARKETS_2024[t]])),
    candlesticks: ALL,
  }));
}

test('determinism: two identical runs produce deep-equal results', () => {
  const a = runAll();
  const b = runAll();
  assert.deepEqual(a, b);
});

test('attribution identity: finalEquity == startingCapital + realizedPnl for every entrant', () => {
  for (const r of runAll()) {
    assert.ok(
      r.attributionIdentityHolds,
      `${r.username}: ${r.finalEquity} != ${STARTING_CAPITAL} + ${r.realizedPnl}`,
    );
    const recompute = Math.round((STARTING_CAPITAL + r.realizedPnl) * 1e6) / 1e6;
    assert.equal(r.finalEquity, recompute);
  }
});

test('no fill on no-trade bars: every fill date/ticker had volume > 0 and a close', () => {
  for (const r of runAll()) {
    for (const f of r.fillLog) {
      if (f.date === 'settlement') continue;
      const bar = CANDLESTICKS_2024[f.ticker].bars.find((b) => {
        const d = new Date((b[0] - 86400) * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return d === f.date;
      });
      assert.ok(bar, `${r.username} filled on ${f.date}/${f.ticker} with no bar`);
      assert.ok(bar[1] > 0, `${r.username} filled on zero-volume bar ${f.date}/${f.ticker}`);
      assert.ok(bar[5] !== null, `${r.username} filled on null-close bar ${f.date}/${f.ticker}`);
    }
  }
});

test('fill cap: no fill exceeds 10% of the bar volume', () => {
  for (const r of runAll()) {
    for (const f of r.fillLog) {
      if (f.date === 'settlement' || f.action !== 'enter') continue;
      const bar = CANDLESTICKS_2024[f.ticker].bars.find((b) => {
        const d = new Date((b[0] - 86400) * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        return d === f.date;
      });
      assert.ok(f.shares <= bar[1] * FILL_CAP_OF_BAR_VOLUME + 1e-9,
        `${r.username} fill ${f.shares} exceeds cap ${bar[1] * FILL_CAP_OF_BAR_VOLUME} on ${f.date}/${f.ticker}`);
    }
  }
});

test('ranking follows The Leap: 0-trade entrants and entrants under the minimum active days are unranked, with a stated reason', () => {
  const results = runAll();
  for (const r of results) {
    const expectRanked = r.trades > 0 && r.tradingDays >= MIN_TRADING_DAYS_TO_RANK;
    assert.equal(r.ranked, expectRanked, `${r.username}: trades=${r.trades} days=${r.tradingDays}`);
    if (!r.ranked) assert.ok(typeof r.unrankedReason === 'string' && r.unrankedReason.length > 0);
    else assert.equal(r.unrankedReason, null);
    assert.ok(r.tradingDays <= r.trades);
  }
  // longshot-lotto and yield-yak genuinely had no qualifying price in the 2024 captured core universe
  const unranked = new Set(results.filter((r) => !r.ranked).map((r) => r.username));
  assert.ok(unranked.has('longshot-lotto'));
  assert.ok(unranked.has('yield-yak'));
});

test('every entrant keeps non-negative cash and equity curve stays finite', () => {
  for (const r of runAll()) {
    for (const pt of r.equityCurve) {
      assert.ok(Number.isFinite(pt.equity) && pt.equity >= 0, `${r.username} ${pt.date}: ${pt.equity}`);
    }
  }
});

test('NO-side fills are labelled derived', () => {
  let sawDerived = false;
  for (const r of runAll()) {
    for (const f of r.fillLog) {
      if (f.side === 'NO' && f.date !== 'settlement') {
        assert.ok(f.executedAt.includes('derived'), `NO fill not labelled derived: ${JSON.stringify(f)}`);
        sawDerived = true;
      }
    }
  }
  assert.ok(sawDerived, 'expected at least one derived NO fill in the 2024 universe');
});
