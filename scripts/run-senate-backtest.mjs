#!/usr/bin/env node
/**
 * Run the 2024 per-state Senate backtest (ROADMAP R2) and write
 * data/senate-2024-backtest.json. Deterministic; no network. Skips
 * honestly (exit 0, no file) while the networked capture is still pending.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSenate2024Backtest, CAPTURE_PATH } from '../src/senate2024-backtest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = runSenate2024Backtest(ROOT);
if (!result) {
  console.log(`senate-2024 backtest: capture ${CAPTURE_PATH} not present yet — skipped (produced on a networked runner by scripts/collect-senate-2024-races.mjs).`);
  process.exit(0);
}

const out = {
  generatedAt: new Date().toISOString(),
  inputs: [
    { path: CAPTURE_PATH, source: result.capture.capturedFrom },
    { path: 'data/outcomes/senate-2024-official.json', source: result.official.fetchedVia },
  ],
  note: 'Deterministic backtest of the captured Kalshi 2024 per-state Senate race markets vs their official settlements. Metrics identical to src/backtest.js (same functions). Every market result is cross-checked against the official winner; FAIL rows are published, never normalized.',
  ...result,
};
writeFileSync(join(ROOT, 'data/senate-2024-backtest.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote data/senate-2024-backtest.json — ${result.nMarkets} markets, cross-check ${result.settlementCrossCheck.pass} PASS / ${result.settlementCrossCheck.fail} FAIL / ${result.settlementCrossCheck.noOfficialRow} no-official-row`);
for (const a of result.aggregate) {
  if (a.nMarkets) console.log(`  T-${a.nDays}: n=${a.nMarkets} meanBrier=${a.meanBrier.toFixed(4)} meanLogloss=${a.meanLogloss.toFixed(4)} meanHoldPnl=${a.meanHoldPnlPerContract.toFixed(4)}`);
}
const w7 = result.holdOfficialWinners.find((h) => h.nDays === 7);
if (w7 && w7.nRaces) console.log(`  hold official winner at T-7: n=${w7.nRaces} meanPrice=${w7.meanPrice.toFixed(4)} meanHoldPnl=${w7.meanHoldPnlPerContract.toFixed(4)} $/contract`);
