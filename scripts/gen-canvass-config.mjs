#!/usr/bin/env node
/**
 * Generate data/crosslayer/canvass-jurisdictions.json — the jurisdiction map for the
 * post-Nov-3 certified-canvass ingestion (P0).
 *
 * Everything mechanical is derived from committed data, never typed from memory:
 *  - the contested seats and nominee names come from the saved Kalshi universe capture
 *    (SENATE<ST>-26 markets), each nominee tagged with its provenance (market ticker);
 *  - the authority ids come from the master registry (Government — state & local,
 *    status verified);
 *  - majorityRule per state is this repository's recorded election-administration note
 *    (GA/LA majority-runoff, AK ranked-choice, others plurality) and is re-checkable
 *    against each authority's own canvass documents after the election;
 *  - the results/certification URL is left null on purpose: it is filled from the
 *    authority's own site once election-night/canvass pages exist (filling it early
 *    would mean guessing an unverified path).
 *
 * Idempotent: re-running updates the capture-derived fields and preserves any
 * url/certifiedOn values already filled in.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeName } from '../src/canvass.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const universe = JSON.parse(readFileSync(join(ROOT, 'data/kalshi/universe/latest.json'), 'utf8'));
const master = JSON.parse(readFileSync(join(ROOT, 'data/sources/master.json'), 'utf8'));

const AUTHORITY = {
  AK: 'alaska-doe', AL: 'alabama-sos', AR: 'arkansas-sos', CO: 'colorado-sos', DE: 'delaware-doe',
  GA: 'georgia-sos', IA: 'iowa-sos', ID: 'idaho-sos-voteidaho', IL: 'illinois-sbe', KS: 'kansas-sos',
  LA: 'louisiana-sos', MA: 'massachusetts-elections', ME: 'maine-sos', MI: 'michigan-sos',
  MN: 'minnesota-sos', MS: 'mississippi-sos', MT: 'montana-sos', NC: 'ncsbe', NE: 'nebraska-sos',
  NH: 'new-hampshire-sos', NJ: 'new-jersey-doe', NM: 'new-mexico-sos', OK: 'oklahoma-seb',
  OR: 'oregon-sos', RI: 'rhode-island-boe', SC: 'south-carolina-sec', SD: 'south-dakota-sos-history',
  TN: 'tennessee-sos', TX: 'texas-sos-results', VA: 'virginia-elections', WV: 'west-virginia-sos', WY: 'wyoming-sos',
};
const STATE_NAME = {
  AK: 'Alaska', AL: 'Alabama', AR: 'Arkansas', CO: 'Colorado', DE: 'Delaware', GA: 'Georgia', IA: 'Iowa',
  ID: 'Idaho', IL: 'Illinois', KS: 'Kansas', LA: 'Louisiana', MA: 'Massachusetts', ME: 'Maine', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MT: 'Montana', NC: 'North Carolina', NE: 'Nebraska', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', OK: 'Oklahoma', OR: 'Oregon', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', VA: 'Virginia', WV: 'West Virginia', WY: 'Wyoming',
};
const MAJORITY_RULE = { GA: 'majority-runoff', LA: 'majority-runoff', AK: 'rcv-instant-runoff' };
const SIDE_PARTY = { D: 'Democratic', R: 'Republican', IND: 'Independent' };

const authorityFor = (aid) => (master.sources || []).find((x) => x.id === aid);

const existing = existsSync(join(ROOT, 'data/crosslayer/canvass-jurisdictions.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data/crosslayer/canvass-jurisdictions.json'), 'utf8'))
  : { jurisdictions: [] };
const prev = new Map((existing.jurisdictions || []).map((j) => [j.id, j]));

const events = (universe.events || []).filter((e) => /^SENATE[A-Z]{2}-26$/.test(e.event_ticker));
const jurisdictions = [];
for (const ev of events) {
  const st = ev.event_ticker.replace('SENATE', '').replace('-26', '');
  const id = `senate-${st.toLowerCase()}-26`;
  const old = prev.get(id) || {};
  const nominees = ev.markets
    .filter((m) => m.yes_sub_title && !/^(democratic|republican) party$/i.test(m.yes_sub_title))
    .map((m) => ({
      name: m.yes_sub_title,
      party: SIDE_PARTY[m.ticker.split('-').pop()] || 'Third party',
      provenance: `kalshi yes_sub_title, ${universe.date} capture, ${m.ticker} — exchange data, to be confirmed against the official certified canvass text at ingestion time (exact normalized match; mismatch refuses)`,
    }));
  const nomineesPending = nominees.length < 2;
  jurisdictions.push({
    id,
    questionId: `SENATE-${st}-2026`,
    office: 'U.S. Senate',
    jurisdiction: STATE_NAME[st] || st,
    state: st,
    authorityId: AUTHORITY[st] || null,
    authorityStatus: AUTHORITY[st] ? (authorityFor(AUTHORITY[st]) || {}).status || 'missing' : 'missing',
    authorityNote: AUTHORITY[st]
      ? ((authorityFor(AUTHORITY[st]) || {}).status === 'verified'
        ? 'verified government registry entry; promotion may proceed once a certified-canvass URL + date are confirmed.'
        : `registry status is '${(authorityFor(AUTHORITY[st]) || {}).status}' — promote additionally requires a directly re-verified entry (validateOutcome only accepts status 'verified').`)
      : 'no verified government registry entry mapped — map one before ingestion.',
    url: old.url || null,
    certifiedOn: old.certifiedOn || null,
    questionKind: 'dem-win',
    majorityRule: MAJORITY_RULE[st] || 'plurality',
    majorityRuleNote: MAJORITY_RULE[st]
      ? `${STATE_NAME[st]} uses a ${MAJORITY_RULE[st]} rule for this seat per this repository's election-administration note; confirm against the authority's own canvass documents before promotion.`
      : 'plurality (most votes wins); confirm against the authority\'s canvass documents before promotion.',
    ...(nomineesPending ? {
      nomineesPending: true,
      nomineesPendingNote: 'Kalshi lists only PARTY markets for this seat (no candidate vote-share markets), so nominees cannot be harvested from the exchange. Fill contest.nominees from the official candidate filing/certified ballot before ingestion — the parser refuses to run with fewer than two nominees.',
    } : {}),
    contest: {
      office: 'U.S. Senate',
      jurisdiction: STATE_NAME[st] || st,
      // Stored as regex SOURCE strings (JSON-safe); String.prototype.search coerces them.
      contestPatterns: [
        new RegExp(`u\\.?s\\.? senator[^\\n]{0,80}${STATE_NAME[st] || st}`, 'i').source,
        new RegExp(`senator[^\\n]{0,80}${STATE_NAME[st] || st}`, 'i').source,
        new RegExp(`${STATE_NAME[st] || st}[^\\n]{0,80}senator`, 'i').source,
        new RegExp(`(?:election|results) (?:for|of)[^\\n]{0,40}U\\.?S\\.? Senate[^\\n]{0,40}${STATE_NAME[st] || st}`, 'i').source,
      ],
      nominees,
    },
    expectedNomineeKey: nominees.map((n) => normalizeName(n.name)).sort().join('|'),
  });
}
jurisdictions.sort((a, b) => a.state.localeCompare(b.state));

const missingAuthority = jurisdictions.filter((j) => !j.authorityId).map((j) => j.state);
const config = {
  title: 'Jurisdiction map for certified-canvass ingestion — 2026 Senate seats priced on Kalshi',
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  capturedFrom: `kalshi universe capture ${universe.date} (${universe.capturedAt}) + master.json verified authorities`,
  method: 'Generated by scripts/gen-canvass-config.mjs. Nominee names are exchange-captured with provenance; urls stay null until an official results/certification page exists and is verified. Majority rules are repository notes, re-checkable at promotion. The chamber-control outcome is NOT part of this map: it requires the composition derivation in src/canvass.js with a resolution rule confirmed from the market question text.',
  electionDate: '2026-11-03',
  controlQuestion: {
    questionId: 'SENATE-CONTROL-2026',
    carriedSeats: null,
    note: 'Fill carriedSeats/otherSeatsCaucus/vacancies and confirm resolutionRule (majorityOf=100, tieBreak) ONLY from official certified results plus the market question text after election day. chamberComposition() refuses until resolutionRule.confirmed=true.',
    resolutionRule: { majorityOf: 100, tieBreak: 'vice-president', confirmed: false },
  },
  counts: { jurisdictions: jurisdictions.length, missingAuthority },
  jurisdictions,
};

writeFileSync(join(ROOT, 'data/crosslayer/canvass-jurisdictions.json'), JSON.stringify(config, null, 1) + '\n');
console.log(`canvass jurisdictions: ${jurisdictions.length} states; missing authority: ${missingAuthority.length ? missingAuthority.join(',') : 'none'}`);
