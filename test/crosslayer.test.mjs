// Offline tests for the cross-layer scorer, the Metaculus / State Navigate collectors' parsers and the
// R13 rendering monitor. Fixtures under test/fixtures/ are TRANSCRIBED EXCERPTS of pages fetched on
// 2026-09-19 (labelled inside each file); they are parser fixtures, not captured data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brier, logLoss, midpoint, spread, scoreSnapshots } from '../src/crosslayer.js';
import { parseHub, appendSnapshots } from '../scripts/collect-metaculus.mjs';
import { parseNational, parseChamber } from '../scripts/collect-statenavigate.mjs';
import { parseEbo, parseDdhq, parse270, compareRange } from '../scripts/crosscheck-renderings.mjs';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('brier / logLoss clamp and score', () => {
  assert.ok(Math.abs(brier(0.6, 1) - 0.16) < 1e-12);
  assert.ok(Math.abs(brier(1.5, 1) - 0.000025) < 1e-12); // clamped
  assert.ok(logLoss(0.995, 0) > 5 && Number.isFinite(logLoss(1, 0)));
  assert.equal(brier('x', 1), null);
});

test('midpoint and spread across layers', () => {
  assert.equal(midpoint({ bid: 0.59, ask: 0.6 }), 0.595);
  assert.equal(midpoint(0.517), 0.517);
  assert.equal(midpoint({}), null);
  assert.ok(Math.abs(spread({ kalshi: { bid: 0.59, ask: 0.6 }, metaculus: 0.517 }) - 0.078) < 1e-9);
  assert.equal(spread({ metaculus: 0.5 }), null);
});

test('scoreSnapshots stays pending without an outcome, refuses look-ahead and source-less outcomes', () => {
  const snaps = [{ id: 'a', question: 'Q', electionDate: '2026-11-03', capturedAt: '2026-09-19T15:59:45Z', layers: { kalshi: { bid: 0.59, ask: 0.6 }, metaculus: 0.517 } }];
  const pending = scoreSnapshots(snaps, {});
  assert.equal(pending.rows[0].status, 'pending');
  assert.equal(pending.byLayer.kalshi.scored, 0);
  const noSrc = scoreSnapshots(snaps, { Q: { y: 1, sources: [] } });
  assert.equal(noSrc.rows[0].status, 'pending');
  assert.equal(noSrc.refused.length, 1);
  const scored = scoreSnapshots(snaps, { Q: { y: 1, certifiedOn: '2026-12-01', sources: [{ name: 'x', url: 'https://example.gov' }] } });
  assert.equal(scored.rows[0].status, 'scored');
  assert.ok(scored.rows[0].layers.metaculus.brier > scored.rows[0].layers.kalshi.brier); // D win favours the higher-D layer
  assert.equal(scored.byLayer.metaculus.scored, 1);
  const badY = scoreSnapshots(snaps, { Q: { y: 2, sources: [{ url: 'https://example.gov' }] } });
  assert.equal(badY.rows[0].status, 'pending');
  assert.match(badY.refused[0].reason, /must be 0 or 1/);
  const late = scoreSnapshots([{ ...snaps[0], capturedAt: '2026-11-04T01:00:00Z' }], { Q: { y: 1, sources: [{ url: 'https://example.gov' }] } });
  assert.equal(late.rows[0].status, 'refused-lookahead');
});

test('Metaculus hub parser reproduces the 2026-09-19 numbers and cross-checks quadrants', () => {
  const p = parseHub(fx('metaculus-hub-2026-09-19.txt'));
  assert.equal(p.parse, 'ok');
  assert.equal(p.houseD, 88.8); assert.equal(p.houseR, 11.2);
  assert.equal(p.senateD, 51.7); assert.equal(p.senateR, 48.3);
  assert.deepEqual(p.control, { DH_DS: 50.7, DH_RS: 38.1, RH_RS: 10.2, RH_DS: 1.0 });
  assert.equal(p.seatMedians.house, 'D +13');
  assert.equal(p.seatMedians.senate, 'Even split');
  assert.equal(p.keyDriverDataDate, 'Sep 19, 2026');
  assert.match(p.racesLine, /18 of 35 races lean Democrat/);
  assert.deepEqual(p.consistencyFlags, []); // 50.7 + 1.0 = 51.7 = senateD
  // HTML variant of the same numbers (tags between labels and values) must parse identically
  const asHtml = '<h4>House</h4><span>Democrats</span><b>88.8%</b><span>Republicans</span><b>11.2%</b><h4>Senate</h4><span>Democrats</span><b>51.7%</b><span>Republicans</span><b>48.3%</b><li>Dem House / Dem Senate <b>50.7%</b></li><li>Rep House / Dem Senate <b>1.0%</b></li>';
  const h = parseHub(asHtml);
  assert.deepEqual([h.houseD, h.senateD, h.control.DH_DS, h.control.RH_DS], [88.8, 51.7, 50.7, 1.0]);
  const bad = parseHub('<html><body>nothing here</body></html>');
  assert.equal(bad.parse, 'failed');
  assert.ok(bad.sample);
});

test('appendSnapshots adds one row per question per day and pairs Kalshi only from the same UTC day', () => {
  const parsed = parseHub(fx('metaculus-hub-2026-09-19.txt'));
  const snap = { snapshots: [] };
  const universe = { capturedAt: '2026-09-19T15:59:45Z', capturedFrom: 'fixture', events: [{ event_ticker: 'CONTROLS-2026', markets: [{ ticker: 'CONTROLS-2026-D', yes_bid: 0.59, yes_ask: 0.6, last_price: 0.6 }] }] };
  assert.equal(appendSnapshots(snap, parsed, { capturedAt: '2026-09-19T20:00:00Z', universe }), 2);
  assert.equal(snap.snapshots[0].layers.metaculus, 0.517);
  assert.equal(snap.snapshots[0].layers.kalshi.bid, 0.59);
  assert.equal(snap.snapshots[1].layers.kalshi, undefined); // no House market in the fixture universe
  assert.equal(appendSnapshots(snap, parsed, { capturedAt: '2026-09-19T21:00:00Z', universe }), 0); // idempotent per day
  const s2 = { snapshots: [] };
  appendSnapshots(s2, parsed, { capturedAt: '2026-09-20T20:00:00Z', universe });
  assert.equal(s2.snapshots[0].layers.kalshi, undefined); // stale (previous-day) Kalshi capture is not paired
});

test('State Navigate parsers reproduce the national headline and the VA lower-chamber line', () => {
  const n = parseNational(fx('statenavigate-national-2026-09-19.txt'));
  assert.equal(n.parse, 'ok');
  assert.deepEqual([n.seatsForecasted, n.dPickups, n.rPickups, n.statesWithModel, n.chambers, n.closeSeats, n.projectedFlips], [2306, 124, 11, 14, 27, 143, 135]);
  const c = parseChamber(fx('statenavigate-va-lower-2026-09-19.txt'));
  assert.equal(c.parse, 'ok');
  assert.deepEqual(c.D, { seats: 60, change: 9 });
  assert.deepEqual(c.R, { seats: 40, change: -9 });
  assert.equal(c.odds.dMajority, 82);
  assert.equal(c.odds.tie, 0.5); // "<1%" recorded as 0.5, documented
  assert.equal(c.title, '2025 Virginia State Legislative Forecast');
  assert.equal(parseChamber('<p>no forecast</p>').parse, 'failed');
});

test('R13 parsers: EBO Kalshi row, DDHQ context odds, 270toWin panel; compareRange flags beyond tolerance', () => {
  const e = parseEbo(fx('ebo-2026-09-19.txt'));
  assert.equal(e.extract, 'ok');
  assert.deepEqual(e.senateDemKalshi, { bid: 0.584, ask: 0.594 });
  assert.deepEqual(e.senateRepKalshi, { bid: 0.406, ask: 0.416 });
  assert.match(e.stamp, /Sep 19, 2026/);
  const d = parseDdhq(fx('ddhq-2026-09-19.txt'));
  assert.equal(d.houseD, 0.7); assert.equal(d.senateD, 0.52);
  const t = parse270(fx('270towin-2026-09-19.txt'));
  assert.equal(t.extract, 'ok');
  assert.deepEqual(t.kalshiPanel, { a: 0.57, b: 0.41, asOf: 'Sep. 19, 2026 at 20:29 UTC' });
  assert.equal(t.kpow.value, '+1.90 D');
  const cmp = compareRange(e.senateDemKalshi, { yes_bid: 0.59, yes_ask: 0.6 });
  assert.equal(cmp.comparable, true);
  assert.equal(cmp.flagged, false); // 0.589 vs 0.595
  assert.equal(compareRange(e.senateDemKalshi, { yes_bid: 0.7, yes_ask: 0.71 }).flagged, true);
  assert.equal(compareRange(null, null).comparable, false);
});

test('seed snapshot file is consistent with the captured Kalshi universe and stays pending', () => {
  const snap = JSON.parse(readFileSync(new URL('../data/crosslayer/snapshots.json', import.meta.url), 'utf8'));
  const out = JSON.parse(readFileSync(new URL('../data/crosslayer/outcomes.json', import.meta.url), 'utf8'));
  const res = scoreSnapshots(snap.snapshots, out.outcomes);
  assert.ok(res.rows.length >= 2);
  for (const r of res.rows) assert.ok(['pending', 'scored'].includes(r.status));
  const sen = snap.snapshots.find((s) => s.id === '2026-09-19-senate');
  assert.equal(sen.layers.kalshi.bid, 0.59); assert.equal(sen.layers.kalshi.ask, 0.6); assert.equal(sen.layers.metaculus, 0.517);
  assert.ok(Math.abs(spread(sen.layers) - 0.078) < 1e-9);
  const hse = snap.snapshots.find((s) => s.id === '2026-09-19-house');
  assert.equal(hse.layers.kalshi.bid, 0.89); assert.equal(hse.layers.metaculus, 0.888);
});
