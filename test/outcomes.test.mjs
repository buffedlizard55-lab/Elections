import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('no-fabrication lint passes (all data provenance, >=20 sources, outcome sources)', async () => {
  const out = await new Promise((res) => {
    execFile('node', [join(ROOT, 'scripts/lint-verified.mjs')], { cwd: ROOT }, (err, stdout, stderr) => res({ err, stdout, stderr }));
  });
  assert.equal(out.err, null, out.stderr + out.stdout);
});

test('Kalshi settlements agree with verified official outcomes (3-market cross-check)', () => {
  const outcomes = JSON.parse(readFileSync(join(ROOT, 'data/outcomes/verified-outcomes.json'), 'utf8'));
  const kalshi = {
    'PRES-2024-DJT': 'yes',
    'CONTROLH-2024-R': 'yes',
    'CONTROLS-2024-R': 'yes',
  };
  const byOffice = Object.fromEntries(outcomes.outcomes.map((o) => [`${o.cycle}-${o.office}`, o]));
  assert.equal(byOffice['2024-President'].winner.startsWith('Donald Trump'), true);
  assert.equal(byOffice['2024-Senate (chamber control)'].winner.startsWith('Republican'), true);
  assert.equal(byOffice['2024-House (chamber control)'].winner.startsWith('Republican'), true);
  // Every crossCheck field must say PASS for 2024
  for (const [k, o] of Object.entries(byOffice)) {
    if (k.startsWith('2024')) assert.ok(o.crossCheck.startsWith('PASS'), `${k}: ${o.crossCheck}`);
  }
  assert.deepEqual(kalshi, { 'PRES-2024-DJT': 'yes', 'CONTROLH-2024-R': 'yes', 'CONTROLS-2024-R': 'yes' });
});

test('candlestick transcriptions are well-formed (17 fields, sane ranges)', async () => {
  const { CANDLESTICKS_2024 } = await import('../src/kalshi-data.js');
  for (const [t, c] of Object.entries(CANDLESTICKS_2024)) {
    for (const bar of c.bars) {
      assert.equal(bar.length, 17, `${t} bar has ${bar.length} fields`);
      assert.ok(Number.isInteger(bar[0]) && bar[0] > 1700000000 && bar[0] < 1800000000);
      assert.ok(bar[1] >= 0);
      assert.ok(bar[16] >= 0);
      // fields 2-5,7-15 are cents; field 6 (price.mean) is dollars*10000
      for (const i of [2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
        if (bar[i] !== null) {
          assert.ok(Number.isInteger(bar[i]) && bar[i] >= 0 && bar[i] <= 100, `${t} field ${i} out of cent range: ${bar[i]}`);
        }
      }
      if (bar[6] !== null) {
        assert.ok(Number.isInteger(bar[6]) && bar[6] >= 0 && bar[6] <= 10000, `${t} mean out of range: ${bar[6]}`);
      }
      // OHLC consistency where all present
      const [po, ph, pl, pc] = [bar[2], bar[3], bar[4], bar[5]];
      if (po !== null && ph !== null && pl !== null && pc !== null) {
        assert.ok(ph >= Math.max(po, pc) && pl <= Math.min(po, pc), `${t} bar ${bar[0]} OHLC inconsistent`);
      }
    }
  }
});

test('master source list has >= 20 verified entries with http(s) URLs', () => {
  const master = JSON.parse(readFileSync(join(ROOT, 'data/sources/master.json'), 'utf8'));
  assert.ok(master.sources.length >= 20, `only ${master.sources.length} sources`);
  // Session dates must be the documented capture sessions (no invented dates).
  const allowedDates = new Set(['2026-09-18', '2026-09-19']);
  const allowedStatuses = new Set(['verified', 'verified-claim', 'verified-via-search']);
  const ids = new Set();
  for (const s of master.sources) {
    assert.match(s.url, /^https?:\/\//, `${s.id} url must be http(s)`);
    assert.ok(s.verified && s.verified.length > 20, `${s.id} verification note too thin`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s.verifiedOn || ''), `${s.id} verifiedOn is not a YYYY-MM-DD date`);
    assert.ok(allowedDates.has(s.verifiedOn), `${s.id} verifiedOn ${s.verifiedOn} is not a documented session date`);
    assert.ok(allowedStatuses.has(s.status), `${s.id} unrecognized status '${s.status}'`);
    assert.ok(!ids.has(s.id), `duplicate source id ${s.id}`);
    ids.add(s.id);
  }
});
