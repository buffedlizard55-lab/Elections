#!/usr/bin/env node
/** Session 11 (2026-09-21) registry patch 1: oregon-sos direct re-verification upgrade.
 *  The 2026-09-21 session re-fetched the entry's canonical URL directly and observed the
 *  same official content; status vocabulary: verified = page fetched directly, quote is
 *  what was observed. Kept as a one-off auditable script. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data/sources/master.json');
const master = JSON.parse(readFileSync(FILE, 'utf8'));
const s = master.sources.find((x) => x.id === 'oregon-sos');
if (!s) { console.error('oregon-sos not found'); process.exit(2); }
s.status = 'verified';
s.notes += ' Re-fetched directly 2026-09-21 (session 11 canvass re-test): the same Upcoming Elections page confirmed — November 3, 2026 general election, October 13 registration deadline, October 14 first ballot mail, and "December 10, 2026: Final election results certified." Status upgraded verified-via-search → verified on that direct fetch; relevant to canvass ingestion (data/crosslayer/canvass-jurisdictions.json).';
writeFileSync(FILE, JSON.stringify(master, null, 1) + '\n');
console.log('oregon-sos upgraded to verified with a dated 2026-09-21 re-test note');
