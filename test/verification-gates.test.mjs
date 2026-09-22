import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brier, logLoss, midpoint, scoreSnapshots, timestamp } from '../src/crosslayer.js';
import { compareRacesToMarkets, demMargin } from '../src/poll-layer.js';
import { comparableCapture, compareRange, compareLast } from '../scripts/crosscheck-renderings.mjs';
import { looksLikeChallenge } from '../scripts/lib/render.mjs';
const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url)));
// SYNTHETIC fixtures: never entered into captured data or official outcomes.
const opts = { asOf: '2026-12-03', authorities: [{ id: 'test', category: 'Government — state & local', status: 'verified', url: 'https://example.gov/' }] };
const snap = { id: 'fixture', question: 'Q', electionDate: '2026-11-03', capturedAt: '2026-10-01T00:00:00Z', layers: { metaculus: 0.7, kalshi: { bid: 0.5, ask: 0.6 } } };
const outcome = { y: 1, certifiedOn: '2026-12-01', sources: [{ sourceId: 'test', url: 'https://example.gov/certified', kind: 'certified-canvass', certificationQuote: 'The board certifies these election results.', retrievedAt: '2026-12-02T10:00:00Z' }] };
const score = (s = snap, o = outcome, options = opts) => scoreSnapshots([s], { Q: o }, options);

test('cross-layer: invalid probabilities never become confident forecasts', () => {
  for (const v of [NaN, Infinity, -Infinity, -0.01, 1.01, '0.5', null]) {
    assert.equal(brier(v, 1), null); assert.equal(logLoss(v, 1), null); assert.equal(midpoint(v), null);
  }
  assert.equal(brier(0, 0), 0); assert.equal(brier(1, 0), 1);
  assert.equal(brier(0.5, 2), null); assert.equal(logLoss(0.5, 2), null);
  for (const v of [{ bid: 0.8, ask: 0.2 }, { bid: 0.5 }, { bid: null, ask: 0.6 }]) assert.equal(midpoint(v), null);
  const s = score({ ...snap, layers: { kalshi: 2, metaculus: 0.7 } });
  assert.equal(s.byLayer.kalshi.scored, 0); assert.equal(s.refused.length, 1);
});

test('cross-layer: certification requires dated, retrieved evidence on an approved origin', () => {
  assert.equal(score().scoredCount, 1);
  for (const o of [
    { ...outcome, certifiedOn: null }, { ...outcome, certifiedOn: '2026-02-30' },
    { ...outcome, certifiedOn: '2026-10-01' }, { ...outcome, certifiedOn: '2027-01-01' },
    { ...outcome, sources: [] }, { ...outcome, sources: [null] },
    ...[{ url: 'https://example.gov.evil.test/canvass' }, { url: 'javascript:alert(1)' }, { url: 'http://example.gov/results' },
      { kind: 'election-night' }, { sourceId: 'news' }, { certificationQuote: '' }, { retrievedAt: '2026-11-01T00:00:00Z' }, { retrievedAt: '2027-01-01T00:00:00Z' }]
      .map((patch) => ({ ...outcome, sources: [{ ...outcome.sources[0], ...patch }] })),
  ]) assert.equal(score(snap, o).scoredCount, 0, JSON.stringify(o));
  assert.equal(score(snap, outcome, { ...opts, authorities: [] }).scoredCount, 0);
});

test('cross-layer: parsed times prevent offset, missing-date, duplicate and layer look-ahead leaks', () => {
  for (const v of [undefined, 'garbage', '2026-02-30T00:00:00Z', '2026-10-01']) assert.ok(Number.isNaN(timestamp(v)));
  for (const capturedAt of [null, 'garbage', '2026-11-02T23:30:00-02:00', '2027-01-01T00:00:00Z']) assert.equal(score({ ...snap, capturedAt }).scoredCount, 0);
  assert.equal(score({ ...snap, electionDate: '2026-02-30' }).scoredCount, 0);
  const r = score({ ...snap, layers: { ...snap.layers, kalshi: { ...snap.layers.kalshi, capturedAt: '2026-11-03T01:00:00Z' } } });
  assert.equal(r.byLayer.kalshi.scored, 0); assert.equal(r.pairedComparison.questions, 0);
  assert.equal(scoreSnapshots([snap, snap], { Q: outcome }, opts).scoredCount, 1);
});

test('paired comparison uses the same question and latest jointly answered capture once', () => {
  const later = { ...snap, id: 'later', capturedAt: '2026-10-02T00:00:00Z' };
  const unpaired = { ...snap, id: 'unpaired', capturedAt: '2026-10-03T00:00:00Z', layers: { metaculus: 0.8 } };
  const p = scoreSnapshots([snap, later, unpaired], { Q: outcome }, opts).pairedComparison;
  assert.equal(p.questions, 1); assert.equal(p.rows[0].snapshotId, 'later');
  assert.equal(p.rows[0].gap, 0.15); assert.ok(p.meanBrierDelta < 0);
});

test('polls: wrong nominees are retained as history but never compared as the current matchup', () => {
  const layer = read('data/polls/poll-layer-2026.json'), u = read('data/kalshi/universe/latest.json');
  const rows = compareRacesToMarkets(layer, u).rows;
  const old = rows.find((r) => r.id === 'stetson-2026-04-fl-senate');
  assert.equal(old.gap, null); assert.equal(old.marketDemProb, null); assert.match(old.candidateMismatch, /Vindman.*Nixon/);
  const current = rows.find((r) => r.id === 'unf-2026-07-fl-senate');
  assert.equal(current.dem, 'Angie Nixon'); assert.equal(current.demPct, 42); assert.equal(current.repPct, 50);
  const multi = rows.find((r) => r.id === 'msu-2026-08-mi-governor');
  assert.equal(multi.pollImpliedDemProb, null); assert.equal(multi.gap, null);
  assert.equal(current.candidateMismatch, null); assert.equal(typeof current.gap, 'number');
  assert.equal(demMargin({ candidates: { D: { pct: '50' }, R: { pct: 45 } } }), null);
});

test('R13: reject invalid/partial quotes and stale timestamps; soft error pages are not reachable content', () => {
  assert.equal(compareRange({ bid: 0.5, ask: 0.6 }, { yes_bid: 0.5 }).comparable, false);
  assert.equal(compareRange({ bid: 0.9, ask: 0.6 }, { yes_bid: 0.5, yes_ask: 0.6 }).comparable, false);
  assert.equal(compareLast(NaN, { last_price: 0.5 }).comparable, false);
  assert.equal(comparableCapture('2026-09-21T00:00:00Z', '2026-09-20T00:00:00Z'), true);
  assert.equal(comparableCapture('2026-09-21T00:00:01Z', '2026-09-20T00:00:00Z'), false);
  assert.equal(comparableCapture('bad', undefined), false);
  assert.ok(looksLikeChallenge(200, '<h1>Access denied</h1>'));
  assert.ok(looksLikeChallenge(200, '<title>Page Not Found... | Nevada Secretary of State</title>'));
});

test('session 9: twenty unique direct-fetch admissions match their evidence and no declined source is admitted', () => {
  const m = read('data/sources/master.json'), a = read('data/sources/admissions-2026-09-21.json');
  assert.equal(a.entries.length, 20);
  assert.equal(new Set(a.entries.map((x) => x.id)).size, 20);
  // 2026-09-21 admissions: 20 session 9 + 20 session 10 + 20 session 11 batch3 + 16 follow-up batch4.
  const totalForDate = m.sources.filter((x) => x.verifiedOn === '2026-09-21').length;
  assert.ok(totalForDate >= 20, `expected >=20 for 2026-09-21, got ${totalForDate}`);
  assert.equal(totalForDate, 76, `batch4 adds 16 more, total should be 76, got ${totalForDate}`);
  for (const e of a.entries) {
    const s = m.sources.find((x) => x.id === e.id);
    assert.equal(s.url, e.url); assert.equal(s.status, 'verified'); assert.ok(s.verified.includes(e.observation));
    assert.equal(s.category, 'Government — state & local');
  }
  for (const e of a.notAdmitted) assert.ok(!m.sources.some((s) => s.url === e.url));
  // Also verify batch2 file if present
  try {
    const b = read('data/sources/admissions-2026-09-21-batch2.json');
    assert.equal(b.entries.length, 20);
    assert.equal(new Set(b.entries.map((x) => x.id)).size, 20);
    for (const e of b.entries) {
      const s = m.sources.find((x) => x.id === e.id);
      assert.ok(s, `batch2 id ${e.id} not in master`);
      assert.equal(s.url, e.url);
      assert.equal(s.status, 'verified');
    }
    for (const e of b.notAdmitted) assert.ok(!m.sources.some((s) => s.url === e.url));
  } catch (e) {
    // if batch2 file not present, skip (backward compat)
    if (!String(e).includes('no such file') && !String(e).includes('ENOENT')) throw e;
  }
  // Session 11 batch3 (2026-09-21): 20 more; 18 verified + 2 partisan-aligned commercial
  // pollsters (cygnal, change-research) admitted at needs-review like DFP/Civiqs.
  const b3 = read('data/sources/admissions-2026-09-21-batch3.json');
  assert.equal(b3.entries.length, 20);
  assert.equal(new Set(b3.entries.map((x) => x.id)).size, 20);
  for (const e of b3.entries) {
    const s = m.sources.find((x) => x.id === e.id);
    assert.ok(s, `batch3 id ${e.id} not in master`);
    assert.equal(s.url, e.url);
    assert.ok(['verified', 'needs-review'].includes(s.status), `batch3 ${e.id}: status ${s.status}`);
    assert.ok(s.verified.includes(e.observation), `batch3 ${e.id}: observation must be quoted verbatim in master verified text`);
  }
  for (const e of b3.notAdmitted) assert.ok(!m.sources.some((s) => s.url === e.url), `batch3 notAdmitted ${e.id} must not be in master`);
  const b4 = read('data/sources/admissions-2026-09-21-batch4.json');
  assert.equal(b4.entries.length, 16);
  for (const e of b4.entries) {
    const s = m.sources.find((x) => x.id === e.id);
    assert.ok(s, e.id);
    assert.equal(s.url, e.url);
    assert.equal(s.verifiedOn, '2026-09-21');
    assert.equal(s.category, e.category);
  }
  for (const e of b4.notAdmitted) assert.ok(!m.sources.some((s) => s.url === e.url), e.url);
  assert.equal(m.sources.find((s) => s.id === 'vote-org').category, 'Ratings, forecasts & analysis');
  assert.equal(m.sources.find((s) => s.id === 'rock-the-vote').category, 'Ratings, forecasts & analysis');
});

test('session 9 polls: primary-release subset sizes, method labels and nominee-specific scenarios', () => {
  const layer = read('data/polls/poll-layer-2026.json').stateRaces;
  const session9Ids = ['unf-2026-07-fl-governor', 'unf-2026-07-fl-senate', 'msu-2026-08-mi-senate', 'msu-2026-08-mi-governor'];
  const rows = layer.filter((x) => x.verifiedOn === '2026-09-21' && session9Ids.includes(x.id));
  assert.equal(rows.length, 4);
  for (const r of rows) {
    if (r.id.startsWith('unf')) { assert.equal(r.n, 848); assert.equal(r.moe, 3.8); assert.equal(r.methodFamily, 'voter-file-hybrid'); }
    else { assert.equal(r.n, 779); assert.equal(r.moe, null); assert.equal(r.methodFamily, null); assert.equal(r.review, true); }
  }
  // Session 11 added four Rasmussen stateRaces rows (plus one genericBallot row) dated 2026-09-21.
  // Each must keep the blended-method label — "do not pool unlabeled" discipline, irregularity #69.
  const ras = layer.filter((x) => x.verifiedOn === '2026-09-21' && x.id.startsWith('rasmussen-2026-09-'));
  assert.equal(ras.length, 4);
  for (const r of ras) assert.equal(r.methodFamily, 'ivr-rdd-online-panel-blend', `${r.id}: methodFamily`);
});
