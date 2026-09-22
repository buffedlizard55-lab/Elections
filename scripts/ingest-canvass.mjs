#!/usr/bin/env node
/**
 * Certified-canvass ingestion CLI (P0 after Nov 3).
 *
 * Modes:
 *   node scripts/ingest-canvass.mjs                      — fetch every configured URL,
 *                                                          stage outcome records for bodies
 *                                                          that certify + parse + reconcile,
 *                                                          write data/crosslayer/canvass-staging.json
 *                                                          (and per-run evidence files).
 *   --set-url <id>=<url> [--set-url ...]                 — persist an official results/
 *                                                          certification URL into the config
 *                                                          (run it only after verifying the
 *                                                          URL on the authority's own site).
 *   --set-certified-on <id>=<YYYY-MM-DD> [...]           — persist a confirmed certification
 *                                                          date for a jurisdiction.
 *   --promote                                            — merge staged, dated records into
 *                                                          data/crosslayer/outcomes.json,
 *                                                          but ONLY rows that pass
 *                                                          validateOutcome() against the
 *                                                          master registry authorities.
 *                                                          Staging rows without a
 *                                                          certifiedOn are reported and left.
 *
 * Exit codes: 0 = ran (per-jurisdiction refusals are data, not crashes); 2 = bad usage/config.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestCanvass } from '../src/canvass.js';
import { validateOutcome } from '../src/crosslayer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'data/crosslayer/canvass-jurisdictions.json');
const STAGING = join(ROOT, 'data/crosslayer/canvass-staging.json');
const OUTCOMES = join(ROOT, 'data/crosslayer/outcomes.json');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.slice(i + 1).filter((a) => !a.startsWith('--') || /.=/.test(a)) : null;
};

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));

// ---- config mutation modes ---------------------------------------------------
const setUrls = flag('--set-url');
const setDates = flag('--set-certified-on');
const applySet = (list, field) => {
  if (!list) return false;
  for (const item of list) {
    const [id, ...rest] = item.split('=');
    const j = config.jurisdictions.find((x) => x.id === id.trim());
    if (!j || !rest.length) { console.error(`--set: unknown jurisdiction or empty value: ${item}`); process.exit(2); }
    const value = rest.join('=');
    if (field === 'url' && !/^https:\/\//.test(value)) { console.error(`--set-url must be an HTTPS URL: ${item}`); process.exit(2); }
    if (field === 'certifiedOn' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) { console.error('--set-certified-on must be YYYY-MM-DD'); process.exit(2); }
    j[field] = value;
    console.log(`config: ${id}.${field} = ${value}`);
  }
  writeFileSync(CONFIG, JSON.stringify(config, null, 1) + '\n');
  return true;
};
const mutated = applySet(setUrls, 'url') | applySet(setDates, 'certifiedOn');
if (mutated && !args.includes('--also-ingest')) {
  console.log('config updated.');
  process.exit(0);
}

// ---- promotion mode ------------------------------------------------------------
if (args.includes('--promote')) {
  const staging = JSON.parse(readFileSync(STAGING, 'utf8'));
  const outcomes = JSON.parse(readFileSync(OUTCOMES, 'utf8'));
  const master = JSON.parse(readFileSync(join(ROOT, 'data/sources/master.json'), 'utf8'));
  const authorities = master.sources.filter((s) => /^Government — /.test(s.category) && s.status === 'verified');
  const electionDate = config.electionDate;
  let promoted = 0, kept = 0;
  for (const row of staging.rows || []) {
    if (!row.outcome) continue;
    const oc = row.outcome;
    if (!oc.certifiedOn) { console.log(`promote: ${row.id} has no confirmed certifiedOn — left in staging`); continue; }
    const why = validateOutcome(oc, electionDate, { asOf: new Date().toISOString().slice(0, 10), authorities });
    if (why) { console.log(`promote: ${row.id} REFUSED by validateOutcome: ${why}`); continue; }
    outcomes.outcomes[oc.question] = { ...oc, ingestedBy: 'scripts/ingest-canvass.mjs', stagedAt: staging.generatedAt };
    promoted++;
  }
  writeFileSync(OUTCOMES, JSON.stringify(outcomes, null, 1) + '\n');
  console.log(`promote: ${promoted} outcome(s) written, staging retained for audit.`);
  process.exit(0);
}

// ---- default: ingest -------------------------------------------------------------
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const { rows, staged } = await ingestCanvass(config.jurisdictions);
mkdirSync(join(ROOT, 'data/crosslayer/canvass', runId), { recursive: true });
for (const row of rows) {
  writeFileSync(join(ROOT, 'data/crosslayer/canvass', runId, `${row.id}.json`), JSON.stringify(row, null, 1) + '\n');
}
const staging = {
  title: 'Certified-canvass staging — review before promotion',
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  runId,
  method: 'Staged records pass structural parsing and reconciliation but still need a confirmed certifiedOn (legal fact) before --promote re-validates them against the registry. Unofficial/unknown/mixed pages never stage.',
  counts: {
    jurisdictions: rows.length,
    staged: staged.length,
    byStatus: rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}),
  },
  rows,
};
writeFileSync(STAGING, JSON.stringify(staging, null, 1) + '\n');
console.log(`ingest-canvass: ${rows.length} jurisdictions, ${staged.length} staged; statuses: ${JSON.stringify(staging.counts.byStatus)}`);
