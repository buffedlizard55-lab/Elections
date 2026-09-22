#!/usr/bin/env node
/**
 * Session 11 (2026-09-21) — first poll-layer rows from the four newly admitted pollsters
 * (Rasmussen Reports, Echelon Insights, PRRI, KFF), with #49 method labels.
 *
 * Every number below was transcribed in-session from the pollster's own release page,
 * fetched directly with the session page-fetch tool (see VERIFICATION.md §16). Candidate
 * names were corroborated against the saved Kalshi universe (yes_sub_title) before a
 * kalshiDemTicker was attached (the #67 discipline); the AK event is a PARTY market, so
 * its comparison is expected to be withheld by the conservative candidate check.
 *
 * One-off idempotent patch script — kept as the audit record of what was inserted.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'data/polls/poll-layer-2026.json');
const layer = JSON.parse(readFileSync(FILE, 'utf8'));
const D = '2026-09-21';

// ---- #49: Rasmussen's published design, labelled from its own methodology page ----
layer.methodFamilies.families['ivr-rdd-online-panel-blend'] =
  'Automated (recorded-voice) calls to randomly selected phone numbers plus an online survey panel for households without a landline (Rasmussen Reports / Pulse Opinion Research field work). Probability-flavoured RDD phone core blended with a non-probability online panel; distinct from live-caller RDD and from pure online panels. Do not pool unlabeled with either.';

const fam = 'ivr-rdd-online-panel-blend';
const famNote = "'The latest Rasmussen Reports national telephone and online survey'; field work by Pulse Opinion Research per the release. The firm's methodology page (fetched 2026-09-21) describes automated recorded-voice calls to randomly selected numbers plus 'an online survey tool to interview randomly selected participants from a demographically diverse panel' for landline-less households, with dynamic partisan weighting — labelled per #49, not pooled with other families.";

// ---- stateRaces ----
const stateRows = [
  {
    id: 'rasmussen-2026-09-ga-governor',
    race: 'Governor — Georgia',
    pollster: 'Rasmussen Reports (field work by Pulse Opinion Research)',
    fieldDates: '2026-09-14',
    population: 'LV',
    n: 1019,
    moe: 3,
    candidates: { D: { name: 'Keisha Lance Bottoms', pct: 45 }, R: { name: 'Rick Jackson', pct: 48 } },
    undecidedOrCouldChange: 'Not sure 7%',
    methodFamily: fam,
    methodNote: famNote,
    kalshiEvent: 'GOVPARTYGA-26',
    kalshiDemTicker: 'GOVPARTYGA-26-D',
    marketBasis: 'Candidate names corroborated 2026-09-21 against the saved universe vote-share markets KXVOTEGENERAL-GOVPARTYGA-26RJAC / -KBOT and the D/R yes_sub_titles ("Keisha Lance Bottoms" / "Rick Jackson").',
    source: 'https://www.rasmussenreports.com/public_content/politics/elections/election_2026/election_2026_georgia_governor',
    toplinesPdf: null,
    verifiedVia: "Rasmussen release page fetched directly 2026-09-21: '48% of Likely Georgia voters would vote for Jackson, while 45% would vote for Bottoms. Seven percent (7%) are not sure'; 'The survey of 1,019 Georgia Likely Voters was conducted on September 14, 2026 … margin of sampling error is +/- 3 percentage points'.",
    verifiedOn: D,
  },
  {
    id: 'rasmussen-2026-09-ga-senate',
    race: 'U.S. Senate — Georgia',
    pollster: 'Rasmussen Reports (field work by Pulse Opinion Research)',
    fieldDates: '2026-09-14',
    population: 'LV',
    n: 1019,
    moe: 3,
    candidates: { D: { name: 'Jon Ossoff', pct: 51, incumbent: true }, R: { name: 'Mike Collins', pct: 42 } },
    undecidedOrCouldChange: 'Not sure 6%',
    methodFamily: fam,
    methodNote: famNote,
    kalshiEvent: 'SENATEGA-26',
    kalshiDemTicker: 'SENATEGA-26-D',
    source: 'https://www.rasmussenreports.com/public_content/politics/elections/election_2026/election_2026_georgia_senate',
    toplinesPdf: null,
    verifiedVia: "Rasmussen release page fetched directly 2026-09-21: '51% of Likely Georgia voters would vote for Ossoff, while 42% would vote for Collins. Six percent (6%) are not sure'; n=1,019 Georgia LV, September 14, 2026, +/- 3. Market names ('Jon Ossoff' / 'Mike Collins') corroborate the nominees.",
    verifiedOn: D,
  },
  {
    id: 'rasmussen-2026-09-sc-senate',
    race: 'U.S. Senate — South Carolina (special)',
    pollster: 'Rasmussen Reports (field work by Pulse Opinion Research)',
    fieldDates: '2026-09-14',
    population: 'LV',
    n: 1006,
    moe: 3,
    candidates: { R: { name: 'Darline Graham', pct: 48 }, D: { name: 'Annie Andrews', pct: 43 } },
    undecidedOrCouldChange: 'Not sure 9%',
    methodFamily: fam,
    methodNote: famNote,
    kalshiEvent: 'SENATESC-26',
    kalshiDemTicker: 'SENATESC-26-D',
    marketBasis: "Identity corroborated against SENATESC-26 yes_sub_titles ('Darline Graham' / 'Annie Andrews'). The release's biographical narrative ('the seat formerly held by the late Sen. Lindsey Graham', an appointment by Gov. McMaster) is the publisher's own framing and is NOT corroborated by this project — see irregularity #69; only the toplines are ingested.",
    source: 'https://www.rasmussenreports.com/public_content/politics/elections/election_2026/election_2026_south_carolina_senate',
    toplinesPdf: null,
    verifiedVia: "Rasmussen release page fetched directly 2026-09-21: '48% of Likely South Carolina voters would vote for Graham, while 43% would vote for Andrews. Nine percent (9%) are not sure'; n=1,006 South Carolina LV, September 14, 2026, +/- 3.",
    verifiedOn: D,
  },
  {
    id: 'rasmussen-2026-09-ak-senate',
    race: 'U.S. Senate — Alaska (ranked-choice, four named candidates)',
    pollster: 'Rasmussen Reports (field work by Pulse Opinion Research)',
    fieldDates: '2026-09-13..2026-09-14',
    population: 'LV',
    n: 1188,
    moe: 3,
    candidates: { R: { name: 'Dan S. Sullivan', pct: 39, incumbent: true }, D: { name: 'Mary Peltola', pct: 39 } },
    undecidedOrCouldChange: "Also named on the ballot per the release: 'Daniel J. Sullivan' (R) 7%, Gerald Heikes (R) 6%; not sure 9%. Under Alaska's RCV the two-way D/R split is not the whole ballot — the party-market comparison is an approximation and is withheld by the candidate check by design.",
    methodFamily: fam,
    methodNote: famNote,
    kalshiEvent: 'SENATEAK-26',
    kalshiDemTicker: 'SENATEAK-26-D',
    marketBasis: 'SENATEAK-26 markets are PARTY markets (yes_sub_title "Democratic party" / "Republican party"), not candidate markets; the conservative identity check withholds the comparison. Recorded so the row is visible beside the market without an implied pairing.',
    source: 'https://www.rasmussenreports.com/public_content/politics/elections/election_2026/election_2026_alaska_senate',
    toplinesPdf: null,
    verifiedVia: "Rasmussen release page fetched directly 2026-09-21: '39% of Likely Alaska voters would vote for Sullivan, while 39% would vote for Peltola'; 'Daniel J. Sullivan' 7%, Heikes 6%, not sure 9%; n=1,188 Alaska LV, September 13-14, 2026, +/- 3.",
    verifiedOn: D,
  },
];

// ---- genericBallot ----
const genericRow = {
  id: 'rasmussen-2026-09-generic',
  pollster: 'Rasmussen Reports (field work by Pulse Opinion Research)',
  fieldDates: '2026-09-10,2026-09-13..2026-09-16',
  population: 'LV',
  n: 1746,
  moe: 2,
  question: "If the elections for Congress were held today, would you vote for the Democratic candidate or the Republican candidate in your district (release summary; exact wording at the linked questions page)",
  D: 49,
  R: 41,
  unsure: null,
  likelyVoterNote: "Likely U.S. Voters; 'some other candidate' 4% and 'not sure' 5% are reported separately (D+R=90, remainder 9).",
  methodFamily: fam,
  methodNote: famNote,
  released: '2026-09-21',
  source: 'https://www.rasmussenreports.com/public_content/politics/mood_of_america/generic_congressional_ballot',
  verifiedVia: "Rasmussen Generic Congressional Ballot page fetched directly 2026-09-21: '49% of Likely U.S. Voters would vote for the Democratic candidate, while 41% would vote for the Republican. Four percent (4%) say they would vote for some other candidate, while five percent (5%) are not sure'; 'The survey of 1,746 U.S. Likely Voters was conducted on September 10 and 13-16, 2026 … margin of sampling error is +/- 2 percentage points with a 95% level of confidence.'",
  verifiedOn: D,
};

let added = 0;
for (const r of stateRows) {
  if (!layer.stateRaces.some((x) => x.id === r.id)) { layer.stateRaces.push(r); added++; }
}
if (!layer.genericBallot.some((x) => x.id === genericRow.id)) { layer.genericBallot.push(genericRow); added++; }

// ---- pendingSources: the other three of the four new pollsters ----
const pending = [
  {
    id: 'echelon-2026-04-fl',
    status: 'Not ingested: no primary release with methodology on echeloninsights.com; the April 2026 Florida poll was conducted on behalf of NetChoice (sponsor) and is only visible through secondary press',
    evidence: "echeloninsights.com fetched directly 2026-09-21: featured analysis is '2026 Political Tribes' (segmentation) and 'The New Politics of American Business' — no public 2026 horse-race release. Secondary report floridianpress.com (Apr 27, 2026): Donalds 49 / Jolly 43 and Donalds 48 / Demings 44; Senate Moody 50 / Vindman 43, 'on behalf of NetChoice'.",
    action: "Admit only from an Echelon primary release with a published methodology statement. Note the Senate scenario uses Vindman while the saved market (per #67) names Nixon — candidate-conservative handling applies.",
  },
  {
    id: 'prri-2026-ava-midterms',
    status: 'Verified 2026-09-21 directly, deliberately NOT ingested as a race row: the midterms project publishes American Values Atlas demographics/attitudes (party ID, religious landscape, Trump favorability, issue views) for GA/MI/NC/OH/TX — no 2026 horse-race or generic-ballot question',
    evidence: 'prri.org/data-and-the-2026-midterm-elections/ fetched directly 2026-09-21: five state explorers with published per-year n and MoE (e.g. 2026 partial-year GA n=306 MoE 6.4; TX n=907 MoE 3.7), AVA 2022–2026 series; no candidate preference question.',
    action: "Use as covariate/context data for the five states' models if ever needed; a horse-race row requires a PRRI poll release with candidate preference.",
  },
  {
    id: 'kff-2026-06-mifepristone-midterms',
    status: 'Verified 2026-09-21 directly, deliberately NOT ingested as a race row: KFF Health Tracking Poll on mifepristone/abortion policy is issue-only (no candidate preference or generic ballot)',
    evidence: "kff.org/public-opinion/kff-health-tracking-poll-mifepristone-and-the-midterms/ fetched directly 2026-09-21: published Jul 30, 2026; chart source line 'KFF Health Tracking Poll (June 25-30, 2026)'; election relevance is issue salience ('a majority of voters (57%) say it is extremely or very important for candidates to discuss abortion policy').",
    action: "Issue-salience context only; a race row would require a KFF candidate-preference question (not in this release).",
  },
];
for (const p of pending) {
  const i = layer.pendingSources.findIndex((x) => x.id === p.id);
  if (i >= 0) layer.pendingSources[i] = p; else layer.pendingSources.push(p);
}
// surveyusa pending entry: methodology statement progress from today's re-test
const su = layer.pendingSources.find((x) => x.id === 'surveyusa-28000-mn');
if (su) {
  su.status = 'Re-tested 2026-09-21 (session 11): report metadata + methodology statement readable, toplines still absent (percentages load client-side)';
  su.evidence = 'PollReport page fetched 2026-09-21: Minnesota, field 09/09/2026-09/14/2026, release 09/15/2026, sponsors KAAL/KSTP/WDIO, body still "blank"; the linked Statement of Methodology (methodology.aspx?g=d7f40035…) IS now readable: mixed-mode (landline via Aristotle + cell/online), credibility interval since 01/01/17, NCPP disclosure.';
  su.action = 'When toplines render, label methodFamily from the release itself (mixed-mode per that statement), never from the brand.';
}

layer.updated = D;
layer.capturedAt = new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');
writeFileSync(FILE, JSON.stringify(layer, null, 1) + '\n');
console.log(`poll layer patched: +${added} rows (4 state, 1 generic), ${pending.length} pending entries written/updated, families now ${Object.keys(layer.methodFamilies.families).length}`);
