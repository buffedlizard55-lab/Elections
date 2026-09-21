#!/usr/bin/env node
// Offline, deterministic for a supplied --as-of date. Never fetch or invent outcomes.
import { readFileSync, writeFileSync } from 'node:fs';
import { scoreSnapshots, validDay } from '../src/crosslayer.js';
const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const args = process.argv.slice(2);
const i = args.indexOf('--as-of');
const asOf = i < 0 ? new Date().toISOString().slice(0, 10) : args[i + 1];
if (!validDay(asOf)) throw new Error('--as-of requires a valid YYYY-MM-DD date');
const snapshots = read('data/crosslayer/snapshots.json');
const report = { title: 'Certification-gated cross-layer scores', capturedFrom: 'data/crosslayer/snapshots.json; data/crosslayer/outcomes.json; data/sources/master.json',
  ...scoreSnapshots(snapshots.snapshots, read('data/crosslayer/outcomes.json').outcomes, { asOf, authorities: read('data/sources/master.json').sources }) };
writeFileSync(new URL('data/crosslayer/scores.json', root), JSON.stringify(report, null, 1) + '\n');
console.log(`[crosslayer] ${report.scoredCount} scored, ${report.pendingCount} pending, ${report.refused.length} refusals; ${report.pairedComparison.questions} paired questions`);
