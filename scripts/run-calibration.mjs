#!/usr/bin/env node
/**
 * Run the 2026 forward calibration tracker (ROADMAP R3) and write
 * data/calibration-2026.json. Deterministic; no network. Skips honestly
 * (exit 0, no file) until the first networked collection has landed.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCalibrationTracker, FORWARD_DIR } from '../src/calibration-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const result = runCalibrationTracker(ROOT);
if (!result) {
  console.log(`calibration tracker: no forward artifacts in ${FORWARD_DIR} yet — skipped (produced on a networked runner by scripts/collect-universe.mjs).`);
  process.exit(0);
}

const out = {
  generatedAt: new Date().toISOString(),
  inputs: [
    { path: `${FORWARD_DIR}/open-prices.csv`, source: 'append-only daily snapshots written by scripts/collect-universe.mjs from https://api.elections.kalshi.com/trade-api/v2/markets (per-series queries; provenance in each daily meta JSON)' },
    { path: `${FORWARD_DIR}/settled-2026-seed.json`, source: result.settled2026.capturedFrom || 'pending' },
    { path: `${FORWARD_DIR}/universe-open.json`, source: 'https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker={politics/elections series}&status=open' },
  ],
  note: 'Forward "expected vs actual" record: every settled 2026 Elections market scored at T-1..T-60 before close with the same metrics as the 2024 backtest, plus pooled calibration buckets and the upcoming-settlement watchlist (LA mayor general election is the first high-volume settlement, 2026-11-03; located from captured event tickers, never hard-coded).',
  ...result,
};
writeFileSync(join(ROOT, 'data/calibration-2026.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote data/calibration-2026.json — tracker days: ${result.tracker.days.length} (${result.tracker.totalRows} rows), settled-2026 scored: ${result.settled2026.nScored}`);
for (const l of result.settled2026.byLead) {
  if (l.nMarkets) console.log(`  T-${l.nDays}: n=${l.nMarkets} meanP=${l.meanProbYes?.toFixed(4)} outcomeRate=${l.outcomeRate?.toFixed(4)} meanBrier=${l.meanBrier?.toFixed(4)}`);
}
