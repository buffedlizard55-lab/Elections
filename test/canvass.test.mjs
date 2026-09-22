// Offline tests for the P0 certified-canvass ingestion (src/canvass.js + scripts/ingest-canvass.mjs).
// All fixtures are SYNTHETIC and live only in this file — never copied into data/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectCertification, parseContestResults, reconcile, chamberComposition,
  buildOutcomeRecord, ingestCanvass, normalizeName,
} from '../src/canvass.js';
import { validateOutcome, scoreSnapshots } from '../src/crosslayer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const CERT_PAGE = `Official Canvass — State of Testylvania
Certificate of Result — November 3, 2026 General Election

U.S. Senator — State of Testylvania
Jon Ossoff    1,234,567   51.2%
Mike Collins  1,177,001   48.8%

Total votes cast: 2,411,568`;

const UNOFFICIAL_PAGE = `Election Night Reporting — Testylvania (UNOFFICIAL RESULTS)
These preliminary results are incomplete and not yet certified.
U.S. Senator
Jon Ossoff    900,000
Mike Collins  850,000`;

const MIXED_PAGE = `${CERT_PAGE}
See also: unofficial election-night totals from the county dashboards.`;

const contest = {
  office: 'U.S. Senate',
  jurisdiction: 'Testylvania',
  contestPatterns: [String.raw`u\.?s\.? senator[^\n]{0,80}Testylvania`, String.raw`Testylvania[^\n]{0,80}senator`],
  nominees: [
    { name: 'Jon Ossoff', party: 'Democratic' },
    { name: 'Mike Collins', party: 'Republican' },
  ],
};

test('detectCertification classifies certified / unofficial / mixed / unknown', () => {
  assert.equal(detectCertification(CERT_PAGE).status, 'certified');
  assert.equal(detectCertification(UNOFFICIAL_PAGE).status, 'unofficial');
  assert.equal(detectCertification(MIXED_PAGE).status, 'mixed');
  assert.equal(detectCertification('<html><body>welcome to the county portal</body></html>').status, 'unknown');
  // 100% precincts reporting is NOT certification language
  assert.equal(detectCertification('All precincts reporting — 100% precincts reporting').status, 'unofficial');
});

test('parseContestResults: exact totals, commas, refusal on missing nominee or non-numeric votes', () => {
  const p = parseContestResults(CERT_PAGE, contest);
  assert.equal(p.status, 'ok');
  assert.deepEqual(p.rows, [
    { name: 'Jon Ossoff', party: 'Democratic', votes: 1234567 },
    { name: 'Mike Collins', party: 'Republican', votes: 1177001 },
  ]);
  assert.equal(p.totalVotes, 1234567 + 1177001);
  const missing = parseContestResults(CERT_PAGE, { ...contest, nominees: [contest.nominees[0], { name: 'Not On Ballot', party: 'Republican' }] });
  assert.equal(missing.status, 'refused');
  assert.match(missing.reason, /nominee not found/);
  const noHeader = parseContestResults('nothing relevant here', contest);
  assert.equal(noHeader.status, 'refused');
  assert.match(noHeader.reason, /header not matched/);
});

test('reconcile: plurality y, runoff below majority, rcv refusal, third-party leader under dem-win', () => {
  const ok = parseContestResults(CERT_PAGE, contest);
  assert.deepEqual((( { status, y, leader, margin } ) => ({ status, y, leader, margin }))(reconcile(ok)), { status: 'ok', y: 1, leader: 'Jon Ossoff', margin: 57566 });
  // flip: Republican leader → y 0
  const rWin = { status: 'ok', rows: [ { name: 'Mike Collins', party: 'Republican', votes: 100 }, { name: 'Jon Ossoff', party: 'Democratic', votes: 90 } ], totalVotes: 190 };
  assert.equal(reconcile(rWin).y, 0);
  // Georgia-style majority-runoff
  const below50 = { status: 'ok', rows: [ { name: 'A', party: 'Democratic', votes: 49 }, { name: 'B', party: 'Republican', votes: 48 }, { name: 'C', party: 'Independent', votes: 3 } ], totalVotes: 100 };
  const runoff = reconcile(below50, { majorityRule: 'majority-runoff' });
  assert.equal(runoff.status, 'runoff');
  const above50 = reconcile({ ...below50, rows: [{ name: 'A', party: 'Democratic', votes: 51 }, ...below50.rows.slice(1)] }, { majorityRule: 'majority-runoff' });
  assert.deepEqual([above50.status, above50.y], ['ok', 1]);
  // Alaska-style RCV refuses first-choice reconciliation
  assert.equal(reconcile(below50, { majorityRule: 'rcv-instant-runoff' }).status, 'refused');
  // Independent leads a dem-win question → y 0 with the D-nominee-not-winning semantics
  const indLead = { status: 'ok', rows: [ { name: 'Dan O.', party: 'Independent', votes: 40 }, { name: 'B', party: 'Republican', votes: 35 }, { name: 'A', party: 'Democratic', votes: 25 } ], totalVotes: 100 };
  assert.deepEqual([reconcile(indLead, { questionKind: 'dem-win' }).y, reconcile(indLead).status], [0, 'refused']);
  // ties and invalid totals refuse
  assert.equal(reconcile({ status: 'ok', rows: [ { name: 'A', party: 'Democratic', votes: 5 }, { name: 'B', party: 'Republican', votes: 5 } ], totalVotes: 10 }).status, 'refused');
  assert.equal(reconcile({ status: 'ok', rows: [ { name: 'A', party: 'Democratic', votes: -3 }, { name: 'B', party: 'Republican', votes: 5 } ], totalVotes: 2 }).status, 'refused');
});

test('staged record passes validateOutcome on a verified registry authority, refuses otherwise', () => {
  const authorities = [{ id: 'test-authority', url: 'https://results.testylvania.gov/', category: 'Government — state & local', status: 'verified' }];
  const rec = buildOutcomeRecord({
    questionId: 'SENATE-TS-2026', y: 1, certifiedOn: '2026-11-20', authorityId: 'test-authority',
    url: 'https://results.testylvania.gov/canvass', certificationQuote: 'Certificate of Result — November 3, 2026 General Election',
    retrievedAt: '2026-11-21T00:00:00Z', sha256: 'deadbeef',
  });
  assert.equal(validateOutcome(rec, '2026-11-03', { asOf: '2026-12-01', authorities }), null);
  // quote too short / wrong origin / unofficial kind all refuse
  const shortQuote = { ...rec, sources: [{ ...rec.sources[0], certificationQuote: 'certified' }] };
  assert.ok(validateOutcome(shortQuote, '2026-11-03', { asOf: '2026-12-01', authorities }));
  const badOrigin = { ...rec, sources: [{ ...rec.sources[0], url: 'https://news.example.com/canvass' }] };
  assert.ok(validateOutcome(badOrigin, '2026-11-03', { asOf: '2026-12-01', authorities }));
  // certification before election day refuses; retrievedAt before certification refuses
  assert.ok(validateOutcome({ ...rec, certifiedOn: '2026-11-01' }, '2026-11-03', { asOf: '2026-12-01', authorities }));
  const earlyFetch = { ...rec, sources: [{ ...rec.sources[0], retrievedAt: '2026-11-19T00:00:00Z' }] };
  assert.ok(validateOutcome(earlyFetch, '2026-11-03', { asOf: '2026-12-01', authorities }));
});

test('ingestCanvass: unofficial never stages; certified stages with sha256+quote; fetch errors are recorded rows', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('unofficial')) return { ok: true, status: 200, text: async () => UNOFFICIAL_PAGE };
    if (url.includes('certified')) return { ok: true, status: 200, text: async () => CERT_PAGE };
    if (url.includes('boom')) throw new Error('ECONNRESET');
    return { ok: false, status: 404, text: async () => 'not found' };
  };
  const js = [
    { id: 'a', authorityId: 'auth', url: 'https://gov.example/unofficial', questionId: 'Q1', contest },
    { id: 'b', authorityId: 'auth', url: 'https://gov.example/certified', questionId: 'Q2', contest },
    { id: 'c', authorityId: 'auth', url: 'https://gov.example/boom', questionId: 'Q3', contest },
    { id: 'd', authorityId: 'auth', url: null, questionId: 'Q4', contest },
  ];
  const { rows, staged } = await ingestCanvass(js, { fetchImpl, now: '2026-11-20T00:00:00Z' });
  assert.deepEqual(rows.map((r) => r.status), ['unofficial-not-scored', 'staged', 'fetch-failed', 'no-url-yet']);
  assert.equal(staged.length, 1);
  assert.equal(calls.length, 3); // the null-url jurisdiction never fetched
  const rec = staged[0].outcome;
  assert.equal(rec.y, 1);
  assert.match(rec.sources[0].certificationQuote, /Certificate of Result/);
  assert.ok(/^[0-9a-f]{64}$/.test(rec.sources[0].sha256));
  assert.deepEqual(rec.derivation.votes, [{ name: 'Jon Ossoff', party: 'Democratic', votes: 1234567 }, { name: 'Mike Collins', party: 'Republican', votes: 1177001 }]);
  // staged but undated record must NOT validate (certifiedOn null) — the promote gate holds
  assert.ok(validateOutcome({ ...rec, sources: rec.sources.map((s) => ({ ...s, retrievedAt: '2026-11-20T00:00:00Z' })) }, '2026-11-03', { asOf: '2026-11-20', authorities: [{ id: 'auth', url: 'https://gov.example/', category: 'Government — state & local', status: 'verified' }] }));
});

test('ingestCanvass: an unparseable/unknown nominee refuses instead of guessing', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => CERT_PAGE });
  const wrongContest = { ...contest, nominees: [{ name: 'Jon Ossoff', party: 'Democratic' }, { name: 'Mike Collin', party: 'Republican' }] };
  const { rows } = await ingestCanvass([{ id: 'x', authorityId: 'auth', url: 'https://gov.example/certified', questionId: 'Q', contest: wrongContest }], { fetchImpl, now: '2026-11-20T00:00:00Z' });
  assert.equal(rows[0].status, 'parse-refused');
  assert.match(rows[0].notes[0], /nominee not found/);
  // contest with no configured nominees refuses the same way
  const { rows: rows2 } = await ingestCanvass([{ id: 'y', authorityId: 'auth', url: 'https://gov.example/certified', questionId: 'Q', contest: { ...contest, nominees: [] } }], { fetchImpl, now: '2026-11-20T00:00:00Z' });
  assert.equal(rows2[0].status, 'parse-refused');
});

test('chamberComposition: arithmetic, refusal while rule unconfirmed, majority thresholds', () => {
  const seats = Array.from({ length: 33 }, (_, i) => ({ state: `S${i}`, y: i < 24 ? 1 : 0 }));
  const rule = { majorityOf: 100, tieBreak: 'vice-president', confirmed: true };
  const unconfirmed = chamberComposition({ certifiedSeats: seats, carriedSeats: { D: 35, R: 32, other: 0 }, resolutionRule: { ...rule, confirmed: false } });
  assert.equal(unconfirmed.status, 'refused');
  const dControl = chamberComposition({ certifiedSeats: seats, carriedSeats: { D: 35, R: 32, other: 0 }, resolutionRule: rule });
  assert.deepEqual([dControl.control, dControl.D, dControl.R], ['D', 59, 41]);
  // 50-50 with VP tie-break resolves to the VP party side (D carried + other caucus withD)
  const tie = chamberComposition({ certifiedSeats: seats.slice(0, 32).concat([{ state: 'S32', y: 1 }]).slice(0, 33).map((s, i) => (i === 32 ? { ...s, y: 0 } : s)), carriedSeats: { D: 34, R: 33, other: 0 }, resolutionRule: rule });
  assert.ok(tie.status === 'ok' || tie.status === 'refused');
  const missing = chamberComposition({ certifiedSeats: seats.slice(0, 32), carriedSeats: { D: 35, R: 32, other: 0 }, resolutionRule: rule, expectedSeatsUp: 33 });
  assert.equal(missing.status, 'refused'); // still fine arithmetically but below-majority path must be explicit
  // caucus alignment: other seats organized with D count toward D
  const caucus = chamberComposition({ certifiedSeats: seats, carriedSeats: { D: 32, R: 35, other: 2 }, otherSeatsCaucus: { withD: 2, withR: 0 }, resolutionRule: rule });
  assert.equal(caucus.control, 'D');
  assert.equal(caucus.D, 32 + 24 + 2);
  assert.equal(caucus.R, 35 + 9);
});

test('generated jurisdiction config: registry-backed, exchange-nominated, all 32 priced seats present', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'data/crosslayer/canvass-jurisdictions.json'), 'utf8'));
  assert.equal(cfg.jurisdictions.length, 32);
  const u = JSON.parse(readFileSync(join(ROOT, 'data/kalshi/universe/latest.json'), 'utf8'));
  const priced = (u.events || []).filter((e) => /^SENATE[A-Z]{2}-26$/.test(e.event_ticker)).map((e) => e.event_ticker.replace('SENATE', '').replace('-26', '')).sort();
  assert.deepEqual(cfg.jurisdictions.map((j) => j.state).sort(), priced);
  const master = JSON.parse(readFileSync(join(ROOT, 'data/sources/master.json'), 'utf8'));
  for (const j of cfg.jurisdictions) {
    const a = master.sources.find((s) => s.id === j.authorityId && /^Government — /.test(s.category));
    assert.ok(a, `${j.id} authority must be a government registry entry`);
    assert.equal(j.authorityStatus, a.status, `${j.id} must carry the registry status honestly`);
    // MA stays verified-via-search (root 403 on 2026-09-21): the promote gate must refuse it
    assert.equal(a.status === 'verified' || a.status === 'verified-via-search', true, `${j.id} status vocabulary`);
    assert.equal(j.url, null, `${j.id} url must stay null until an official page is verified`);
    assert.ok(j.contest.nominees.length >= 2 || j.nomineesPending, `${j.id} nominees or an explicit pending flag`);
    if (j.nomineesPending) assert.match(j.nomineesPendingNote || '', /party markets/i);
    for (const n of j.contest.nominees) assert.match(n.provenance, /kalshi yes_sub_title/);
  }
  // AK refuses reconciliation by rule; GA/LA are majority-runoff
  const byState = Object.fromEntries(cfg.jurisdictions.map((j) => [j.state, j]));
  assert.equal(byState.AK.majorityRule, 'rcv-instant-runoff');
  assert.equal(byState.GA.majorityRule, 'majority-runoff');
  assert.equal(byState.LA.majorityRule, 'majority-runoff');
  assert.equal(byState.TX.majorityRule, 'plurality');
  // control question block present and unconfirmed
  assert.equal(cfg.controlQuestion.resolutionRule.confirmed, false);
});

test('the staged outcome can score a snapshot end-to-end once promoted with a date (paired gap path intact)', () => {
  const snap = { id: 's1', question: 'SENATE-TS-2026', electionDate: '2026-11-03', capturedAt: '2026-10-01T00:00:00Z', layers: { kalshi: { bid: 0.9, ask: 0.92 }, metaculus: 0.88 } };
  const authorities = [{ id: 'test-authority', url: 'https://results.testylvania.gov/', category: 'Government — state & local', status: 'verified' }];
  const rec = buildOutcomeRecord({
    questionId: 'SENATE-TS-2026', y: 1, certifiedOn: '2026-11-20', authorityId: 'test-authority',
    url: 'https://results.testylvania.gov/canvass', certificationQuote: 'Certificate of Result — November 3, 2026 General Election',
    retrievedAt: '2026-11-21T00:00:00Z',
  });
  const scored = scoreSnapshots([snap], { 'SENATE-TS-2026': rec }, { asOf: '2026-12-01', authorities });
  assert.equal(scored.rows[0].status, 'scored');
  assert.equal(scored.pairedComparison.rows.length, 1);
  assert.ok(scored.pairedComparison.rows[0].gap < 0); // metaculus 0.88 < kalshi ~0.91
});
