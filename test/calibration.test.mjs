import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, runCalibrationTracker, FORWARD_DIR } from '../src/calibration-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('parseCsv handles quoted commas and escaped quotes', () => {
  const rows = parseCsv('date,ticker,sub\n2026-09-19,ABC-1,"Hello, world"\n2026-09-19,ABC-2,"say ""hi"""\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sub, 'Hello, world');
  assert.equal(rows[1].sub, 'say "hi"');
  assert.equal(rows[0].ticker, 'ABC-1');
});

test('tracker returns null when no forward artifacts exist', () => {
  const empty = mkdtempSync(join(tmpdir(), 'elections-cal-'));
  assert.equal(runCalibrationTracker(empty), null);
});

test('tracker scores a synthetic settled market end-to-end (fixture, labeled)', () => {
  const root = mkdtempSync(join(tmpdir(), 'elections-cal-'));
  mkdirSync(join(root, FORWARD_DIR), { recursive: true });
  // Fixture bars: daily closes 60c -> 90c -> 99c ending 2 days before close (layout of src/kalshi-data.js).
  const bar = (ts, closeCents, vol = 1000) => [ts, vol, closeCents, closeCents, closeCents, closeCents, closeCents * 100, closeCents, closeCents, closeCents, closeCents, closeCents, closeCents, closeCents, closeCents, closeCents, 5000];
  const closeTime = '2026-06-10T20:00:00Z';
  const closeTs = Math.floor(Date.parse(closeTime) / 1000);
  const bars = [
    bar(closeTs - 30 * 86400, 60),
    bar(closeTs - 8 * 86400, 90),
    bar(closeTs - 2 * 86400, 99),
  ];
  writeFileSync(join(root, FORWARD_DIR, 'settled-2026-seed.json'), JSON.stringify({
    capturedFrom: 'fixture://test', capturedAt: new Date().toISOString(), capturedBy: 'test/calibration.test.mjs (SYNTHETIC FIXTURE — not market data)',
    markets: { 'FIX-26-YES': { ticker: 'FIX-26-YES', event_ticker: 'FIX-26', series: 'FIX', result: 'yes', status: 'finalized', close_time: closeTime, volume: '3000' } },
    bars: { 'FIX-26-YES': bars },
    candleEndpoint: { 'FIX-26-YES': 'fixture' },
    skipped: [],
  }));
  writeFileSync(join(root, FORWARD_DIR, 'open-prices.csv'), 'date,ticker,event_ticker,series,yes_sub_title,yes_bid_dollars,yes_ask_dollars,last_price_dollars,volume,open_interest,close_time\n2026-09-19,CONTROLS-2026-D,CONTROLS-2026,CONTROLS,"Dem control",0.5900,0.6000,0.5900,4080000,1200000,2026-11-04T01:00:00Z\n');
  const res = runCalibrationTracker(root);
  assert.ok(res);
  assert.equal(res.settled2026.nScored, 1);
  assert.deepEqual(res.tracker.days, ['2026-09-19']);
  const t7 = res.settled2026.byLead.find((l) => l.nDays === 7);
  assert.equal(t7.nMarkets, 1);
  assert.equal(t7.meanProbYes, 0.9);       // last close on/before T-7 is the 90c bar (T-8)
  assert.equal(t7.outcomeRate, 1);         // result was yes
  assert.ok(Math.abs(t7.meanBrier - 0.01) < 1e-9); // (0.9-1)^2
  const t1 = res.settled2026.byLead.find((l) => l.nDays === 1);
  assert.equal(t1.meanProbYes, 0.99);      // the T-2 bar is the last known close before T-1
  assert.ok(Math.abs(res.tracker.headlineSeries['CONTROLS-2026-D'][0].mid - 0.595) < 1e-9, 'mid = (bid+ask)/2 within float tolerance');
  const buckets = res.settled2026.bucketsT7.buckets;
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].lo, 90); // 90c lands in the 90-100 bucket
  assert.equal(buckets[0].hitRate, 1);
});

test('real forward artifacts smoke test', { skip: !existsSync(join(ROOT, FORWARD_DIR, 'settled-2026-seed.json')) && !existsSync(join(ROOT, FORWARD_DIR, 'open-prices.csv')) && 'forward artifacts pending the networked collection' }, () => {
  const res = runCalibrationTracker(ROOT);
  assert.ok(res);
  assert.ok(Array.isArray(res.tracker.days));
  assert.ok(res.settled2026.byLead.every((l) => l.nMarkets === 0 || (l.meanBrier >= 0 && l.meanBrier <= 1)));
});
