/**
 * Master source registry + the site's Sources view.
 *
 * Two things are checked here:
 *   1. the registry itself (data/sources/master.json) — every entry carries a manual-review URL,
 *      the observed-verification text, a verification date, a status, a category and notes; ids and
 *      urls are unique; the published category tally matches the entries; and the session-4 batch of
 *      20 directly-fetched entries is present and dated 2026-09-19.
 *   2. the rendered Sources section — executed headlessly against the committed site bundle the same
 *      way scripts/render-check.cjs does it, then asserted at the HTML level: the filter controls
 *      exist, one block per category, one row per entry, and each block's row count equals both the
 *      bundle's category tally and the number shown in its own count chip.
 *
 *   Session-5 (2026-09-19, branch arena/01a0bb28-elections) additionally asserts the 20 new
 *   entries from that batch and the expanded irregularities ledger (#50–#53).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(join(ROOT, 'data/sources/master.json'), 'utf8'));

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SESSION4_IDS = [
  'fvap', 'wisconsin-wec', 'nevada-sos', 'california-sos', 'pennsylvania-dos', 'virginia-elections',
  'gao', 'ces-tufts', 'healthyelections-mit', 'voteview', 'circle-tufts', 'brennan-center',
  'bipartisan-policy-center', 'decision-desk-hq', '270towin', 'atlasintel', 'harris-poll',
  'npr-elections', 'pbs-newshour', 'saint-anselm-sasc',
];

test('registry: every entry has url + observed verification + date + status + category + notes', () => {
  assert.ok(Array.isArray(master.sources) && master.sources.length >= 125, `found ${master.sources?.length}`);
  for (const s of master.sources) {
    assert.match(s.url, /^https:\/\//, `${s.id}: url`);
    assert.ok(s.verified && s.verified.length > 40, `${s.id}: verified text too short to be an observation`);
    assert.match(s.verifiedOn, /^\d{4}-\d{2}-\d{2}$/, `${s.id}: verifiedOn`);
    assert.ok(s.status, `${s.id}: status`);
    assert.ok(s.category, `${s.id}: category`);
    assert.ok(s.name && s.type, `${s.id}: name/type`);
    // Organisational notes are required for every entry admitted on/after 2026-09-19 (the convention
    // landed with the session-3 batch); the 2026-09-18 base batch predates it and is checked by
    // lint-verified.mjs only for url/verified/date/status/category.
    if (s.verifiedOn >= '2026-09-19') assert.ok(s.notes, `${s.id}: notes required for post-2026-09-18 entries`);
  }
});

test('registry: ids and urls are unique (no duplicated institution or link)', () => {
  const ids = master.sources.map((s) => s.id);
  const urls = master.sources.map((s) => s.url);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  assert.equal(new Set(urls).size, urls.length, 'duplicate urls');
});

test('registry: the published category tally matches the entries the site groups by', () => {
  assert.ok(Array.isArray(master.categories) && master.categories.length === 9, 'expected 9 categories');
  const names = master.categories.map((c) => c.name);
  for (const s of master.sources) assert.ok(names.includes(s.category), `${s.id}: unknown category ${s.category}`);
  for (const c of master.categories) {
    const n = master.sources.filter((s) => s.category === c.name).length;
    assert.equal(n, c.count, `category "${c.name}" claims ${c.count}, has ${n}`);
  }
  assert.equal(master.categories.reduce((a, c) => a + c.count, 0), master.sources.length, 'tally total');
});

test('registry: the 20 session-4 entries are present, dated 2026-09-19 and verified-direct', () => {
  const byId = Object.fromEntries(master.sources.map((s) => [s.id, s]));
  for (const id of SESSION4_IDS) {
    const s = byId[id];
    assert.ok(s, `missing session-4 entry ${id}`);
    assert.equal(s.verifiedOn, '2026-09-19', `${id}: verifiedOn`);
    assert.equal(s.status, 'verified', `${id}: status`);
    assert.match(s.verified, /Fetched directly 2026-09-19|fetched directly 2026-09-19|Primary PDF fetched directly 2026-09-19/, `${id}: must state it was fetched this session`);
  }
  const dated = master.sources.filter((s) => s.verifiedOn === '2026-09-19').length;
  assert.equal(dated, 115, `expected 115 entries verified on 2026-09-19 (93 through session 5 + 22 in session 6), found ${dated}`);
});

// ---- session-5 batch (2026-09-19, branch arena/01a0bb28-elections): 20 new entries ----
const SESSION5_IDS = [
  'minnesota-sos', 'new-jersey-doe', 'new-york-sboe', 'florida-dos-elections', 'oregon-sos',
  'massachusetts-elections', 'illinois-sbe', 'american-presidency-project', 'uw-madison-erc',
  'umass-amherst-poll', 'muhlenberg-ciopo', 'fox-news-poll', 'noble-predictive-insights',
  'state-navigate', 'metaculus', 'race-to-the-wh', 'wsj', 'axios', 'texas-tribune', 'c-span',
];

test('registry: the 20 session-5 entries are present, dated 2026-09-19, and either verified-direct or verified-via-search', () => {
  const byId = Object.fromEntries(master.sources.map((s) => [s.id, s]));
  for (const id of SESSION5_IDS) {
    const s = byId[id];
    assert.ok(s, `missing session-5 entry ${id}`);
    assert.equal(s.verifiedOn, '2026-09-19', `${id}: verifiedOn`);
    assert.ok(['verified', 'verified-via-search'].includes(s.status), `${id}: status ${s.status}`);
    assert.match(
      s.verified,
      /Fetched directly 2026-09-19|Primary PDF fetched directly 2026-09-19|fetched directly 2026-09-19|Reached through live search 2026-09-19/,
      `${id}: must state how it was observed this session`,
    );
    assert.ok(s.notes && s.notes.length > 40, `${id}: notes`);
  }
  // massachusetts-elections came in through a search-discovered page and stays verified-via-search
  // (its root 403s the fetcher). oregon-sos ALSO started verified-via-search but was promoted to
  // 'verified' on 2026-09-21 (session 11) after a direct re-fetch with a dated note, so it must
  // no longer appear here.
  const viaSearch = SESSION5_IDS.filter((id) => byId[id].status === 'verified-via-search');
  assert.deepEqual(viaSearch.sort(), ['massachusetts-elections']);
  assert.equal(byId['oregon-sos'].status, 'verified', 'oregon-sos was promoted to verified 2026-09-21');
  // No session-5 entry may quote a Kalshi price without referencing the capture date.
  for (const id of SESSION5_IDS) {
    if (/0\.\d{3}\/0\.\d{3}/.test(byId[id].notes)) {
      assert.match(byId[id].notes, /2026-09-19 (universe )?capture/, `${id}: market quotes must cite the capture date`);
    }
  }
});

// ---- session-6 batch (2026-09-19, branch arena/01a0bb51-elections): 20 new entries + 2 re-test admissions ----
const SESSION6_NEW_IDS = [
  'south-carolina-sec', 'kansas-sos', 'montana-sos', 'nebraska-sos', 'new-mexico-sos', 'wyoming-sos', 'colorado-sos',
  'oklahoma-seb', 'tennessee-sos', 'hawaii-oe', 'washington-sos-results', 'north-dakota-sos-results', 'delaware-doe',
  'rhode-island-boe', 'vermont-election-archive', 'south-dakota-sos-history', 'data-for-progress', 'civiqs',
  'election-betting-odds', 'openelections',
];
const SESSION6_RETEST_ADMITTED = ['courtlistener', 'franklin-marshall-poll'];

test('registry: the 20 session-6 entries + 2 re-test admissions are present, dated 2026-09-19, with observed text and notes', () => {
  const byId = Object.fromEntries(master.sources.map((s) => [s.id, s]));
  assert.equal(SESSION6_NEW_IDS.length, 20);
  for (const id of [...SESSION6_NEW_IDS, ...SESSION6_RETEST_ADMITTED]) {
    const s = byId[id];
    assert.ok(s, `missing session-6 entry ${id}`);
    assert.equal(s.verifiedOn, '2026-09-19', `${id}: verifiedOn`);
    assert.match(s.verified, /Fetched directly 2026-09-19|fetched directly 2026-09-19|Reached 2026-09-19 via redirect/, `${id}: must state how it was observed this session`);
    assert.ok(s.notes && s.notes.length > 40, `${id}: notes`);
  }
  // Two partisan-affiliated pollsters are admitted only with needs-review; two renderers/transcribers are verified-claim.
  assert.deepEqual(SESSION6_NEW_IDS.filter((id) => byId[id].status === 'needs-review').sort(), ['civiqs', 'data-for-progress']);
  assert.deepEqual(SESSION6_NEW_IDS.filter((id) => byId[id].status === 'verified-claim').sort(), ['election-betting-odds', 'openelections']);
  // F&M must point at the poll's own domain (brand trap: not fandm.edu) and be tied to the ingested rows.
  assert.match(byId['franklin-marshall-poll'].url, /^https:\/\/www\.fandmpoll\.org\//);
  assert.match(byId['franklin-marshall-poll'].notes, /fm-2026-08-pa-governor/);
  assert.ok(master.sources.length >= 147, `expected >= 147 sources, found ${master.sources.length}`);
});

// ---- session-7 batch (2026-09-20, branch arena/01a0bca8-elections): 22 new entries (13 state offices + 9 pollsters) ----
const SESSION7_NEW_IDS = [
  'alabama-sos', 'arkansas-sos', 'connecticut-elections-database', 'idaho-sos-voteidaho', 'indiana-election-division',
  'kentucky-sbe-results', 'louisiana-sos', 'maryland-sbe-2026', 'mississippi-sos', 'missouri-sos-elections', 'new-hampshire-sos',
  'utah-lt-governor-vote', 'west-virginia-sos', 'surveyusa', 'harrisx', 'elon-poll', 'hpu-survey-research-center',
  'umass-lowell-cpo', 'roanoke-college-ipor', 'uh-hobby-school-elections', 'fhsu-docking-kansas-speaks', 'winthrop-poll',
];
const SESSION7_RETESTED = ['harris-poll', 'courtlistener', 'wisconsin-wec', 'nevada-sos', 'california-sos', 'massachusetts-elections', 'metaculus', '270towin'];

test('registry: the 22 session-7 entries are present, dated 2026-09-20, fetched directly, with notes; re-tests are recorded in place', () => {
  const byId = Object.fromEntries(master.sources.map((s) => [s.id, s]));
  assert.equal(SESSION7_NEW_IDS.length, 22);
  for (const id of SESSION7_NEW_IDS) {
    const s = byId[id];
    assert.ok(s, `missing session-7 entry ${id}`);
    assert.equal(s.verifiedOn, '2026-09-20', `${id}: verifiedOn`);
    assert.equal(s.status, 'verified', `${id}: every session-7 admission was a direct read`);
    assert.match(s.verified, /[Ff]etched directly 2026-09-20/, `${id}: must state it was fetched this session`);
    assert.ok(s.notes && s.notes.length > 40, `${id}: notes`);
  }
  // SurveyUSA/HarrisX were #47/#51 exclusions: admitted only on the live host actually read (not surveypoll.com).
  assert.match(byId.surveyusa.url, /^https:\/\/results\.surveyusa\.com\//);
  assert.match(byId.harrisx.url, /^https:\/\/(www\.)?harrisx\.com\//);
  // Re-tested entries keep their original verifiedOn and append a dated addendum instead of being rewritten.
  for (const id of SESSION7_RETESTED) {
    assert.ok(byId[id], `missing re-tested entry ${id}`);
    assert.match(byId[id].verified, /Re-test 2026-09-20/, `${id}: re-test addendum`);
    assert.notEqual(byId[id].verifiedOn, '2026-09-20', `${id}: re-test must not overwrite the original verification date`);
  }
  // Session 8 (2026-09-20, branch arena/01a0bfa5-elections) admits 20 more entries the same day —
  // 42 entries dated 2026-09-20 in total (22 + 20).
  assert.equal(master.sources.filter((s) => s.verifiedOn === '2026-09-20').length, 42);
  assert.ok(master.sources.length >= 189, `expected >= 189 sources, found ${master.sources.length}`);
});

// ---- session-8 batch (2026-09-20, branch arena/01a0bfa5-elections): 20 new entries ----
// 7 county/DC official boards, 5 pollsters/academic (Stetson CPOR, Rasmussen, PPP, Echelon, UNF PORL),
// 1 academic institute (MSU IPPSR), 5 news desks, 1 crowd-forecast platform (Manifold), 1 results host (Clarity ENR).
const SESSION8_NEW_IDS = [
  'dcboe', 'maricopa-county-az', 'king-county-wa', 'harris-county-tx', 'wayne-county-mi', 'clark-county-nv',
  'cook-county-il', 'ippsr-msu', 'stetson-cpor', 'rasmussen-reports', 'public-policy-polling', 'echelon-insights',
  'unf-porl', 'usatoday', 'latimes', 'theguardian-us', 'ajc', 'desmoinesregister', 'manifold-markets', 'clarity-enr',
];
// These two were located via live search on the official domains; the direct fetches 404/500'd at
// verification time, so they carry the honest "live search" wording plus a required direct-200 re-fetch note.
const SESSION8_SEARCH_ADMITTED = ['cook-county-il', 'unf-porl'];

test('registry: the 20 session-8 entries are present, dated 2026-09-20, with notes; 18 fetched directly, 2 via documented live search', () => {
  const byId = Object.fromEntries(master.sources.map((s) => [s.id, s]));
  assert.equal(SESSION8_NEW_IDS.length, 20);
  for (const id of SESSION8_NEW_IDS) {
    const s = byId[id];
    assert.ok(s, `missing session-8 entry ${id}`);
    assert.equal(s.verifiedOn, '2026-09-20', `${id}: verifiedOn`);
    assert.equal(s.status, 'verified', `${id}: status`);
    assert.ok(s.notes && s.notes.length > 40, `${id}: notes`);
    if (SESSION8_SEARCH_ADMITTED.includes(id)) {
      assert.match(s.verified, /live search on 2026-09-20/, `${id}: admitted via documented live search`);
      assert.match(s.notes, /re-fetch/i, `${id}: must require a direct 200 re-fetch before machine use`);
    } else {
      assert.match(s.verified, /[Ff]etched directly 2026-09-20/, `${id}: must state it was fetched this session`);
    }
  }
  // The two hosts that answered a non-200 to the plain fetcher must say so in the entry text itself.
  assert.match(byId['clarity-enr'].verified, /403 Forbidden/, 'GA Clarity 403 to the plain fetcher is recorded, not papered over');
  assert.match(byId['cook-county-il'].verified, /500/, 'Cook County 500 at verification time is recorded, not papered over');
});

const BATCH4_IDS = [
  'fairfax-county-va', 'montgomery-county-md', 'shelby-county-tn', 'allegheny-county-pa',
  'cobb-county-ga', 'prince-georges-md', 'collin-county-tx', 'mecklenburg-boe',
  'wake-county-boe', 'gwinnett-county-ga', 'dekalb-county-ga', 'bernalillo-county-nm',
  'ramsey-county-mn', 'fort-bend-county-tx', 'lwv', 'verified-voting',
];

test('registry: the 16 batch-4 entries are present and already-admitted offices were not duplicated', () => {
  const byId = Object.fromEntries(master.sources.map((s) => [s.id, s]));
  assert.equal(BATCH4_IDS.length, 16);
  for (const id of BATCH4_IDS) {
    const s = byId[id];
    assert.ok(s, `missing batch-4 entry ${id}`);
    assert.equal(s.verifiedOn, '2026-09-21', `${id}: verifiedOn`);
    assert.equal(s.status, 'verified', `${id}: status`);
    assert.match(s.verified, /Fetched directly 2026-09-21/, `${id}: must state it was fetched this session`);
    assert.ok(s.notes && s.notes.length > 40, `${id}: notes`);
  }
  assert.equal(byId.lwv.category, 'Ratings, forecasts & analysis');
  assert.equal(byId['verified-voting'].category, 'Ratings, forecasts & analysis');
  assert.equal(byId['vote-org'].category, 'Ratings, forecasts & analysis');
  assert.equal(byId['rock-the-vote'].category, 'Ratings, forecasts & analysis');
  assert.ok(byId['baltimore-city-boe'], 'existing Baltimore entry must remain');
  assert.equal(byId['baltimore-city-boe'].url, 'https://www.baltimorecity.gov/boe');
  assert.ok(!byId['denver-elections'], 'denver-elections must not duplicate denver-clerk-recorder');
  assert.ok(!byId['multnomah-county-or'], 'multnomah-county-or must not duplicate multnomah-county-elections');
  assert.ok(!byId['salt-lake-county-ut'], 'salt-lake-county-ut must not duplicate salt-lake-county-clerk');
  assert.equal(master.sources.filter((s) => s.verifiedOn === '2026-09-21').length, 76);
  assert.equal(master.sources.length, 265);
});

test('poll layer: session-7 rows (Elon + HPU NC Senate, HarrisX generic) carry #49 labels; declined rows stay in pendingSources', () => {
  const PL = JSON.parse(readFileSync(join(ROOT, 'data/polls/poll-layer-2026.json'), 'utf8'));
  const fams = new Set(Object.keys(PL.methodFamilies.families));
  const nc = PL.stateRaces.find((r) => r.id === 'elon-2026-09-nc-senate');
  assert.ok(nc, 'elon-2026-09-nc-senate row');
  assert.equal(nc.kalshiDemTicker, 'SENATENC-26-D');
  assert.deepEqual([nc.candidates.D.pct, nc.candidates.R.pct], [49, 38]);
  assert.ok(fams.has(nc.methodFamily), `methodFamily ${nc.methodFamily}`);
  const hpu = PL.stateRaces.find((r) => r.id === 'hpu-2026-04-nc-senate');
  assert.ok(hpu, 'hpu-2026-04-nc-senate row');
  assert.equal(hpu.kalshiDemTicker, 'SENATENC-26-D');
  assert.deepEqual([hpu.candidates.D.pct, hpu.candidates.R.pct, hpu.n, hpu.moe], [50, 42, 703, 4.3]);
  assert.equal(hpu.methodFamily, 'online-nonprobability-matched', 'HPU Poll 120 was fielded by YouGov online — not the lab\'s CATI operation');
  assert.match(hpu.methodNote, /credibility interval/, 'the release disclaims a classic MoE; the row must say the figure is a credibility interval');
  const hx = PL.genericBallot.find((r) => r.id === 'harrisx-2026-08-generic');
  assert.ok(hx, 'harrisx-2026-08-generic row');
  assert.equal(hx.moe, null, 'HarrisX publishes no MoE for its opt-in panel — must stay null, not estimated');
  assert.ok(fams.has(hx.methodFamily), `methodFamily ${hx.methodFamily}`);
  for (const r of [nc, hpu, hx]) { assert.equal(r.verifiedOn, '2026-09-20'); assert.match(r.source, /^https:\/\//); }
  // UMass Lowell ME tested a non-nominee (Platner) and SurveyUSA MN is a client-rendered report: evidence only (#60, #47).
  const pendingIds = PL.pendingSources.map((x) => x.id);
  assert.ok(pendingIds.includes('umass-lowell-2026-05-me-senate'), 'ME row must not be ingested as a race row');
  assert.ok(pendingIds.includes('surveyusa-28000-mn'), 'MN report pending until rendered');
  assert.ok(!PL.stateRaces.some((r) => /umass-lowell-2026-05-me/.test(r.id)));
});

test('poll layer: session-8 rows (HPU 126 ×2, UH Hobby ×2, Saint Anselm, Stetson ×2, PPP) carry #49 labels and honest market mapping', () => {
  const PL = JSON.parse(readFileSync(join(ROOT, 'data/polls/poll-layer-2026.json'), 'utf8'));
  const fams = new Set(Object.keys(PL.methodFamilies.families));
  const find = (id) => PL.stateRaces.find((r) => r.id === id);
  const hpu126 = find('hpu-2026-08-nc-senate');
  assert.ok(hpu126, 'hpu-2026-08-nc-senate row');
  assert.equal(hpu126.kalshiDemTicker, 'SENATENC-26-D');
  assert.deepEqual([hpu126.candidates.D.pct, hpu126.candidates.R.pct, hpu126.n, hpu126.moe], [50, 45, 660, 5.2]);
  assert.equal(hpu126.methodFamily, 'online-nonprobability-matched');
  assert.match(hpu126.methodNote, /credibility interval/i, 'Poll 126, like 120, publishes a credibility interval, not a sampling MoE');
  const hpuHouse = find('hpu-2026-08-nc-house-generic');
  assert.ok(hpuHouse, 'hpu-2026-08-nc-house-generic row');
  assert.deepEqual([hpuHouse.candidates.D.pct, hpuHouse.candidates.R.pct], [47, 47]);
  assert.equal(hpuHouse.kalshiDemTicker, null, 'no Kalshi D/R delegation-control event exists — the ticker is null BY DESIGN');
  assert.match(hpuHouse.marketBasis, /KXHOUSEWINSTATE-NCD/, 'the null must be explained against the seat-count event that does exist');
  assert.match(hpuHouse.marketBasis, /not a D\/R race question/);
  const uhtxg = find('uh-hobby-2026-01-tx-governor');
  assert.ok(uhtxg, 'uh-hobby-2026-01-tx-governor row');
  assert.equal(uhtxg.kalshiDemTicker, 'GOVPARTYTX-26-D');
  assert.deepEqual([uhtxg.candidates.D.pct, uhtxg.candidates.R.pct, uhtxg.n, uhtxg.moe], [42, 49, 1502, 2.53]);
  const uhtxs = find('uh-hobby-2026-01-tx-senate');
  assert.ok(uhtxs, 'uh-hobby-2026-01-tx-senate row');
  assert.equal(uhtxs.kalshiDemTicker, 'SENATETX-26-D');
  assert.deepEqual([uhtxs.candidates.D.pct, uhtxs.candidates.R.pct], [43, 45.5], 'median of the six candidate-matched scenarios');
  assert.match(uhtxs.methodNote, /median/i, 'a candidate-matched multi-scenario poll must state the reduction to a median, not silently pick one scenario');
  const sa = find('saint-anselm-2026-06-nh-senate');
  assert.ok(sa, 'saint-anselm-2026-06-nh-senate row');
  assert.equal(sa.kalshiDemTicker, 'SENATENH-26-D');
  assert.deepEqual([sa.candidates.D.pct, sa.candidates.R.pct, sa.n, sa.moe], [47, 41, 1614, 2.4]);
  assert.equal(sa.methodFamily, 'random-cellphone-rv-panel', 'SASC draws random cells from the RV frame — a new family, not an online panel');
  assert.ok(fams.has(sa.methodFamily));
  assert.ok(sa.marketGap, 'the ≈0.83 market vs D 47/R 41 pre-primary poll must be recorded as a published gap');
  const stg = find('stetson-2026-04-fl-governor');
  assert.ok(stg, 'stetson-2026-04-fl-governor row');
  assert.equal(stg.kalshiDemTicker, 'GOVPARTYFL-26-D');
  assert.deepEqual([stg.candidates.D.pct, stg.candidates.R.pct, stg.n, stg.moe], [40, 47, 848, 4.1]);
  assert.equal(stg.methodFamily, 'online-nonprobability-matched', 'CPOR: Qualtrics online non-probability panel, per its own methodology paragraph');
  const sts = find('stetson-2026-04-fl-senate');
  assert.ok(sts, 'stetson-2026-04-fl-senate row');
  assert.equal(sts.kalshiEvent, 'SENATEFLS-26', 'the 2026 FL Senate seat is the short-term seat — SENATEFLS-26, not the 2028 class');
  assert.equal(sts.kalshiDemTicker, 'SENATEFLS-26-D');
  assert.deepEqual([sts.candidates.D.pct, sts.candidates.R.pct], [42, 49]);
  const ppp = find('ppp-2026-07-nc-senate');
  assert.ok(ppp, 'ppp-2026-07-nc-senate row');
  assert.equal(ppp.kalshiDemTicker, 'SENATENC-26-D');
  assert.deepEqual([ppp.candidates.D.pct, ppp.candidates.R.pct, ppp.n, ppp.moe], [48, 44, 759, 3.6]);
  assert.equal(ppp.methodFamily, null, 'PPP mode/weighting not transcribed verbatim — methodFamily stays null (#49 discipline), the PDF link carries the methodology');
  for (const r of [hpu126, hpuHouse, uhtxg, uhtxs, sa, stg, sts, ppp]) {
    assert.equal(r.verifiedOn, '2026-09-20', `${r.id} verifiedOn`);
    assert.match(r.source, /^https?:\/\//, `${r.id} source`);
    assert.ok(fams.has(r.methodFamily) || r.methodFamily === null, `${r.id} methodFamily`);
  }
  // CIRCLE: youth poll is a subpopulation reading (no D/R race numbers), YESI lists are an independent prior.
  const circ = PL.aggregatorReadings.find((a) => a.id === 'circle-2026-youth-poll');
  assert.ok(circ, 'circle-2026-youth-poll aggregator reading');
  assert.equal(circ.n, 5549);
  assert.equal(circ.D, null, 'youth party-ID is not a race number — D/R stay null');
  assert.ok(circ.partyIdentification, 'the 57/43 partisan split is recorded under its own key');
  const prior = (PL.independentPriors || []).find((x) => x.id === 'circle-yesi-2026');
  assert.ok(prior, 'circle-yesi-2026 independent prior');
  assert.equal(prior.senate.length, 10);
  assert.ok(prior.senate.includes('ME') && prior.senate.includes('TX'));
  // Pending: FHSU (policy-only), Winthrop first national (issues-only), Roanoke (issues-only) — all verified, none ingested.
  const pendingIds = PL.pendingSources.map((x) => x.id);
  for (const id of ['fhsu-2025-fall-kansas-speaks', 'winthrop-2026-07-national', 'roanoke-2026-02']) {
    assert.ok(pendingIds.includes(id), `pending: ${id}`);
  }
  assert.ok(!PL.stateRaces.some((r) => /winthrop|fhsu|roanoke/.test(r.id)), 'no rows fabricated from issues-only releases');
});

test('poll layer: session-6 rows carry #49 methodFamily labels and map to captured Kalshi events', () => {
  const PL = JSON.parse(readFileSync(join(ROOT, 'data/polls/poll-layer-2026.json'), 'utf8'));
  const fams = new Set(Object.keys(PL.methodFamilies.families));
  const rows = [...PL.genericBallot, ...PL.stateRaces].filter((r) => /^(umass-2026-08|fox-2026-09|fm-2026-08|npi-2026-08)/.test(r.id));
  assert.equal(rows.length, 5, `expected 5 session-6 rows, found ${rows.map((r) => r.id)}`);
  for (const r of rows) {
    assert.ok(fams.has(r.methodFamily), `${r.id}: methodFamily ${r.methodFamily} not in the documented families`);
    assert.equal(r.verifiedOn, '2026-09-19');
    assert.match(r.source, /^https:\/\//);
  }
  const az = PL.stateRaces.find((r) => r.id === 'npi-2026-08-az-governor');
  assert.equal(az.kalshiDemTicker, 'GOVPARTYAZ-26-D');
  assert.deepEqual([az.candidates.D.pct, az.candidates.R.pct], [48, 35]);
  const pa = PL.stateRaces.find((r) => r.id === 'fm-2026-08-pa-governor');
  assert.equal(pa.kalshiDemTicker, 'GOVPARTYPA-26-D');
  assert.deepEqual([pa.candidates.D.pct, pa.candidates.R.pct], [50, 25]);
  const fox = PL.genericBallot.find((r) => r.id === 'fox-2026-09-generic');
  assert.deepEqual([fox.D, fox.R, fox.n], [51, 44, 1211]);
  const um = PL.genericBallot.find((r) => r.id === 'umass-2026-08-house-generic');
  assert.deepEqual([um.D, um.R, um.extra.senateGenericBallot.D, um.extra.senateGenericBallot.R], [42, 34, 40, 38]);
  // Muhlenberg: no fabricated row — recorded as pending.
  assert.ok(PL.pendingSources.some((p) => p.id === 'muhlenberg-ciopo'));
  assert.ok(!rows.some((r) => /muhlenberg/i.test(r.pollster)));
});

test('site: the Cross-layer section renders pending rows and the R14 spread', () => {
  const { html, bundle } = renderSection('crosslayer');
  assert.match(html, /Cross-layer scoreboard/);
  if (bundle.crossLayer.scored.pendingCount) assert.match(html, /pending canvass/);
  if (bundle.crossLayer.scored.scoredCount) assert.match(html, /scored · y=/);
  assert.match(html, /SENATE-CONTROL-2026/);
  assert.match(html, /7\.8 pts/); // Kalshi 0.595 mid vs Metaculus 0.517 on 2026-09-19
});

// ---- render the Sources section headlessly against the committed bundle ----
function renderSection(section) {
  const els = {};
  const mk = (id) => (els[id] = els[id] || { id, innerHTML: '', textContent: '', querySelectorAll: () => [], classList: { toggle() {} } });
  const listeners = {};
  const sandbox = {
    console,
    location: { hash: `#/${section}` },
    requestAnimationFrame: (f) => f(),
    document: { getElementById: (id) => (['main', 'nav', 'footline'].includes(id) ? mk(id) : null) },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (ev, f) => { listeners[ev] = f; };
  sandbox.scrollTo = () => {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(ROOT, 'src/data/site-data.js'), 'utf8'), sandbox);
  sandbox.Chart2 = { lines() {} };
  vm.runInContext(readFileSync(join(ROOT, 'src/site/app.js'), 'utf8'), sandbox);
  listeners.hashchange(); // renders the section named in location.hash, then runs its AFTER hook
  return { html: els.main.innerHTML, bundle: sandbox.SITE_DATA };
}

test('site: the Sources section renders the filter toolbar and one block per category', () => {
  const { html, bundle } = renderSection('sources');
  for (const id of ['src-q', 'src-cat', 'src-date', 'src-reset', 'src-count']) {
    assert.ok(html.includes(`id="${id}"`), `missing control #${id}`);
  }
  const blocks = html.match(/<section class="src-cat" data-cat="[^"]*">/g) || [];
  const cats = bundle.sources.categories.map((c) => c.name);
  assert.equal(blocks.length, cats.length, `expected ${cats.length} category blocks, got ${blocks.length}`);
  for (const c of cats) {
    assert.ok(blocks.includes(`<section class="src-cat" data-cat="${esc(c)}">`), `missing block for "${c}"`);
  }
});

test('site: the Sources section renders exactly one row per registry entry, correctly tagged', () => {
  const { html, bundle } = renderSection('sources');
  const rows = html.match(/<tr data-cat="/g) || [];
  assert.equal(rows.length, bundle.sources.sources.length, 'row count must equal the registry size');
  const dates = html.match(/data-date="(\d{4}-\d{2}-\d{2})"/g) || [];
  assert.equal(dates.length, rows.length, 'every row needs a verification date');
  const texts = html.match(/data-text="/g) || [];
  assert.equal(texts.length, rows.length, 'every row needs a searchable text blob');
  assert.equal((html.match(/<details class="src-more">/g) || []).length, rows.length, 'one expandable verification panel per row');
  // No entry may render without its manual-review link.
  const links = html.match(/target="_blank" rel="noopener"/g) || [];
  assert.ok(links.length >= rows.length, 'every row needs its source link');
});

test('site: each category block shows the same count as the registry tally', () => {
  const { html, bundle } = renderSection('sources');
  for (const c of bundle.sources.categories) {
    const re = new RegExp(`<section class="src-cat" data-cat="${reEsc(esc(c.name))}">([\\s\\S]*?)</section>`);
    const m = html.match(re);
    assert.ok(m, `block not found for ${c.name}`);
    const rows = (m[1].match(/<tr data-cat="/g) || []).length;
    assert.equal(rows, c.count, `${c.name}: rendered ${rows} rows, tally says ${c.count}`);
    const chip = m[1].match(/<span class="chip" data-count>(\d+)<\/span>/);
    assert.ok(chip, `${c.name}: count chip missing`);
    assert.equal(Number(chip[1]), c.count, `${c.name}: chip says ${chip[1]}, tally says ${c.count}`);
  }
});

test('site: the bundle and data/sources/master.json describe the same registry', () => {
  const { bundle } = renderSection('sources');
  assert.equal(bundle.sources.sources.length, master.sources.length, 'entry count');
  // NOTE: the bundle is evaluated inside a vm context, so its arrays/objects carry that realm's
  // prototypes and assert.deepEqual would reject them on prototype identity alone. Compare content.
  assert.equal(JSON.stringify(bundle.sources.sources.map((s) => s.id)), JSON.stringify(master.sources.map((s) => s.id)), 'ids and order');
  assert.equal(JSON.stringify(bundle.sources.categories), JSON.stringify(master.categories), 'category tally');
  assert.equal(bundle.sources.updated, master.updated, 'updated stamp');
  for (const s of bundle.sources.sources) {
    const m2 = master.sources.find((x) => x.id === s.id);
    assert.equal(s.url, m2.url, `${s.id}: url must survive the build unchanged`);
    assert.equal(s.category, m2.category, `${s.id}: category must survive the build unchanged`);
    assert.equal(s.verifiedOn, m2.verifiedOn, `${s.id}: verifiedOn must survive the build unchanged`);
  }
});

test('site: irregularities rendered include the session-4 items (#40-#49) and session-5 items (#50-#53)', () => {
  const els = {};
  const mk = (id) => (els[id] = els[id] || { id, innerHTML: '', textContent: '', querySelectorAll: () => [], classList: { toggle() {} } });
  const listeners = {};
  const sandbox = {
    console, location: { hash: '#/irregularities' }, requestAnimationFrame: (f) => f(),
    document: { getElementById: (id) => (['main', 'nav', 'footline'].includes(id) ? mk(id) : null) },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (ev, f) => { listeners[ev] = f; };
  sandbox.scrollTo = () => {};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(ROOT, 'src/data/site-data.js'), 'utf8'), sandbox);
  sandbox.Chart2 = { lines() {} };
  vm.runInContext(readFileSync(join(ROOT, 'src/site/app.js'), 'utf8'), sandbox);
  listeners.hashchange();
  for (let id = 40; id <= 53; id += 1) {
    assert.ok(els.main.innerHTML.includes(`#${id} ·`), `irregularity #${id} not rendered on the site`);
  }
});

test('site: session 9 evidence status and paired comparison are visible without overstating verification', () => {
  const { html: overview } = renderSection('overview');
  assert.match(overview, /Election intelligence, with evidence/);
  assert.match(overview, /Market snapshot/);
  assert.match(overview, /checks provenance structure, not the truth/);
  const { html: cross, bundle } = renderSection('crosslayer');
  assert.match(cross, /Paired Metaculus vs Kalshi evaluation/);
  if (!bundle.crossLayer.scored.pairedComparison.questions) assert.match(cross, /pending certification/);
  for (const row of bundle.crossLayer.renderings.rows) {
    const p = row.renderers['270towin']?.kalshiPanel;
    if (p) assert.ok(cross.includes(`${(p.dem * 100).toFixed(0)}% / ${(p.rep * 100).toFixed(0)}%`), '270toWin uses dem/rep, not obsolete a/b');
  }
  const { html: polls } = renderSection('polls');
  assert.match(polls, /method unclassified/);
  assert.match(polls, /Candidate mismatch: poll Alexander Vindman; market Angie Nixon/);
  const { html: sources } = renderSection('sources');
  assert.match(sources, /Latest session re-tests/);
  assert.match(sources, /session-review|Direct page-fetch observations/);
});
