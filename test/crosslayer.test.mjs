// Offline tests for the cross-layer scorer, the Metaculus / State Navigate collectors' parsers and the
// R13 rendering monitor. Fixtures under test/fixtures/ are TRANSCRIBED EXCERPTS of pages fetched on
// 2026-09-19 (labelled inside each file); they are parser fixtures, not captured data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brier, logLoss, midpoint, spread, scoreSnapshots } from '../src/crosslayer.js';
import { parseHub, appendSnapshots, parseQuestionPage, appendSeatSnapshots, SENATE_EVENT } from '../scripts/collect-metaculus.mjs';
import { parseNational, parseChamber } from '../scripts/collect-statenavigate.mjs';
import { parseEbo, parseDdhq, parse270, compareRange, compareLast } from '../scripts/crosscheck-renderings.mjs';
import { looksLikeChallenge, htmlToText, pageTitle } from '../scripts/lib/render.mjs';
import { verdictFor } from '../scripts/probe-hosts.mjs';

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

test('Metaculus hub parser (#63): a "Senate" in the navigation before the House card must not steal the House numbers; a chamber that contradicts the quadrants is marked inconsistent and not snapshotted', () => {
  // Shape of the headless-Chrome DOM text on 2026-09-20 (run 35484999487): nav mentions both chambers, then the cards in order.
  const dom = '<title>2026 US Midterm Elections | Metaculus</title><nav>Overview House Senate Governors Key drivers</nav>'
    + '<h4>House</h4><div>1d1w2mall</div><div>Democrats88.8%Republicans11.2%</div><div>5%23%41%59%77%95%</div>'
    + '<h4>Senate</h4><div>Democrats51.7%Republicans48.3%</div>'
    + '<h4>Congressional Control</h4><div>Dem House / Dem Senate50.7%Dem House / Rep Senate38.1%Rep House / Rep Senate10.2%Rep House / Dem Senate1.0%</div>';
  const p = parseHub(dom);
  assert.deepEqual([p.parse, p.houseD, p.senateD, p.consistencyFlags], ['ok', 88.8, 51.7, []]);
  // Pathological layout (both headings before both pairs): Senate reads the House pair → quadrant cross-check catches it.
  const grid = '<div>House</div><div>Senate</div><div>Democrats88.8%Republicans11.2%</div><div>Democrats51.7%Republicans48.3%</div>'
    + '<div>Dem House / Dem Senate50.7%Dem House / Rep Senate38.1%Rep House / Rep Senate10.2%Rep House / Dem Senate1.0%</div>';
  const g = parseHub(grid);
  assert.equal(g.inconsistent.senate, true);
  assert.match(g.consistencyFlags.join(' '), /senateD 88.8 vs quadrant-derived 51.7/);
  assert.notEqual(g.parse, 'ok');
  const snap = { snapshots: [] };
  assert.equal(appendSnapshots(snap, g, { capturedAt: '2026-09-20T03:16:55Z', universe: null }), 0, 'an inconsistent chamber is never written to the scoreboard');
  // Inconsistent Senate but consistent House: only the House row is written.
  const mixed = { ...g, houseD: 88.8, houseR: 11.2, inconsistent: { house: false, senate: true } };
  const s2 = { snapshots: [] };
  assert.equal(appendSnapshots(s2, mixed, { capturedAt: '2026-09-20T03:16:55Z', universe: null }), 1);
  assert.equal(s2.snapshots[0].question, 'HOUSE-CONTROL-2026');
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
  assert.equal(t.kalshiPanel.dem, 0.57); assert.equal(t.kalshiPanel.rep, 0.41); assert.equal(t.kalshiPanel.asOf, 'Sep. 19, 2026 at 20:29 UTC');
  assert.equal(t.kpow.value, '+1.90 D');
  // 2026-09-20 homepage text (the first live run failed on this panel, #58): heading-anchored, last-trade basis, KPOW token before "as of"
  const t2 = parse270(fx('270towin-2026-09-20.txt'));
  assert.equal(t2.extract, 'ok');
  assert.deepEqual([t2.kalshiPanel.dem, t2.kalshiPanel.rep, t2.kalshiPanel.asOf], [0.57, 0.41, 'Sep. 19, 2026 at 02:44 UTC']);
  assert.match(t2.kalshiPanel.basis, /most recent yes trade/);
  assert.deepEqual(t2.kpow, { value: '+1.90 D', asOf: '9/17/26 11:53 AM EDT' });
  const last = compareLast(t2.kalshiPanel.dem, { last_price: 0.58, yes_bid: 0.58, yes_ask: 0.59 });
  assert.equal(last.comparable, true); assert.equal(last.diff, -0.01); assert.equal(last.flagged, false);
  assert.equal(compareLast(0.57, { last_price: 0.7 }).flagged, true);
  assert.equal(compareLast(null, { last_price: 0.7 }).comparable, false);
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

// ---- session 7 (2026-09-20): per-seat Metaculus pages, seat pairing, fetch helpers, probe verdicts ----
test('Metaculus question-page parser: state group (four rendered states + hidden count), party choice, binary', () => {
  const g = parseQuestionPage(fx('metaculus-q40598-2026-09-20.txt'), 'state-group');
  assert.equal(g.parse, 'ok');
  assert.deepEqual(g.states, { RI: 99, OR: 99, CO: 98, MN: 92 }); // only what the server rendered — never the "19 others"
  assert.equal(g.othersHidden, 19);
  assert.equal(g.forecasters, 125);
  assert.match(g.title, /Democratic candidate win the 2026 US Senate election/);
  // the related-question cards AFTER "Forecast Timeline" (HI 98 / NM 92.2 / Peltola 54 / MT 94) must not leak into this question
  assert.equal(g.states.HI, undefined); assert.equal(g.states.NM, undefined); assert.equal(g.states.AK, undefined);
  const mt = parseQuestionPage('<h1>Which party will win the 2026 Montana Senate election?</h1><ul><li>Democrat</li><li>1 %</li><li>Republican</li><li>94%</li><li>Other</li><li>5%</li></ul><h2>Forecast Timeline</h2><p>Democrats 50.6% Republicans 49.3%</p>', 'party-choice');
  assert.deepEqual([mt.parse, mt.D, mt.R, mt.other, mt.consistencyFlag], ['ok', 1, 94, 5, undefined]);
  const ak = parseQuestionPage('<h1>Mary Peltola wins Alaska senate seat 2026?</h1><span>54%</span><span>chance</span><div>Forecast Timeline</div><p>60%chance</p>', 'binary');
  assert.deepEqual([ak.parse, ak.p], ['ok', 54]);
  const bad = parseQuestionPage('<html><body><title>Just a moment...</title></body></html>', 'state-group');
  assert.equal(bad.parse, 'failed'); assert.ok(bad.sample !== undefined);
});

test('appendSeatSnapshots: one row per seat per day, Kalshi paired only from a same-day capture, specials mapped, idempotent', () => {
  assert.equal(SENATE_EVENT('OH'), 'SENATEOHS-26'); assert.equal(SENATE_EVENT('FL'), 'SENATEFLS-26'); assert.equal(SENATE_EVENT('RI'), 'SENATERI-26');
  const g = { ...parseQuestionPage(fx('metaculus-q40598-2026-09-20.txt'), 'state-group'), office: 'senate', capturedFrom: 'https://www.metaculus.com/questions/40598/', note: 'n' };
  const ak = { ...parseQuestionPage('<h1>Mary Peltola wins Alaska senate seat 2026?</h1>54%chance Forecast Timeline', 'binary'), office: 'senate', state: 'AK', capturedFrom: 'https://www.metaculus.com/questions/41678/' };
  const universe = { capturedAt: '2026-09-20T00:53:32Z', capturedFrom: 'fx', events: [
    { event_ticker: 'SENATERI-26', markets: [{ ticker: 'SENATERI-26-D', yes_bid: 0.974, yes_ask: 0.984, last_price: 0.97 }] },
    { event_ticker: 'SENATEAK-26', markets: [{ ticker: 'SENATEAK-26-D', yes_bid: 0.69, yes_ask: 0.7, last_price: 0.68 }] },
  ] };
  const snap = { snapshots: [] };
  assert.equal(appendSeatSnapshots(snap, [g, ak], { capturedAt: '2026-09-20T03:00:00Z', universe }), 5);
  const ri = snap.snapshots.find((s) => s.question === 'SENATE-RI-2026');
  assert.equal(ri.layers.metaculus, 0.99); assert.equal(ri.layers.kalshi.ticker, 'SENATERI-26-D'); assert.equal(ri.layers.kalshi.bid, 0.974);
  const or = snap.snapshots.find((s) => s.question === 'SENATE-OR-2026');
  assert.equal(or.layers.kalshi, undefined); // no OR market in the fixture universe -> no leg invented
  const akRow = snap.snapshots.find((s) => s.question === 'SENATE-AK-2026');
  assert.equal(akRow.layers.metaculus, 0.54); assert.match(akRow.caveat, /candidate question/);
  assert.equal(snap.questions['SENATE-AK-2026'].kalshiEvent, 'SENATEAK-26');
  assert.equal(appendSeatSnapshots(snap, [g, ak], { capturedAt: '2026-09-20T05:00:00Z', universe }), 0); // idempotent per day
  const stale = { snapshots: [] };
  appendSeatSnapshots(stale, [g], { capturedAt: '2026-09-21T03:00:00Z', universe });
  assert.equal(stale.snapshots.find((s) => s.question === 'SENATE-RI-2026').layers.kalshi, undefined); // yesterday's Kalshi is never paired
  // Irregularity #59: Kalshi's Kentucky Senate event is tickered SENATELA-26. The title check pairs KY and refuses LA.
  assert.equal(SENATE_EVENT('KY'), 'SENATELA-26');
  const ky = { capturedAt: '2026-09-20T00:53:32Z', capturedFrom: 'fx', events: [{ event_ticker: 'SENATELA-26', title: 'Kentucky Senate winner?', markets: [{ ticker: 'SENATELA-26-D', yes_bid: 0.05, yes_ask: 0.061, last_price: 0.06 }] }] };
  const s2 = { snapshots: [] };
  const laQ = { kind: 'party-choice', parse: 'ok', office: 'senate', state: 'LA', D: 10, capturedFrom: 'u1' };
  const kyQ = { kind: 'party-choice', parse: 'ok', office: 'senate', state: 'KY', D: 6, capturedFrom: 'u2' };
  assert.equal(appendSeatSnapshots(s2, [laQ, kyQ], { capturedAt: '2026-09-20T03:00:00Z', universe: ky }), 2);
  const la = s2.snapshots.find((s) => s.question === 'SENATE-LA-2026');
  assert.equal(la.layers.kalshi, undefined); assert.match(la.kalshiSkipped, /does not name Louisiana/);
  assert.equal(s2.snapshots.find((s) => s.question === 'SENATE-KY-2026').layers.kalshi.ticker, 'SENATELA-26-D');
  // scorer accepts the seat rows and keeps them pending
  const res = scoreSnapshots(snap.snapshots, {});
  assert.equal(res.pendingCount, 5);
});

test('render helpers: interstitial detection, entity-safe text, title; probe verdicts', () => {
  assert.equal(looksLikeChallenge(403, '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>'), 'cloudflare-challenge');
  assert.equal(looksLikeChallenge(200, '<html><title>2026 US Midterm Elections | Metaculus</title></html>'), null);
  assert.equal(looksLikeChallenge(429, ''), 'rate-limited');
  assert.equal(htmlToText('<p>D&nbsp70 %</p><script>x=1</script>&#x1F1FA;&amp;'), 'D 70% &');
  assert.equal(pageTitle('<html><head><title> Hello &amp; bye </title></head></html>'), 'Hello & bye');
  assert.equal(verdictFor({ ok: true, attempts: [] }), 'reachable');
  assert.equal(verdictFor({ ok: false, attempts: [{ status: 403, challenge: 'cloudflare-challenge' }] }, { ok: true, textLength: 5000 }), 'reachable-rendered-only');
  assert.equal(verdictFor({ ok: false, attempts: [{ status: 403, challenge: 'cloudflare-challenge' }] }, { ok: true, challenge: 'cloudflare-challenge', textLength: 5000 }), 'blocked-cloudflare-challenge');
  assert.equal(verdictFor({ ok: false, attempts: [{ status: 404 }] }), 'http-404');
  assert.equal(verdictFor({ ok: false, attempts: [{ error: 'fetch failed' }] }), 'error');
});
