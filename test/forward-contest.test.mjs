/**
 * Tests for the live 2026 contest (ROADMAP R16).
 *
 * These are not smoke tests. Each one pins a property the season's published
 * numbers depend on, so a later edit that quietly changes an execution rule,
 * re-introduces a double-counted fee, or lets a fill happen at a price that was
 * never captured fails here before it reaches an artifact a reader trusts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePanelRow, seriesOf, buildTickerIndex, buildContestUniverse, withinSeasonWindow, SEASON } from '../src/contest/forward-universe.js';
import { runForwardStrategy, executionPrice, sideMark, participationCap, attributeStrategy, STARTING_CAPITAL, MIN_TRADING_DAYS_TO_RANK, DAILY_DEPLOYMENT_OF_EQUITY } from '../src/contest/forward-engine.js';
import { FORWARD_FIELD, TRANSFERRED_FROM_2024, EXCLUDED_FROM_FORWARD_FIELD, identityGate, buildSignals, COMBO_LEGS, HOUSE_CONTROL, SENATE_CONTROL, signalsForTradingDay, comboCoherence } from '../src/contest/strategies-forward.js';
import { scanComboEdges } from '../src/contest/combo-scan.js';
import { registerSeriesFees } from '../src/fees.js';
import { STRATEGIES } from '../src/contest/strategies.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~= ${b}`);

// ---------------------------------------------------------------------------
// Synthetic panel helpers
// ---------------------------------------------------------------------------
const row = (o) => ({
  ticker: o.ticker, date: o.date,
  yes_bid: o.bid === undefined ? '0.40' : String(o.bid),
  yes_ask: o.ask === undefined ? '0.42' : String(o.ask),
  last_price: o.last === undefined ? String((Number(o.bid ?? 0.40) + Number(o.ask ?? 0.42)) / 2) : String(o.last),
  volume: '1000', volume_24h: o.v24 === undefined ? '1000' : String(o.v24),
  open_interest: o.oi === undefined ? '10000' : String(o.oi),
  liquidity: '0', close_time: o.close ?? '2027-11-03T15:00:00Z', status: 'active',
});

/** Build a contest universe by hand so each test controls exactly one variable. */
function makeUniverse(rows, dates = ['2026-09-19', '2026-09-20', '2026-09-21']) {
  const index = { byTicker: new Map(), usElectionSeries: new Set(['TEST']) };
  for (const r of rows) {
    const series = r.ticker.split('-')[0];
    // 'NONELECTION' is the fixture's marker for a series that is not tagged as a
    // US-election series in the captured universe.
    if (series !== 'KXOTHER' && series !== 'NONELECTION') index.usElectionSeries.add(series);
    index.byTicker.set(r.ticker, { series, sub: 'Democratic Party', closeTime: r.close_time });
  }
  return buildContestUniverse({ panelRows: rows, index });
}

const flatEntrant = (over = {}) => ({
  username: 'test-entrant', name: 'TestEntrant', thesis: 'test',
  decide: () => [{ ticker: 'TEST-26-D', side: 'YES', fractionOfEquity: 0.1 }],
  ...over,
});

// ---------------------------------------------------------------------------
// 1. Book parsing
// ---------------------------------------------------------------------------
test('a genuine two-sided book produces a midpoint and is tradeable', () => {
  const p = parsePanelRow(row({ ticker: 'TEST-26-D', date: '2026-09-19', bid: 0.40, ask: 0.42 }));
  assert.equal(p.twoSided, true);
  assert.equal(p.mid, 0.41);
});

test('a one-sided book yields NO midpoint — the engine must never invent a quote', () => {
  const p = parsePanelRow(row({ ticker: 'TEST-26-D', date: '2026-09-19', bid: '', ask: '0.42' }));
  assert.equal(p.twoSided, false);
  assert.equal(p.mid, null, 'no bid means there is no midpoint to report');
});

test('a crossed book (ask <= bid) is refused rather than averaged', () => {
  const p = parsePanelRow(row({ ticker: 'TEST-26-D', date: '2026-09-19', bid: '0.55', ask: '0.50' }));
  assert.equal(p.twoSided, false);
  assert.equal(p.mid, null);
});

test('a 0.00 bid or a 1.00 ask is not a usable price', () => {
  const zero = parsePanelRow(row({ ticker: 'TEST-26-D', date: '2026-09-19', bid: '0.00', ask: '0.03' }));
  assert.equal(zero.yesBid, null, '0 is a placeholder here, not a quote');
  const one = parsePanelRow(row({ ticker: 'TEST-26-D', date: '2026-09-19', bid: '0.97', ask: '1.0000' }));
  assert.equal(one.yesAsk, null);
});

test('a market only counts as traded when contracts actually changed hands', () => {
  assert.equal(parsePanelRow(row({ ticker: 'T-1', date: '2026-09-19', v24: '0' })).tradedToday, false);
  assert.equal(parsePanelRow(row({ ticker: 'T-1', date: '2026-09-19', v24: '12' })).tradedToday, true);
});

// ---------------------------------------------------------------------------
// 2. Execution and marks
// ---------------------------------------------------------------------------
test('taker execution crosses the captured spread in every direction', () => {
  const p = { twoSided: true, yesBid: 0.40, yesAsk: 0.42 };
  close(executionPrice('YES', p, 'enter'), 0.42, 1e-9); // buy YES pays the ask
  close(executionPrice('NO', p, 'enter'), 0.60, 1e-9);  // buy NO pays 1 - bid
  close(executionPrice('YES', p, 'exit'), 0.40, 1e-9);  // sell YES hits the bid
  close(executionPrice('NO', p, 'exit'), 0.58, 1e-9);   // sell NO hits 1 - ask
  assert.equal(executionPrice('YES', { twoSided: false }, 'enter'), null, 'no book means no price');
});

test('an entry and its exit both lose the spread — the fee is real, not a modelling courtesy', () => {
  const p = { twoSided: true, yesBid: 0.40, yesAsk: 0.42 };
  const buy = executionPrice('YES', p, 'enter');
  const sell = executionPrice('YES', p, 'exit');
  assert.ok(sell < buy, `exit ${sell} must be worse than entry ${buy}`);
});

test('a NO position is marked as 1 - YES mid, so it RISES when the YES price falls', () => {
  assert.equal(sideMark('YES', 0.30), 0.30);
  assert.equal(sideMark('NO', 0.30), 0.7);
  assert.ok(sideMark('NO', 0.20) > sideMark('NO', 0.30), 'a NO book gains when YES falls');
  assert.equal(sideMark('NO', null), null, 'an absent quote produces no mark');
});

test('the participation cap is the smaller of the volume and open-interest limits', () => {
  close(participationCap({ volume24h: 1000, openInterest: 10000 }), 100, 1e-9);
  close(participationCap({ volume24h: 100000, openInterest: 500 }), 50, 1e-9);
  close(participationCap({ volume24h: 1000, openInterest: 0 }), 100, 1e-9, 'an unknown OI must not veto a traded market');
});

// ---------------------------------------------------------------------------
// 3. Engine invariants
// ---------------------------------------------------------------------------
test('the accounting identity holds — capital + realized + unrealized == cash + marks', () => {
  const rows = ['2026-09-19', '2026-09-20', '2026-09-21'].map((date, i) => row({ ticker: 'TEST-26-D', date, bid: 0.40 + i * 0.02, ask: 0.42 + i * 0.02 }));
  const { result } = runForwardStrategy({ strategy: flatEntrant(), universe: makeUniverse(rows), settlements: {} });
  assert.equal(result.accountingIdentityHolds, true);
  close(result.identityLegs.sum, result.netEquity, 1e-6);
  close(result.netEquity, result.cash + result.openPositions * 0 + (result.openPositionSample[0] ? result.openPositionSample[0].shares * result.openPositionSample[0].mark : 0), 1e-6);
});

test('an entry fee is charged exactly once, not once at entry and again at close', () => {
  // Buy on day 1, sell on day 2 at the same book. The only P&L is the two fees
  // and the two half-spreads — never a double-charged entry fee.
  const enter = row({ ticker: 'TEST-26-D', date: '2026-09-19', bid: 0.40, ask: 0.42 });
  const exit = row({ ticker: 'TEST-26-D', date: '2026-09-20', bid: 0.40, ask: 0.42 });
  const strategy = { username: 'x', name: 'x', thesis: 'x', decide: (ctx) => (ctx.i === 0 ? [{ ticker: 'TEST-26-D', side: 'YES', fractionOfEquity: 0.1 }] : ctx.positions['TEST-26-D'] ? [{ ticker: 'TEST-26-D', exit: true }] : []) };
  const { result } = runForwardStrategy({ strategy, universe: makeUniverse([enter, exit, row({ ticker: 'TEST-26-D', date: '2026-09-21' })]), settlements: {} });
  assert.equal(result.openPositions, 0);
  const f = result.fillLog;
  assert.equal(f.filter((x) => x.action === 'enter').length, 1);
  assert.equal(f.filter((x) => x.action === 'exit').length, 1);
  const entryFee = f[0].fee;
  const exitFee = f[1].fee;
  const gross = f[0].shares * (f[1].price - f[0].price); // no fees at all
  // The clean statement of "charged exactly once": realized P&L is the gross
  // spread minus ONE entry fee and ONE exit fee. A double-charged entry fee
  // shows up here as an extra -entryFee.
  close(result.realizedPnl, gross - entryFee - exitFee, 1e-6);
  close(result.feesPaid, entryFee + exitFee, 1e-6);
  // and the exit fill's own pnl nets only the exit fee, not the entry fee again
  close(f[1].pnl, gross - exitFee, 1e-6);
});

test('no fill happens on a day the market did not trade', () => {
  const rows = [
    row({ ticker: 'TEST-26-D', date: '2026-09-19', v24: '0' }),
    row({ ticker: 'TEST-26-D', date: '2026-09-20', v24: '0' }),
    row({ ticker: 'TEST-26-D', date: '2026-09-21', v24: '0' }),
  ];
  const { result } = runForwardStrategy({ strategy: flatEntrant(), universe: makeUniverse(rows), settlements: {} });
  assert.equal(result.trades, 0);
  assert.ok(result.skipReasons['no-trade-day-fill-refused'] > 0, 'each refusal is counted with a reason');
});

test('a fill cannot exceed the participation cap, and the cap flag says so', () => {
  const rows = ['2026-09-19', '2026-09-20', '2026-09-21'].map((date) => row({ ticker: 'TEST-26-D', date, v24: '1000', oi: '10000' }));
  const { result } = runForwardStrategy({ strategy: flatEntrant({ decide: (ctx) => (ctx.positions['TEST-26-D'] ? [] : [{ ticker: 'TEST-26-D', side: 'YES', fractionOfEquity: 0.9 }]) }), universe: makeUniverse(rows), settlements: {} });
  const fills = result.fillLog.filter((f) => f.action === 'enter');
  assert.ok(fills.length > 0);
  for (const f of fills) assert.ok(f.shares <= 100 + 1e-9, `fill ${f.shares} must respect the 100-contract cap`);
  assert.equal(fills[0].fillCapApplied, true);
  assert.ok(result.fillsCappedByParticipation > 0);
});

test('the daily deployment budget is enforced and does not depend on iteration order', () => {
  const tickers = Array.from({ length: 40 }, (_, i) => `TEST-26-${String.fromCharCode(65 + i)}`);
  const rows = tickers.map((t) => row({ ticker: t, date: '2026-09-19', v24: '100000', oi: '1000000' }));
  for (const t of tickers) rows.push(row({ ticker: t, date: '2026-09-20' }), row({ ticker: t, date: '2026-09-21' }));
  const universe = makeUniverse(rows);
  const mk = (order) => ({ username: 'x', name: 'x', thesis: 'x', decide: (ctx) => (ctx.i === 0 ? order.map((t) => ({ ticker: t, side: 'YES', fractionOfEquity: 0.25 })) : []) });
  const a = runForwardStrategy({ strategy: mk(tickers), universe, settlements: {} }).result;
  const b = runForwardStrategy({ strategy: mk([...tickers].reverse()), universe, settlements: {} }).result;
  const notional = a.fillLog.reduce((s, f) => s + f.shares * f.price, 0);
  assert.ok(notional <= STARTING_CAPITAL * DAILY_DEPLOYMENT_OF_EQUITY + 1, `deployed ${notional} must stay inside the ${DAILY_DEPLOYMENT_OF_EQUITY * 100}% budget`);
  assert.equal(a.netEquity, b.netEquity, 'the same orders emitted in reverse order must produce the same season');
});

test('the same captures always produce the same season (determinism)', () => {
  const rows = ['2026-09-19', '2026-09-20', '2026-09-21'].map((date, i) => row({ ticker: 'TEST-26-D', date, bid: 0.4 + i * 0.01, ask: 0.42 + i * 0.01 }));
  const u = makeUniverse(rows);
  const one = runForwardStrategy({ strategy: flatEntrant(), universe: u, settlements: {} }).result;
  const two = runForwardStrategy({ strategy: flatEntrant(), universe: u, settlements: {} }).result;
  assert.deepEqual(one, two);
});

test('a duplicate order for one ticker and side becomes one fill', () => {
  const rows = ['2026-09-19', '2026-09-20', '2026-09-21'].map((date) => row({ ticker: 'TEST-26-D', date }));
  const strategy = { username: 'x', name: 'x', thesis: 'x', decide: (ctx) => (ctx.i === 0 ? [{ ticker: 'TEST-26-D', side: 'YES', fractionOfEquity: 0.1 }, { ticker: 'TEST-26-D', side: 'YES', fractionOfEquity: 0.1 }] : []) };
  const { result } = runForwardStrategy({ strategy, universe: makeUniverse(rows), settlements: {} });
  assert.equal(result.trades, 1, 'a strategy bug must not manufacture a double fill');
});

test('reversing a position closes the old leg — the identity survives a flip', () => {
  const rows = ['2026-09-19', '2026-09-20', '2026-09-21'].map((date) => row({ ticker: 'TEST-26-D', date }));
  const strategy = {
    username: 'x', name: 'x', thesis: 'x',
    decide: (ctx) => (ctx.i === 0 ? [{ ticker: 'TEST-26-D', side: 'YES', fractionOfEquity: 0.1 }] : ctx.i === 1 ? [{ ticker: 'TEST-26-D', side: 'NO', fractionOfEquity: 0.1 }] : []),
  };
  const { result } = runForwardStrategy({ strategy, universe: makeUniverse(rows), settlements: {} });
  assert.equal(result.fillLog.filter((f) => f.action === 'exit').length, 1, 'the YES leg is closed, not abandoned');
  assert.equal(result.accountingIdentityHolds, true);
});

test('a position only leaves the book on a captured official settlement', () => {
  const rows = ['2026-09-19', '2026-09-20', '2026-09-21'].map((date, i) => row({ ticker: 'TEST-26-D', date, bid: 0.4 + i * 0.1, ask: 0.42 + i * 0.1 }));
  const noResult = runForwardStrategy({ strategy: flatEntrant(), universe: makeUniverse(rows), settlements: {} }).result;
  assert.equal(noResult.openPositions, 1, 'with no captured result the position stays open');
  const settled = runForwardStrategy({ strategy: flatEntrant(), universe: makeUniverse(rows), settlements: { 'TEST-26-D': { result: 'yes', settledAt: '2026-11-04T00:00:00Z' } } }).result;
  const s = settled.fillLog.find((f) => f.action === 'settlement');
  assert.ok(s, 'an official result closes the position');
  assert.equal(s.price, 1, 'a YES win settles at 1');
  assert.equal(settled.openPositions, 0);
  assert.equal(settled.accountingIdentityHolds, true);
  const no = runForwardStrategy({ strategy: flatEntrant(), universe: makeUniverse(rows), settlements: { 'TEST-26-D': { result: 'no', settledAt: '2026-11-04T00:00:00Z' } } }).result;
  assert.equal(no.fillLog.find((f) => f.action === 'settlement').price, 0);
});

test('an entrant under the minimum trading days is published as unranked, never ranked', () => {
  const rows = ['2026-09-19', '2026-09-20'].map((date) => row({ ticker: 'TEST-26-D', date }));
  const { result } = runForwardStrategy({ strategy: flatEntrant(), universe: makeUniverse(rows), settlements: {} });
  assert.equal(result.ranked, false);
  assert.match(result.unrankedReason, new RegExp(`${MIN_TRADING_DAYS_TO_RANK}`));
});

test('attribution reconciles to the entrant total and attributes by the ticker series', () => {
  const rows = ['2026-09-19', '2026-09-20', '2026-09-21'].map((date, i) => row({ ticker: 'TEST-26-D', date, bid: 0.4 + i * 0.05, ask: 0.42 + i * 0.05 }));
  const { result, attribution } = runForwardStrategy({ strategy: flatEntrant(), universe: makeUniverse(rows), settlements: {} });
  assert.equal(result.attributionReconciles, true);
  close(attribution.bySeries.reduce((s, b) => s + b.net, 0), result.netEquity - STARTING_CAPITAL, 1e-6);
  assert.equal(attribution.bySeries[0].key, 'TEST', 'the bucket is the ticker series, never "unknown"');
});

// ---------------------------------------------------------------------------
// 4. Universe scoping
// ---------------------------------------------------------------------------
test('the season window is inclusive at its edge and rejects a missing close_time', () => {
  assert.equal(withinSeasonWindow('2026-11-03T15:00:00Z'), true);
  assert.equal(withinSeasonWindow('2029-02-01T15:00:00Z'), false);
  assert.equal(withinSeasonWindow(null), false, 'an unknown close date is not silently in-window');
  assert.equal(withinSeasonWindow(SEASON.closesBy), true);
});

test('the universe excludes non-election series, out-of-window races and one-sided books, and counts each reason', () => {
  const rows = [
    row({ ticker: 'TEST-26-D', date: '2026-09-19' }),
    row({ ticker: 'NONELECTION-26-D', date: '2026-09-19' }),
    row({ ticker: 'TEST-28-D', date: '2026-09-19', close: '2029-11-07T15:00:00Z' }),
    row({ ticker: 'TEST-26-R', date: '2026-09-19', bid: '' }),
  ];
  const built = makeUniverse(rows);
  const day = built.eligible['2026-09-19'];
  assert.equal(day.has('TEST-26-D'), true);
  assert.equal(day.has('NONELECTION-26-D'), false);
  assert.equal(day.has('TEST-28-D'), false);
  assert.equal(day.has('TEST-26-R'), false);
  assert.equal(built.rejectionReasons['not-us-election-series'], 1);
  assert.equal(built.rejectionReasons['closes-after-season-window'], 1);
  assert.equal(built.rejectionReasons['book-not-two-sided-at-capture'], 1);
});

test('a ticker missing from the captured index falls back to its prefix and says so', () => {
  const index = { byTicker: new Map(), usElectionSeries: new Set(['ABC']) };
  assert.deepEqual(seriesOf(index, 'ABC-26-D'), { series: 'ABC', fromPrefix: true });
  index.byTicker.set('ABC-26-D', { series: 'ABCDEF' });
  assert.deepEqual(seriesOf(index, 'ABC-26-D'), { series: 'ABCDEF', fromPrefix: false });
});

// ---------------------------------------------------------------------------
// 5. The field itself
// ---------------------------------------------------------------------------
test('the field is 12 entrants with unique usernames, unique theses and a callable decide()', () => {
  assert.equal(FORWARD_FIELD.length, 12);
  assert.equal(new Set(FORWARD_FIELD.map((s) => s.username)).size, 12, 'usernames must be unique');
  assert.equal(new Set(FORWARD_FIELD.map((s) => s.thesis)).size, 12, 'theses must be unique');
  for (const s of FORWARD_FIELD) {
    assert.equal(typeof s.decide, 'function', `${s.username} must be executable`);
    assert.ok(s.thesis && s.thesis.length > 40, `${s.username} needs a real thesis`);
    assert.ok(s.name && /^[A-Z]/.test(s.name));
  }
});

test('the transferred entrants run the 2024 decide() function itself, not a copy', () => {
  // If someone edits a 2024 strategy for 2026 in place, this fails: the point of
  // the transfer is that the 2024 result becomes an out-of-sample test.
  assert.equal(TRANSFERRED_FROM_2024.length, 7);
  for (const username of TRANSFERRED_FROM_2024) {
    const f = FORWARD_FIELD.find((s) => s.username === username);
    const orig = STRATEGIES.find((s) => s.username === username);
    assert.ok(f && orig, `${username} must exist in both fields`);
    assert.equal(f.decide, orig.decide, `${username}.decide must be the same function object`);
    assert.equal(f.thesis, orig.thesis, `${username}.thesis must be unchanged`);
    assert.equal(f.state, orig.state, `${username}.state must be unchanged`);
  }
});

test('every entrant dropped from the 2024 field carries a published reason', () => {
  for (const s of STRATEGIES) {
    if (TRANSFERRED_FROM_2024.includes(s.username)) continue;
    const excluded = EXCLUDED_FROM_FORWARD_FIELD.find((e) => e.username === s.username);
    assert.ok(excluded, `${s.username} left the field without a recorded reason`);
    assert.ok(excluded.reason.length > 60, 'the reason must be specific');
  }
});

test('the poll identity gate refuses a party leg and a different candidate that a naive filter would admit', () => {
  assert.equal(identityGate('Democratic party', 'Mary Peltola').ok, false, 'a party market is not a candidate market');
  assert.equal(identityGate('Republican Party', 'Spencer Cox').ok, false);
  assert.equal(identityGate('John E. Sununu', 'Kevin Sununu').ok, false, 'two different people named Sununu');
  assert.equal(identityGate('Angie Nixon', 'Alexander Vindman').ok, false);
  // A scenario median is a synthesis across six questions, not a nominee, so
  // there is no way to verify that the market's candidate is the polled one.
  assert.equal(identityGate('James Talarico', 'Median of the six candidate-matched general scenarios (Democrat: Crockett/Talarico)').ok, false);
  assert.equal(identityGate('Gina Hinojosa', 'James Hinojosa').ok, false, 'a shared surname is not a match');
  assert.equal(identityGate('Troy Jackson', 'Troy Jackson').ok, true);
  assert.equal(identityGate('Abdul El-Sayed', 'Abdul El-Sayed').ok, true);
  assert.equal(identityGate(null, 'Anyone').ok, false, 'an unnamed leg cannot be verified');
});

test('buildSignals admits only gated rows, records every refusal, and never dates a signal after its capture', () => {
  const pollLayer = {
    capturedAt: '2026-09-21T22:53:18.000Z',
    stateRaces: [
      { id: 'ok', race: 'X', pollster: 'P', kalshiDemTicker: 'TEST-26-D', candidates: { D: { name: 'Troy Jackson', pct: 52 }, R: { name: 'R R', pct: 44 } }, marketSubTitle: 'Troy Jackson' },
      { id: 'party', race: 'Y', pollster: 'P', kalshiDemTicker: 'TEST2-26-D', candidates: { D: { name: 'Mary Peltola', pct: 47 }, R: { name: 'R R', pct: 48 } }, marketSubTitle: 'Democratic party' },
      { id: 'reviewed', race: 'Z', pollster: 'P', review: true, kalshiDemTicker: 'TEST3-26-D', candidates: { D: { name: 'A B', pct: 50 }, R: { name: 'C D', pct: 45 } }, marketSubTitle: 'A B' },
    ],
    raceRatings: { bands: { 'Toss Up': [0.35, 0.65], 'Tilt R': [0.25, 0.45] }, senate2026: [
      { state: 'XX', cook: 'Toss Up', inside: 'Tilt R', kalshiTicker: 'TEST-26-D', kalshiSide: 'D' },
      { state: 'NE', cook: 'Toss Up', inside: 'Tilt R', kalshiTicker: 'TESTNE-26-DOSB', kalshiSide: 'I' },
    ] },
  };
  const cross = [{ question: 'Q', capturedAt: '2026-09-20T02:50:00.000Z', layers: { kalshi: { ticker: 'TEST-26-D', bid: 0.4, ask: 0.42 }, metaculus: 0.55 } }];
  const s = buildSignals({ pollLayer, crossLayerRows: cross });
  assert.equal(s.pollGate.considered, 3);
  assert.equal(s.pollGate.admitted, 1, 'the party row and the reviewed row are both refused');
  assert.equal(s.pollGate.excluded.length, 2);
  assert.equal(s.pollRaces[0].asOf, '2026-09-21', 'the signal carries its capture date so the runner can gate look-ahead');
  close(s.pollRaces[0].pollProb, 1 / (1 + Math.exp(-8 / s.k)), 1e-4);
  assert.equal(s.ratingsGate.admitted, 1, 'the independent-senate seat is a different question from the bands');
  assert.equal(s.ratingsGate.excluded[0].state, 'NE');
  assert.equal(s.crossLayer.length, 1);
  assert.equal(s.crossLayer[0].crowdProb, 0.55);
  assert.equal(s.crossLayer[0].asOf, '2026-09-20');
});

test('the combo legs are exactly the four mutually exclusive outcomes', () => {
  assert.equal(COMBO_LEGS.length, 4);
  const seen = new Set(COMBO_LEGS.map((l) => `${l.house}${l.senate}`));
  assert.deepEqual([...seen].sort(), ['DD', 'DR', 'RD', 'RR'], 'every house/senate combination is present exactly once');
  assert.equal(new Set(COMBO_LEGS.map((l) => l.ticker)).size, 4);
});

test('signalsForTradingDay keeps only rows captured strictly before the trading day', () => {
  const signals = {
    pollRaces: [{ id: 'prior', asOf: '2026-09-19' }, { id: 'same', asOf: '2026-09-20' }, { id: 'blank', asOf: '' }],
    polls: { ratings: [{ state: 'XX', asOf: '2026-09-19' }, { state: 'YY', asOf: '2026-09-20' }] },
    crossLayer: [{ question: 'Q', asOf: '2026-09-19' }, { question: 'R', asOf: '2026-09-20' }],
  };
  const day = signalsForTradingDay(signals, '2026-09-20');
  assert.deepEqual(day.pollRaces.map((r) => r.id), ['prior']);
  assert.deepEqual(day.polls.ratings.map((r) => r.state), ['XX']);
  assert.deepEqual(day.crossLayer.map((r) => r.question), ['Q']);
});

test('poll-anchor-26 and ratings-ratchet refuse a same-day capture even if the runner forgets the filter', () => {
  const dates = ['2026-09-20'];
  const poll = FORWARD_FIELD.find((s) => s.username === 'poll-anchor-26');
  const ratings = FORWARD_FIELD.find((s) => s.username === 'ratings-ratchet');
  const priorPoll = runForwardStrategy({
    strategy: poll,
    universe: makeUniverse([row({ ticker: 'TEST-26-D', date: '2026-09-20', bid: 0.40, ask: 0.42 })], dates),
    settlements: {},
    signalsByDate: { '2026-09-20': { pollRaces: [{ kalshiTicker: 'TEST-26-D', pollProb: 0.9, asOf: '2026-09-19' }], polls: { ratings: [] }, crossLayer: [] } },
  }).result;
  const samePoll = runForwardStrategy({
    strategy: poll,
    universe: makeUniverse([row({ ticker: 'TEST-26-D', date: '2026-09-20', bid: 0.40, ask: 0.42 })], dates),
    settlements: {},
    signalsByDate: { '2026-09-20': { pollRaces: [{ kalshiTicker: 'TEST-26-D', pollProb: 0.9, asOf: '2026-09-20' }], polls: { ratings: [] }, crossLayer: [] } },
  }).result;
  assert.equal(priorPoll.trades, 1, 'a prior-day poll signal must be allowed to order');
  assert.equal(samePoll.trades, 0, 'a same-day poll capture must not order');
  const band = { kalshiTicker: 'TEST-26-D', bandLow: 0.35, bandHigh: 0.65, state: 'XX' };
  const priorRatings = runForwardStrategy({
    strategy: ratings,
    universe: makeUniverse([row({ ticker: 'TEST-26-D', date: '2026-09-20', bid: 0.80, ask: 0.82 })], dates),
    settlements: {},
    signalsByDate: { '2026-09-20': { pollRaces: [], polls: { ratings: [{ ...band, asOf: '2026-09-19' }] }, crossLayer: [] } },
  }).result;
  const sameRatings = runForwardStrategy({
    strategy: ratings,
    universe: makeUniverse([row({ ticker: 'TEST-26-D', date: '2026-09-20', bid: 0.80, ask: 0.82 })], dates),
    settlements: {},
    signalsByDate: { '2026-09-20': { pollRaces: [], polls: { ratings: [{ ...band, asOf: '2026-09-20' }] }, crossLayer: [] } },
  }).result;
  assert.equal(priorRatings.trades, 1, 'a price outside the band on a prior-day rating must order');
  assert.equal(sameRatings.trades, 0, 'a same-day rating capture must not order');
});

test('combo-coherence records the best edge across every priceable day, and the fee series is the universe entry', () => {
  registerSeriesFees({ ZZCOMBO: { fee_type: 'quadratic', fee_multiplier: 0 } });
  const dates = ['2026-09-20', '2026-09-21'];
  const rows = [];
  for (const date of dates) {
    const ask = date === '2026-09-20' ? 0.20 : 0.40;
    for (const l of COMBO_LEGS) rows.push(row({ ticker: l.ticker, date, bid: ask - 0.01, ask, v24: 100 }));
    rows.push(row({ ticker: HOUSE_CONTROL.D, date, bid: 0.50, ask: 0.52, v24: 100 }));
    rows.push(row({ ticker: SENATE_CONTROL.D, date, bid: 0.50, ask: 0.52, v24: 100 }));
  }
  const index = { byTicker: new Map(), usElectionSeries: new Set(['ZZCOMBO', 'CONTROLH', 'CONTROLS']) };
  for (const l of COMBO_LEGS) index.byTicker.set(l.ticker, { series: 'ZZCOMBO', sub: l.key, closeTime: '2027-02-01T00:00:00Z' });
  index.byTicker.set(HOUSE_CONTROL.D, { series: 'CONTROLH', sub: 'D', closeTime: '2027-02-01T00:00:00Z' });
  index.byTicker.set(SENATE_CONTROL.D, { series: 'CONTROLS', sub: 'D', closeTime: '2027-02-01T00:00:00Z' });
  const universe = buildContestUniverse({ panelRows: rows, index });
  const { result } = runForwardStrategy({ strategy: comboCoherence, universe, settlements: {}, signalsByDate: {} });
  const scan = scanComboEdges({ dates, eligible: universe.eligible });
  assert.equal(result.strategyMetrics.daysTheFullBasketWasPriceable, 2);
  assert.equal(result.strategyMetrics.bestObservedEdge.date, '2026-09-20', 'the cheaper earlier day must beat the last day');
  assert.equal(result.strategyMetrics.bestObservedEdge.feePerContract, 0, 'fee series is ZZCOMBO (M=0), not the ticker prefix');
  assert.equal(result.strategyMetrics.daysThePairTradeWasPriceable, 4, 'both control pairs on both priceable days');
  assert.deepEqual(scan.bestObservedEdge, result.strategyMetrics.bestObservedEdge);
  assert.equal(scan.daysThePairTradeWasPriceable, result.strategyMetrics.daysThePairTradeWasPriceable);
  assert.ok(result.trades > 0, 'a fee-clearing basket must trade');
});

// ---------------------------------------------------------------------------
// 6. The committed season artifact must satisfy the same invariants
// ---------------------------------------------------------------------------
const seasonPath = 'data/contest/forward-2026/season.json';
test('the committed season holds its own accounting identity for every entrant', { skip: !existsSync(join(ROOT, seasonPath)) && 'run `npm run contest-forward` first' }, () => {
  const season = readJson(seasonPath);
  assert.equal(season.results.length, 12);
  for (const r of season.results) {
    assert.equal(r.accountingIdentityHolds, true, `${r.username} broke the identity`);
    close(r.identityLegs.sum, r.netEquity, 1e-6);
    close(r.netEquity, STARTING_CAPITAL + r.realizedPnl + r.unrealizedPnl, 1e-6);
    close(r.netReturnPct, ((r.netEquity - STARTING_CAPITAL) / STARTING_CAPITAL) * 100, 1e-6);
  }
  for (const r of season.results) {
    if (r.ranked) assert.ok(r.tradingDays >= MIN_TRADING_DAYS_TO_RANK, `${r.username} is ranked below the minimum`);
    if (!r.ranked) assert.ok(r.trades === 0 || r.tradingDays < MIN_TRADING_DAYS_TO_RANK, `${r.username} is unranked without a rule that says so`);
  }
});

test('the committed fills only happen on days that were captured and in the eligible universe', { skip: !existsSync(join(ROOT, seasonPath)) && 'run `npm run contest-forward` first' }, () => {
  const season = readJson(seasonPath);
  const universe = readJson('data/contest/forward-2026/universe.json');
  const days = new Set(universe.dates);
  for (const r of season.results) {
    for (const f of r.fillLog) {
      if (f.action === 'settlement') continue;
      assert.ok(days.has(f.date), `${r.username} filled ${f.ticker} on ${f.date}, which was never captured`);
      assert.ok(f.shares > 0 && f.price > 0 && f.price < 1, `${r.username} filled at price ${f.price}`);
      assert.ok(f.executedAt.includes('yes_ask') || f.executedAt.includes('yes_bid'), `${r.username} filled without naming the captured field it priced from`);
    }
  }
});

test('the committed attribution reconciles for every entrant', { skip: !existsSync(join(ROOT, 'data/contest/forward-2026/attribution.json')) && 'run `npm run contest-forward` first' }, () => {
  const attr = readJson('data/contest/forward-2026/attribution.json');
  const season = readJson(seasonPath);
  for (const a of attr.attribution) {
    assert.equal(a.attributionReconciles, true, `${a.username}'s attribution does not add up`);
    const net = a.bySeries.reduce((s, b) => s + b.net, 0);
    const r = season.results.find((x) => x.username === a.username);
    close(net, r.netEquity - STARTING_CAPITAL, 1e-5);
    for (const b of a.bySeries) assert.notEqual(b.key, 'unknown', 'a series bucket must name a series');
  }
});

test('the canonical identity check is what refuses the unverifiable poll rows — never a silent pass', { skip: !existsSync(join(ROOT, seasonPath)) && 'run `npm run contest-forward` first' }, () => {
  const gate = readJson(seasonPath).signals.pollLayer;
  assert.equal(gate.considered, 31, 'every state race must be considered, not filtered before the gate sees it');
  assert.equal(gate.admitted + gate.excluded.length, gate.considered, 'admitted + excluded must reconstruct considered');
  assert.ok(gate.admitted < gate.considered);
  const byId = Object.fromEntries(gate.excluded.map((e) => [e.id, e.reason]));
  // The rows the repository's own check refuses. If the universe document ever
  // drops out of the loaders these disappear, the gate goes quiet and the
  // contest would trade markets that resolve on a different person or a party —
  // so they are asserted here by id, not just counted.
  for (const id of ['uh-hobby-2026-01-tx-governor', 'uh-hobby-2026-01-tx-senate', 'saint-anselm-2026-06-nh-senate', 'stetson-2026-04-fl-senate', 'rasmussen-2026-09-ak-senate']) {
    assert.ok(byId[id], `${id} must be refused by the repository identity check`);
    assert.match(byId[id], /identity check|party/, `${id} must be refused for an identity reason`);
  }
  // review-flagged and unmappable rows are refused too, with their own reasons
  assert.equal(gate.excluded.filter((e) => /review flag/.test(e.reason)).length, 6);
  assert.ok(gate.excluded.some((e) => /no Kalshi market recorded/.test(e.reason)), 'a race with no market cannot be traded');
});

test('the signals ledger is one row per published signal per captured day and admits nothing usable early', { skip: !existsSync(join(ROOT, 'data/contest/forward-2026/signals-ledger.csv')) && 'run `npm run contest-forward` first' }, () => {
  const season = readJson(seasonPath);
  const lines = readFileSync(join(ROOT, 'data/contest/forward-2026/signals-ledger.csv'), 'utf8').trim().split('\n');
  const header = lines[0].split(',');
  assert.deepEqual(header, ['date', 'kind', 'key', 'detail', 'value', 'usable_that_day', 'note']);
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [header[i], v])));
  const days = new Set(rows.map((r) => r.date));
  assert.ok(days.size >= 3, `the ledger must cover at least 3 captured days, got ${days.size}`);
  const kinds = rows.reduce((a, r) => ({ ...a, [r.kind]: (a[r.kind] || 0) + 1 }), {});
  // Each admitted signal appears once per captured day — that is the whole point
  // of the ledger: a reader can see which day a signal was or was not knowable.
  assert.equal(kinds.poll, season.signals.pollLayer.admitted * days.size);
  assert.equal(kinds.rating, season.signals.pollLayer.ratingsGate.admitted * days.size);
  assert.equal(kinds.crosslayer, season.signals.crossLayerRows * days.size);
  assert.equal(rows.length, kinds.poll + kinds.rating + kinds.crosslayer);
  // Look-ahead guard: a poll or rating row is "usable" only on trading days
  // STRICTLY AFTER the poll-layer's capture date. Rows captured on or before the
  // same trading day must all be refused — otherwise the strategy is reading
  // the present panel with hindsight. The poll layer's capture date is the only
  // gate; the cross-layer rows have their own per-snapshot timestamp.
  const pollAsOf = season.signals.pollLayer.asOf;
  const usablePollOrRating = rows.filter((r) => /poll|rating/.test(r.kind) && r.usable_that_day !== 'no');
  for (const r of usablePollOrRating) {
    assert.ok(r.date > pollAsOf, `poll/rating row usable on ${r.date} but poll layer was captured on ${pollAsOf} — a same-day or earlier trading day must not be usable`);
  }
  // The poll layer's capture date may be on any of the trading days or between
  // them; the strict-after invariant is what matters, not strict-inequality
  // with lastCapturedDay.
  assert.ok(pollAsOf, 'the poll layer must record its capture date');
  // Cross-layer rows are timestamped to the minute, so a reading published
  // before that day's panel legitimately is usable the same day.
  const usable = rows.filter((r) => r.usable_that_day === 'yes');
  assert.ok(usable.length > 0, 'the cross-layer entrant must have something to trade on');
  assert.ok(usable.every((r) => r.kind === 'crosslayer' || r.date > pollAsOf), 'only cross-layer rows can be usable on the poll capture day or earlier');
});

const listPath = 'data/kalshi/universe/market-list-latest.json';
test('the published market list accounts for every market it lists', { skip: !existsSync(join(ROOT, listPath)) && 'run `npm run market-list` first' }, () => {
  const doc = readJson(listPath);
  const csv = readFileSync(join(ROOT, 'data/kalshi/universe/market-list-latest.csv'), 'utf8').trim().split('\n');
  assert.equal(csv.length - 1, doc.totalListed, 'the CSV must hold exactly the listed rows');
  assert.deepEqual(csv[0].split(',').slice(0, 6), ['ticker', 'event_ticker', 'series', 'series_from_prefix', 'us_election_series', 'yes_sub_title']);
  // Every listed market must carry a reason the universe builder really applies:
  // an unclassified row would mean the list and the scored universe disagree.
  const reasons = Object.keys(doc.eligibilityBreakdown).sort();
  assert.ok(!reasons.includes('unclassified-needs-review'), 'no row may be unclassified');
  assert.equal(Object.values(doc.eligibilityBreakdown).reduce((a, b) => a + b, 0), doc.totalListed);
  assert.equal(doc.gate.reconciliationBalances, true);
  assert.deepEqual(doc.errors, []);
  assert.equal(doc.eligibilityBreakdown['contest-eligible'], doc.contestEligibleCount);
  // The ladder must show the collector's own audit counters, and the rung the
  // arithmetic gate checks must be present.
  const steps = doc.reconciliationLadder.map((r) => r.step);
  assert.ok(steps.some((s) => /TRADED open markets/.test(s)));
  assert.ok(steps.some((s) => /contest-eligible markets/.test(s)));
  assert.ok(steps.some((s) => /excluded by the season window/.test(s)));
  for (const r of doc.reconciliationLadder) assert.ok(r.basis && r.method, `rung "${r.step}" must name its file and method`);
});

test('the published season states the rules it follows and the ones it adapts', { skip: !existsSync(join(ROOT, seasonPath)) && 'run `npm run contest-forward` first' }, () => {
  const { model, status, lastCapturedDay } = readJson(seasonPath);
  assert.equal(model.seasonId, 'S1-2026');
  assert.equal(model.startingCapitalPerEntrant, 100000);
  assert.match(model.ranking, /MARK|mark-to-market|NET EQUITY/i);
  assert.match(model.dailyDeploymentNote, /ADAPTATION/);
  assert.match(model.execution, /yes_ask/);
  assert.match(model.marks, /carriedMark|one-sided/i);
  assert.ok(model.feeProvenance.formula.includes('0.07'));
  assert.ok(model.feeProvenance.schedule.startsWith('https://'), 'the fee schedule must link to the official document');
  assert.equal(model.feeProvenance.makerDefault, 0);
  assert.ok(String(model.feeProvenance.makerFormula).includes('0.0175'));
  const reg = readJson('data/kalshi/universe/series.json');
  const numeric = reg.series.filter((s) => typeof s.fee_multiplier === 'number' && Number.isFinite(s.fee_multiplier)).length;
  assert.equal(model.feeProvenance.seriesWithCapturedConfig, numeric, 'the published count must be the registration return, not a pre-call counter');
  assert.equal(model.feeProvenance.seriesUsingDocumentedDefault, reg.series.length - numeric);
  assert.ok(lastCapturedDay && status.length > 20);
});

test('the combo-edge artifact matches the strategy and records every priceable day', { skip: !existsSync(join(ROOT, 'data/contest/forward-2026/combo-edges.json')) && 'run `npm run contest-forward` first' }, () => {
  const edges = readJson('data/contest/forward-2026/combo-edges.json');
  const season = readJson(seasonPath);
  const entrant = season.results.find((r) => r.username === 'combo-coherence');
  assert.deepEqual(edges.bestObservedEdge, entrant.strategyMetrics.bestObservedEdge);
  assert.equal(edges.daysTheFullBasketWasPriceable, entrant.strategyMetrics.daysTheFullBasketWasPriceable);
  assert.equal(edges.daysThePairTradeWasPriceable, entrant.strategyMetrics.daysThePairTradeWasPriceable);
  assert.equal(edges.agreesWithStrategy, true);
  assert.equal(edges.trades, entrant.trades);
  assert.equal(edges.days.filter((d) => d.priceable).length, edges.daysTheFullBasketWasPriceable);
  for (const d of edges.days.filter((x) => x.priceable)) {
    assert.equal(d.legs.length, 4);
    assert.ok(d.legs.every((l) => typeof l.series === 'string' && l.series.length > 0));
  }
});

test('crosslayer fills are tied to a prior snapshot, the taker cross, and takerFee', { skip: !existsSync(join(ROOT, 'data/contest/forward-2026/crosslayer-fills.json')) && 'run `npm run contest-forward` first' }, () => {
  const recon = readJson('data/contest/forward-2026/crosslayer-fills.json');
  const season = readJson(seasonPath);
  const fills = season.results.find((r) => r.username === 'crosslayer-arb').fillLog.filter((f) => f.action === 'enter');
  assert.equal(recon.fills.length, fills.length);
  assert.equal(recon.untied, 0);
  assert.equal(recon.threshold, 0.05);
  for (const f of recon.fills) {
    assert.equal(f.tied, true, f.reason || f.ticker);
    assert.equal(typeof f.binding.snapshotId, 'string');
    assert.equal(typeof f.binding.crowdProb, 'number');
    assert.equal(typeof f.binding.kalshiSnapshotMid, 'number');
    assert.equal(typeof f.binding.panelMid, 'number');
    assert.equal(typeof f.binding.expectedFee, 'number');
    assert.equal(f.binding.priceMatches, true);
    assert.equal(f.binding.feeMatches, true);
    assert.equal(f.binding.sideMatches, true);
  }
});
