import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

test('2026 poll layer: seeds match the verified citations exactly', () => {
  const p = read('data/polls/polls-2026-series.json');
  const nbc = p.rows.find((r) => r.id === 'nbc-2026-06');
  assert.ok(nbc);
  // Verbatim from the directly fetched NBC article (2026-06-14):
  assert.equal(nbc.results.preferD, 49);
  assert.equal(nbc.results.preferR, 44);
  assert.equal(nbc.results.unsure, 7);
  assert.equal(nbc.fieldDates, '2026-05-29..2026-06-07');
  assert.match(nbc.sample, /2,400 registered voters/);
  assert.equal(nbc.moE, '±2.0');
  assert.equal(nbc.sourceUrl, 'https://www.nbcnews.com/politics/2026-election/poll-democrats-maintain-edge-fight-congress-trump-gets-poor-marks-rcna348913');

  const nbcAppr = p.rows.find((r) => r.id === 'nbc-2026-06-approval');
  assert.equal(nbcAppr.results.approveRV, 42);
  assert.equal(nbcAppr.results.approveAllAdults, 39);

  const q = p.rows.find((r) => r.id === 'quinnipiac-2026-09');
  assert.ok(q);
  assert.equal(q.results.preferD, 49);
  assert.equal(q.results.preferR, 38);
  assert.equal(q.results.unsure, 13);
  assert.equal(q.moE, '±3.9');
  assert.equal(q.fieldDates, '2026-09-03..2026-09-06');

  const qAppr = p.rows.find((r) => r.id === 'quinnipiac-2026-09-approval');
  assert.equal(qAppr.results.approve, 33);
  assert.equal(qAppr.results.disapprove, 59);

  // NBC trend rows verbatim from the article's Datawrapper chart:
  const trend = Object.fromEntries(p.rows.filter((r) => r.id.startsWith('nbc-') && r.metric === 'house-generic-preference').map((r) => [r.id, r.results]));
  assert.deepEqual({ d: trend['nbc-2025-03'].preferD, r: trend['nbc-2025-03'].preferR }, { d: 48, r: 47 });
  assert.deepEqual({ d: trend['nbc-2025-10'].preferD, r: trend['nbc-2025-10'].preferR }, { d: 50, r: 42 });
  assert.deepEqual({ d: trend['nbc-2026-03'].preferD, r: trend['nbc-2026-03'].preferR }, { d: 50, r: 44 });
});

test('2026 poll layer: computed margins are arithmetic, every row has provenance', () => {
  const p = read('data/polls/polls-2026-series.json');
  for (const r of p.rows) {
    assert.ok(r.sourceUrl && /^https:/.test(r.sourceUrl), `${r.id} needs a source URL`);
    assert.ok(r.verifiedVia && r.verifiedOn, `${r.id} needs verification notes`);
    if (r.metric === 'house-generic-preference') {
      assert.equal(r.results.marginDComputed, r.results.preferD - r.results.preferR, `${r.id} margin must equal D - R (labeled computed)`);
    }
  }
});

test('2026 poll layer is consistent with the verified-polls.json anchor file', () => {
  const p = read('data/polls/polls-2026-series.json');
  const vp = read('data/polls/verified-polls.json');
  const qv = vp.polls.find((x) => x.id === 'quinnipiac-2026-09');
  const qs = p.rows.find((x) => x.id === 'quinnipiac-2026-09');
  assert.equal(qs.results.preferD, qv.results.houseControlD);
  assert.equal(qs.results.preferR, qv.results.houseControlR);
  const q6v = vp.polls.find((x) => x.id === 'quinnipiac-2026-06');
  const q6s = p.rows.find((x) => x.id === 'quinnipiac-2026-06');
  assert.equal(q6s.results.preferD, q6v.results.houseControlD);
  assert.equal(q6s.results.preferR, q6v.results.houseControlR);
});
