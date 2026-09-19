import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSenate2024Backtest, bandOf, CAPTURE_PATH } from '../src/senate2024-backtest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hasCapture = existsSync(join(ROOT, CAPTURE_PATH));

test('bandOf classifies T-7 confidence bands', () => {
  assert.equal(bandOf(0.5), 'competitive (35-65c)');
  assert.equal(bandOf(0.8), 'lean (10-35c / 65-90c)');
  assert.equal(bandOf(0.2), 'lean (10-35c / 65-90c)');
  assert.equal(bandOf(0.95), 'safe (<10c / >90c)');
  assert.equal(bandOf(0.02), 'safe (<10c / >90c)');
  assert.equal(bandOf(null), 'no-price');
});

test('official outcomes file: 18 raced states, 36 tickers, exactly one expected YES per race', () => {
  const official = JSON.parse(readFileSync(join(ROOT, 'data/outcomes/senate-2024-official.json'), 'utf8'));
  assert.equal(official.races.length, 18);
  let tickers = 0;
  for (const r of official.races) {
    tickers += Object.keys(r.expectedKalshi).length;
    const yes = Object.values(r.expectedKalshi).filter((v) => v === 'yes');
    assert.equal(yes.length, 1, `race ${r.state} must have exactly one expected YES`);
    assert.ok(r.perPage && /^https:/.test(r.perPage), `race ${r.state} needs a per-state citation`);
    assert.ok(typeof r.winnerParty === 'string' && ['D', 'R', 'I'].includes(r.winnerParty), `race ${r.state} winnerParty`);
  }
  assert.equal(tickers, 36);
});

test('senate-2024 backtest runs on the capture: cross-checks PASS, aggregate beats chance', { skip: !hasCapture && 'capture pending — produced on the networked runner by scripts/collect-senate-2024-races.mjs' }, () => {
  const res = runSenate2024Backtest(ROOT);
  assert.ok(res, 'capture present -> result must not be null');
  assert.ok(res.nMarkets >= 30, `expected the ~36-market universe, got ${res.nMarkets}`);
  assert.equal(res.settlementCrossCheck.fail, 0, 'every Kalshi settlement must match the official winner; mismatches would be published, so a FAIL here means the backtest found a real discrepancy');
  assert.equal(res.settlementCrossCheck.noOfficialRow, 0, 'every captured 2024 Senate ticker must have an official-outcome row');
  for (const m of res.markets) {
    assert.equal(m.crossCheck, 'PASS', `${m.ticker} cross-check`);
    assert.ok(m.nBars >= 0);
    for (const lt of m.leadTimes) {
      if (lt.p !== null) {
        assert.ok(lt.p >= 0 && lt.p <= 1, `${m.ticker} price in range`);
        assert.ok(lt.brier >= 0 && lt.brier <= 1, `${m.ticker} brier in range`);
      }
    }
  }
  const t7 = res.aggregate.find((a) => a.nDays === 7);
  assert.ok(t7 && t7.nMarkets > 0, 'T-7 aggregate must have priced markets');
  assert.ok(t7.meanBrier < 0.25, `T-7 mean Brier ${t7.meanBrier} must beat the 0.25 chance baseline`);
  const w7 = res.holdOfficialWinners.find((h) => h.nDays === 7);
  assert.ok(w7 && w7.nRaces > 0, 'hold-the-winner aggregate must have races at T-7');
});

test('backtest skips honestly while the capture is pending', { skip: hasCapture && 'capture already present' }, () => {
  assert.equal(runSenate2024Backtest(ROOT), null);
});
