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
  // Exactly two entries in this batch came in through search-discovered pages; both must say so.
  const viaSearch = SESSION5_IDS.filter((id) => byId[id].status === 'verified-via-search');
  assert.deepEqual(viaSearch.sort(), ['massachusetts-elections', 'oregon-sos']);
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
  const { html } = renderSection('crosslayer');
  assert.match(html, /Cross-layer scoreboard/);
  assert.match(html, /pending canvass/);
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
