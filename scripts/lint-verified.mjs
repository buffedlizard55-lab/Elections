#!/usr/bin/env node
/**
 * No-fabrication lint. Fails if:
 *   - a data/ JSON file lacks provenance (capturedFrom/source/url field),
 *   - a source in data/sources/master.json has no url,
 *   - a market outcome in data/outcomes/verified-outcomes.json lacks sources,
 *   - src/kalshi-data.js market objects lack capturedFrom.
 * This is the machine-checked half of "verify line by line".
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETS_2024, CANDLESTICKS_2024 } from '../src/kalshi-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const checked = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!p.endsWith('.json')) continue;
    checked.push(p);
    const text = readFileSync(p, 'utf8');
    if (!/(capturedFrom|capturedAt|source|url|verifiedOn)/.test(text)) {
      errors.push(`missing provenance (no source/url/captured* field): ${relative(ROOT, p)}`);
    }
  }
}
walk(join(ROOT, 'data'));

const master = JSON.parse(readFileSync(join(ROOT, 'data/sources/master.json'), 'utf8'));
if (!Array.isArray(master.sources) || master.sources.length < 20) {
  errors.push(`master source list must contain >=20 entries (found ${master.sources?.length})`);
}
for (const s of master.sources || []) {
  if (!s.url || !/^https?:\/\//.test(s.url)) errors.push(`source "${s.id}" missing valid url`);
  if (!s.verified) errors.push(`source "${s.id}" missing verification notes`);
}

const outcomes = JSON.parse(readFileSync(join(ROOT, 'data/outcomes/verified-outcomes.json'), 'utf8'));
for (const o of outcomes.outcomes || []) {
  if (!Array.isArray(o.sources) || o.sources.length === 0 || o.sources.some((s) => !s.url)) {
    errors.push(`outcome ${o.cycle} ${o.office} missing sources with urls`);
  }
}

for (const [t, m] of Object.entries(MARKETS_2024)) {
  if (!m.capturedFrom) errors.push(`market ${t} missing capturedFrom`);
}
for (const [t, c] of Object.entries(CANDLESTICKS_2024)) {
  if (!c.capturedFrom) errors.push(`candlesticks ${t} missing capturedFrom`);
  if (c.bars.length < 10) errors.push(`candlesticks ${t} suspiciously short (${c.bars.length} bars)`);
}

console.log(`checked ${checked.length} data JSON files, ${master.sources.length} sources, ${outcomes.outcomes.length} outcomes, ${Object.keys(MARKETS_2024).length} markets`);
if (errors.length) {
  console.error('LINT FAILURES:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('lint: all verified-data provenance checks pass');
