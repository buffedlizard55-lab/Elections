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
  if (!s.url || !/^https:\/\//.test(s.url)) errors.push(`source "${s.id}" missing valid https url`);
  if (!s.verified || s.verified.length < 40) errors.push(`source "${s.id}" missing observed-verification text`);
  if (typeof s.verifiedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.verifiedOn)) errors.push(`source "${s.id}" missing verifiedOn date`);
  // Status vocabulary (documented in README.md "Sources"):
  //   verified            - page/PDF fetched directly and the observed text recorded
  //   verified-via-search - reached through a search-discovered official page, fetched and recorded
  //   verified-claim      - a third party's RENDERING was verified (not the underlying data); see notes
  //   needs-review        - fetched, but flagged for a human before the source is relied on
  //   unverified          - candidate only, never used as evidence
  if (!['verified', 'verified-via-search', 'verified-claim', 'needs-review', 'unverified'].includes(s.status)) {
    errors.push(`source "${s.id}" has status "${s.status}" (not in the documented vocabulary)`);
  }
  // Organisational notes became mandatory with the session-3 batch (2026-09-19); the 2026-09-18
  // base entries predate the convention.
  if (s.verifiedOn > '2026-09-18' && !s.notes) errors.push(`source "${s.id}" missing notes (required for entries verified after 2026-09-18)`);
}
// Registry integrity: ids and urls must be unique (the "no duplicates" claim is machine-checked),
// and the published category tally must match the entries, because the site groups by it.
const srcIds = (master.sources || []).map((s) => s.id);
if (new Set(srcIds).size !== srcIds.length) errors.push('duplicate ids in data/sources/master.json');
const srcUrls = (master.sources || []).map((s) => s.url);
if (new Set(srcUrls).size !== srcUrls.length) errors.push('duplicate urls in data/sources/master.json');
const catNames = (master.categories || []).map((c) => c.name);
if (!catNames.length) errors.push('data/sources/master.json is missing its categories tally');
for (const s of master.sources || []) {
  if (!s.category) errors.push(`source "${s.id}" has no category (site grouping)`);
  else if (!catNames.includes(s.category)) errors.push(`source "${s.id}" has unknown category "${s.category}"`);
}
for (const c of master.categories || []) {
  const n = (master.sources || []).filter((s) => s.category === c.name).length;
  if (n !== c.count) errors.push(`category "${c.name}" claims ${c.count} entries but ${n} carry it`);
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

// Irregularities: the human-readable table (IRREGULARITIES.md) and the two machine-readable
// files must list the same ids, every entry needs a source, and ids must be unique.
const irrNode = JSON.parse(readFileSync(join(ROOT, 'data/irregularities.json'), 'utf8')).items || [];
const irrPy = JSON.parse(readFileSync(join(ROOT, 'data/irregularities-python-track.json'), 'utf8')).items || [];
const irrIds = [...irrNode, ...irrPy].map((i) => i.id);
if (new Set(irrIds).size !== irrIds.length) errors.push('duplicate irregularity ids across data/irregularities*.json');
for (const i of [...irrNode, ...irrPy]) {
  if (!i.source) errors.push(`irregularity #${i.id} has no source`);
  if (!i.action) errors.push(`irregularity #${i.id} has no action`);
}
const irrMd = readFileSync(join(ROOT, 'IRREGULARITIES.md'), 'utf8');
const mdIds = [...irrMd.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]));
for (const id of irrIds) if (!mdIds.includes(id)) errors.push(`irregularity #${id} is in the JSON but has no row in IRREGULARITIES.md`);
for (const id of mdIds) if (!irrIds.includes(id)) errors.push(`IRREGULARITIES.md row #${id} has no machine-readable twin in data/irregularities*.json`);

// Poll layer: every 2026 poll entry needs a source URL and a verification note; a Kalshi ticker, when given, must exist in the tracker index.
const pollLayer = JSON.parse(readFileSync(join(ROOT, 'data/polls/poll-layer-2026.json'), 'utf8'));
let indexTickers = null;
try { indexTickers = new Set(JSON.parse(readFileSync(join(ROOT, 'data/kalshi/tracker/index.json'), 'utf8')).tickers.map((t) => t.ticker)); } catch { /* tracker absent until the first live run */ }
for (const e of [...(pollLayer.genericBallot || []), ...(pollLayer.stateRaces || [])]) {
  if (!e.source || !/^https?:\/\//.test(e.source)) errors.push(`poll entry ${e.id} missing source url`);
  if (!e.verifiedVia || !e.verifiedOn) errors.push(`poll entry ${e.id} missing verifiedVia/verifiedOn`);
  if (indexTickers && e.kalshiDemTicker && !indexTickers.has(e.kalshiDemTicker)) errors.push(`poll entry ${e.id} points at Kalshi ticker ${e.kalshiDemTicker} which is not in the tracker index`);
}
for (const r of (pollLayer.raceRatings && pollLayer.raceRatings.senate2026) || []) {
  if (indexTickers && r.kalshiTicker && !indexTickers.has(r.kalshiTicker)) errors.push(`rating row ${r.state} points at Kalshi ticker ${r.kalshiTicker} which is not in the tracker index`);
}

console.log(`checked ${checked.length} data JSON files, ${master.sources.length} sources, ${outcomes.outcomes.length} outcomes, ${Object.keys(MARKETS_2024).length} markets, ${irrIds.length} irregularities (md rows ${mdIds.length}), ${(pollLayer.stateRaces || []).length + (pollLayer.genericBallot || []).length} poll entries`);
if (errors.length) {
  console.error('LINT FAILURES:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('lint: all verified-data provenance checks pass');
