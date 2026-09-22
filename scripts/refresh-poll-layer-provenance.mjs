#!/usr/bin/env node
/**
 * Refresh the `candidateMismatchProvenance.universeCapturedAt` field in
 * data/polls/poll-layer-2026.json so it matches the current captured universe.
 *
 * This field is the audit anchor that says "every stateRaces[].candidateMismatch
 * was computed against THIS universe snapshot." Each time the universe is
 * re-captured (data/kalshi/universe/latest.json gets a new capturedAt), this
 * field must be refreshed or downstream tests that assert the provenance will
 * fail with a stale timestamp (irregularity #80).
 *
 * Idempotent: re-running just updates the timestamp to whatever the universe
 * currently carries, with the same provenance note. The actual mismatch check
 * runs in src/poll-layer.js#candidateMismatch at site-build time and is
 * reflected in the row-level field on the site; only the provenance header is
 * refreshed here.
 *
 * Exit codes:
 *   0 — provenance header updated and now matches the universe capturedAt
 *   1 — universe file missing (first commit before any collector run)
 *   2 — universe file present but missing capturedAt (malformed)
 *   3 — poll-layer file missing or unparseable
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAYER = join(ROOT, 'data/polls/poll-layer-2026.json');
const UNIVERSE = join(ROOT, 'data/kalshi/universe/latest.json');

if (!existsSync(UNIVERSE)) {
  console.error(`universe not found: ${UNIVERSE} — run scripts/collect-kalshi.mjs first`);
  process.exit(1);
}
if (!existsSync(LAYER)) {
  console.error(`poll layer not found: ${LAYER}`);
  process.exit(3);
}

let layer, universe;
try {
  layer = JSON.parse(readFileSync(LAYER, 'utf8'));
} catch (e) {
  console.error(`poll layer unparseable: ${LAYER}: ${e.message}`);
  process.exit(3);
}
try {
  universe = JSON.parse(readFileSync(UNIVERSE, 'utf8'));
} catch (e) {
  console.error(`universe unparseable: ${UNIVERSE}: ${e.message}`);
  process.exit(3);
}
if (!universe.capturedAt) {
  console.error(`universe has no capturedAt: ${UNIVERSE}`);
  process.exit(2);
}

const previous = layer.candidateMismatchProvenance || {};
const next = {
  computedBy: previous.computedBy || 'src/poll-layer.js candidateMismatch',
  universeFile: 'data/kalshi/universe/latest.json',
  universeCapturedAt: universe.capturedAt,
  note: previous.note || 'Each stateRaces[].candidateMismatch is the return of candidateMismatch() against that universe. null means the check did not refuse the row. review and comparisonBlockedReason were not modified.',
  refreshedAt: new Date().toISOString(),
  refreshedBy: 'scripts/refresh-poll-layer-provenance.mjs',
};

// No-op if the field is already up to date; saves a needless file rewrite on
// every daily run.
if (previous.universeCapturedAt === next.universeCapturedAt && previous.universeFile === next.universeFile && previous.refreshedBy === next.refreshedBy) {
  console.log(`candidateMismatchProvenance already anchored to ${next.universeCapturedAt} — no rewrite`);
  process.exit(0);
}

layer.candidateMismatchProvenance = next;
writeFileSync(LAYER, JSON.stringify(layer, null, 2) + '\n');
console.log(`refreshed candidateMismatchProvenance.universeCapturedAt -> ${next.universeCapturedAt}`);