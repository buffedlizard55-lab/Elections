#!/usr/bin/env node
/**
 * Metaculus collector (ROADMAP R14) — the third intelligence layer, scored continuously.
 * ==================================================================================
 * Source: https://www.metaculus.com/midterms-2026/ — the hub is SERVER-RENDERED, so the
 * community forecast numbers (House D/R, Senate D/R, Congressional-control quadrants) are in
 * the HTML and can be parsed without an account. The JSON API answered
 * "Permission Error: The API is only available to authenticated users." on 2026-09-19 (api2)
 * and again on 2026-09-20 (the newer /api/posts/ path) — irregularity #54 — so it is used ONLY
 * when METACULUS_API_TOKEN is set; the HTML path is the default and is what the workflow runs.
 *
 * Session 7 additions (2026-09-20):
 *   - The first networked run met a Cloudflare interstitial (HTTP 403 "Just a moment...", #58). The
 *     collector now fetches with the project user-agent, retries with a browser-like profile only
 *     after an interstitial/403, and finally renders the page in headless Chrome when a binary
 *     exists (GitHub's ubuntu runners ship one). Every attempt is recorded in the row (`fetchLog`).
 *   - Per-seat questions: besides the hub it reads the question pages Metaculus renders server-side
 *     (the Senate state group 40598 — only its four leading states are in the HTML, the rest sit
 *     behind a client-side "19 others" control —, the governor group 43448, the Senate-plurality
 *     question 36370, and the single-state questions 41678 AK / 44711 MT / 44710 NE). Every number
 *     found is paired with the same-day Kalshi market (SENATE{ST}-26-D / GOVPARTY{ST}-26-D) in
 *     data/crosslayer/snapshots.json so the seat-by-seat scoreboard is filled by the collector.
 *   - `--record-text <file> --url <page>`: parse text saved from the rendering fetch tool during a
 *     session and record it as a row whose capturedFrom says so (`fetch-tool:` prefix). This keeps
 *     the layer alive with disclosed provenance when the runner is blocked; nothing is typed in.
 *
 * Output (append-only, every row carries capturedFrom/capturedAt):
 *   data/crosslayer/metaculus-daily.json  rows: [{date, capturedAt, capturedFrom, fetchMethod, parse, houseD, houseR, senateD, senateR, control:{...}, questions:{...}}]
 *   data/crosslayer/snapshots.json        one snapshot per question per day (chamber control + per-seat), Kalshi paired only from the same UTC day
 *   data/crosslayer/raw/*.html            raw bodies for parser development (git-ignored; uploaded as a workflow artifact)
 *
 * Honesty rules: if a number cannot be extracted the row records parse:'failed' with the first 300
 * characters of the page — nothing is reconstructed. Usage:
 *   node scripts/collect-metaculus.mjs                       live fetch (hub + question pages)
 *   node scripts/collect-metaculus.mjs --replay f.html       parse a saved hub page (offline tests; writes nothing)
 *   node scripts/collect-metaculus.mjs --record-text f.txt --url https://www.metaculus.com/midterms-2026/
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithProfiles, renderDom, findChrome, htmlToText } from './lib/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HUB_URL = 'https://www.metaculus.com/midterms-2026/';
export const API_URL = 'https://www.metaculus.com/api2/questions/34484/';

/**
 * Question pages read besides the hub. `kind` tells the parser what to look for; `kalshi` maps the
 * Metaculus number to this project's captured market. All pages were fetched on 2026-09-20 through
 * the rendering fetch tool and their server-rendered numbers noted in VERIFICATION.md §12.
 */
export const QUESTION_PAGES = [
  { id: 'senate-states-group', url: 'https://www.metaculus.com/questions/40598/', kind: 'state-group', office: 'senate', note: 'Will the Democratic candidate win the 2026 US Senate election in the following states? — the HTML lists the four leading states; the other 19 are behind a client-side control (recorded, not estimated).' },
  { id: 'governor-states-group', url: 'https://www.metaculus.com/questions/43448/', kind: 'state-group', office: 'governor', note: 'Democrat wins 2026 gubernatorial election in these states? — same rendering limit (four states + "13 others").' },
  { id: 'senate-plurality', url: 'https://www.metaculus.com/questions/36370/', kind: 'party-choice', office: 'senate-plurality', note: 'US Senate plurality after 2026 midterms? (Democrats / Republicans / Other) — a different question from control: no tie-break, so it is stored beside the hub number, not merged with it.' },
  { id: 'ak-peltola', url: 'https://www.metaculus.com/questions/41678/', kind: 'binary', office: 'senate', state: 'AK', note: 'Mary Peltola wins Alaska senate seat 2026? — a candidate question; paired with SENATEAK-26-D (party market) with that caveat recorded.' },
  { id: 'mt-party', url: 'https://www.metaculus.com/questions/44711/', kind: 'party-choice', office: 'senate', state: 'MT', note: 'Which party will win the 2026 Montana Senate election? (Democrat / Republican / Other).' },
  { id: 'ne-party', url: 'https://www.metaculus.com/questions/44710/', kind: 'party-choice', office: 'senate', state: 'NE', note: 'Which party will win the 2026 Nebraska Senate election? (Democrat / Republican / Other — Kalshi lists the independent Osborn as SENATENE-26-DOSB).' },
];

export const STATE_CODES = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY',
  Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO',
  Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};

function pct(re, text) {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

const cleanText = (html) => htmlToText(String(html).replace(/\*\*/g, ''));

/**
 * Parse the hub HTML/text. Written against the text the fetch tool returned on 2026-09-19 (verbatim in
 * test/fixtures/metaculus-hub-2026-09-19.txt):
 *   "#### House … Democrats88.8%Republicans11.2%", "#### Senate … Democrats51.7%Republicans48.3%",
 *   "Dem House / Dem Senate50.7%Dem House / Rep Senate38.1%Rep House / Rep Senate10.2%Rep House / Dem Senate1.0%",
 *   "Median: D +13 seats", "Median: Even split", "18 of 35 races lean Democrat·3 too close to call".
 * Tags are stripped first so the same regexes work on raw HTML and on extracted text. The chamber
 * numbers are taken from the first "Democrats N%Republicans M%" pair AFTER the chamber heading and
 * BEFORE the next heading, so a quadrant line can never be mistaken for a chamber line.
 */
export function parseHub(html) {
  const text = cleanText(html);
  const N = '(\\d{1,3}(?:\\.\\d)?)\\s*%';
  // Every "Democrats N% Republicans M%" pair is assigned to the NEAREST preceding chamber word. The first live
  // headless-Chrome render (2026-09-20, run 35484999487) showed why a "Senate … within 400 chars" search is not
  // enough: the rendered page mentions "Senate" in its navigation before the House card, so both chambers read
  // 88.8 (irregularity #63). The first pair per chamber in document order wins.
  const pairRe = new RegExp(`Democrats?\\s*${N}\\s*Republicans?\\s*${N}`, 'gi');
  const found = { house: null, senate: null };
  for (let m = pairRe.exec(text); m; m = pairRe.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 400), m.index).toLowerCase();
    const iH = before.lastIndexOf('house'); const iS = before.lastIndexOf('senate');
    if (iH < 0 && iS < 0) continue;
    const which = iH > iS ? 'house' : 'senate';
    if (!found[which]) found[which] = { d: Number(m[1]), r: Number(m[2]) };
    if (found.house && found.senate) break;
  }
  const house = found.house;
  const senate = found.senate;
  const quad = (a, b) => pct(new RegExp(`${a}\\s+House\\s*/\\s*${b}\\s+Senate\\s*${N}`, 'i'), text);
  const DEM = '(?:Dem|Democratic)'; const REP = '(?:Rep|Republican)';
  const out = {
    houseD: house ? house.d : null,
    houseR: house ? house.r : null,
    senateD: senate ? senate.d : null,
    senateR: senate ? senate.r : null,
    control: {
      DH_DS: quad(DEM, DEM),
      DH_RS: quad(DEM, REP),
      RH_RS: quad(REP, REP),
      RH_DS: quad(REP, DEM),
    },
    seatMedians: {
      // "HOUSE Median: D +13 seats" / "SENATE Median: Even split" — the chamber word precedes each Median line.
      house: (text.match(/HOUSE[\s\S]{0,40}?Median:\s*([DR]\s?\+\s?\d+|Even split|even)/i) || [])[1] || null,
      senate: (text.match(/SENATE[\s\S]{0,40}?Median:\s*([DR]\s?\+\s?\d+|Even split|even)/i) || [])[1] || null,
    },
    racesLine: (text.match(/(\d+\s*of\s*\d+\s*races lean\s*\w+[^.\n]{0,60}?too close to call)/i) || [])[1] || null,
    keyDriverDataDate: (text.match(/Data from\s*(?:on\s*)?([A-Z][a-z]{2} \d{1,2}, 20\d\d)/) || [])[1] || null,
  };
  // Consistency checks (recorded, never "fixed"): D+R should be ~100 and quadrants should sum to ~100.
  const checks = [];
  const inconsistent = { house: false, senate: false };
  if (out.houseD != null && out.houseR != null && Math.abs(out.houseD + out.houseR - 100) > 0.6) { checks.push(`house D+R=${(out.houseD + out.houseR).toFixed(1)}`); inconsistent.house = true; }
  if (out.senateD != null && out.senateR != null && Math.abs(out.senateD + out.senateR - 100) > 0.6) { checks.push(`senate D+R=${(out.senateD + out.senateR).toFixed(1)}`); inconsistent.senate = true; }
  const q = Object.values(out.control).filter((v) => v != null);
  if (q.length === 4 && Math.abs(q.reduce((a, b) => a + b, 0) - 100) > 0.6) checks.push(`quadrants sum=${q.reduce((a, b) => a + b, 0).toFixed(1)}`);
  // Cross-derivation against the page's own control quadrants: P(Senate D) = DH_DS + RH_DS, P(House D) = DH_DS + DH_RS.
  // A chamber whose headline disagrees with its quadrant sum is marked inconsistent and is NOT written to the
  // scoreboard (appendSnapshots skips it) — the row keeps both numbers for review instead of choosing one.
  if (out.senateD != null && out.control.DH_DS != null && out.control.RH_DS != null) {
    const derived = out.control.DH_DS + out.control.RH_DS;
    if (Math.abs(derived - out.senateD) > 0.6) { checks.push(`senateD ${out.senateD} vs quadrant-derived ${derived.toFixed(1)}`); inconsistent.senate = true; }
  }
  if (out.houseD != null && out.control.DH_DS != null && out.control.DH_RS != null) {
    const derived = out.control.DH_DS + out.control.DH_RS;
    if (Math.abs(derived - out.houseD) > 0.6) { checks.push(`houseD ${out.houseD} vs quadrant-derived ${derived.toFixed(1)}`); inconsistent.house = true; }
  }
  out.inconsistent = inconsistent;
  out.parse = out.houseD == null || out.senateD == null ? 'failed' : (inconsistent.house || inconsistent.senate ? 'inconsistent' : 'ok');
  out.consistencyFlags = checks;
  if (out.parse === 'failed') out.sample = text.replace(/\s+/g, ' ').slice(0, 300);
  return out;
}

/**
 * Parse a question page. Three shapes, all as Metaculus renders them server-side (observed 2026-09-20
 * through the rendering fetch tool, transcribed in test/fixtures/metaculus-q40598-2026-09-20.txt):
 *   state-group   "Rhode Island 99% Oregon 99% Colorado 98% Minnesota 92% 19 others"   -> states: {RI: 99, ...}, othersHidden: 19
 *   party-choice  "Democrat 1% Republican 94% Other 5%" / "Democrats 50.6% Republicans 49.3% Other 0.1%" -> D/R/other
 *   binary        "54% chance"                                                        -> p
 * Only the question's own block is read: the text is cut at "Forecast Timeline" (the first
 * related-question card comes after it), so numbers from other questions' cards are never picked up.
 */
export function parseQuestionPage(html, kind) {
  const full = cleanText(html);
  const title = (full.match(/#\s*([^#]{10,200}?\?)\s/) || full.match(/(Will [^?]{10,200}\?)/) || full.match(/(Which party [^?]{10,200}\?)/) || full.match(/((?:Democrat|Mary Peltola|US Senate|GOP Senate)[^?]{5,160}\?)/) || [])[1] || null;
  const cut = full.search(/Forecast Timeline|Top Key Factors|Question Info|Notify me of updates/i);
  const block = cut > 0 ? full.slice(0, cut) : full.slice(0, 4000);
  const out = { kind, title, parse: 'failed' };
  if (kind === 'state-group') {
    const states = {};
    const names = Object.keys(STATE_CODES).sort((a, b) => b.length - a.length).map((s) => s.replace(/ /g, '\\s+')).join('|');
    for (const m of block.matchAll(new RegExp(`\\b(${names})\\s+(\\d{1,3}(?:\\.\\d)?)%`, 'g'))) {
      const code = STATE_CODES[m[1].replace(/\s+/g, ' ')];
      if (code && states[code] == null) states[code] = Number(m[2]);
    }
    out.states = states;
    out.othersHidden = (block.match(/(\d+)\s+others?\b/) || [])[1] ? Number((block.match(/(\d+)\s+others?\b/) || [])[1]) : 0;
    out.forecasters = (block.match(/(\d+)\s+forecasters/) || [])[1] ? Number((block.match(/(\d+)\s+forecasters/) || [])[1]) : null;
    out.parse = Object.keys(states).length ? 'ok' : 'failed';
  } else if (kind === 'party-choice') {
    const d = pct(/\bDemocrats?\s+(\d{1,3}(?:\.\d)?)%/, block);
    const r = pct(/\bRepublicans?\s+(\d{1,3}(?:\.\d)?)%/, block);
    const o = pct(/\bOther\s+(\d{1,3}(?:\.\d)?)%/, block);
    out.D = d; out.R = r; out.other = o;
    out.forecasters = (block.match(/(\d+)\s+forecasters/) || [])[1] ? Number((block.match(/(\d+)\s+forecasters/) || [])[1]) : null;
    if (d != null && r != null && o != null && Math.abs(d + r + o - 100) > 0.6) out.consistencyFlag = `D+R+Other=${(d + r + o).toFixed(1)}`;
    out.parse = d != null && r != null ? 'ok' : 'failed';
  } else if (kind === 'binary') {
    const p = pct(/(\d{1,3}(?:\.\d)?)%\s*chance/, block);
    out.p = p;
    out.forecasters = (block.match(/(\d+)\s+forecasters/) || [])[1] ? Number((block.match(/(\d+)\s+forecasters/) || [])[1]) : null;
    out.parse = p != null ? 'ok' : 'failed';
  }
  if (out.parse === 'failed') out.sample = block.slice(0, 300);
  return out;
}

async function fetchPage(url, { raw = null, allowRender = true, renderRetries = 1 } = {}) {
  const f = await fetchWithProfiles(url);
  const log = { attempts: f.attempts };
  if (f.ok) {
    if (raw) writeFileSync(join(raw, `${url.replace(/[^a-z0-9]+/gi, '_')}.fetch.html`), f.body);
    return { html: f.body, method: `fetch:${f.profile}`, log };
  }
  if (allowRender && findChrome()) {
    // One retry per page on the first pass (7 pages must fit the workflow step budget); the profile persists across pages.
    const r = renderDom(url, { retries: renderRetries });
    log.render = r.ok ? { ok: true, bin: r.bin, challenge: r.challenge || null, bytes: r.html.length, attempts: r.attempts } : { ok: false, reason: r.reason, attempts: r.attempts || null };
    if (r.ok && !r.challenge) {
      if (raw) writeFileSync(join(raw, `${url.replace(/[^a-z0-9]+/gi, '_')}.rendered.html`), r.html);
      return { html: r.html, method: 'headless-chrome', log };
    }
  }
  const last = f.attempts[f.attempts.length - 1] || {};
  return { html: null, method: null, log, error: `${url} -> HTTP ${last.status ?? f.status}${last.challenge ? ` (${last.challenge})` : ''}${last.error ? ` ${last.error}` : ''}: ${String(f.body || '').slice(0, 200)}` };
}

function readJson(p, fallback) { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback; }

export const STATE_NAMES = Object.fromEntries(Object.entries(STATE_CODES).map(([name, code]) => [code, name]));

/**
 * Kalshi market from a same-day universe capture, or undefined (a stale capture is never paired).
 * When a state is given, the event's own title must name that state: Kalshi's Kentucky Senate event is
 * tickered SENATELA-26 ("Kentucky Senate winner?", Barr/Booker — irregularity #59), so a ticker built from
 * a state code can point at the wrong state. A title that names another state returns { mismatch } and
 * the caller records the skipped pairing instead of inventing a leg.
 */
function kalshiLookup(universe, day) {
  return (evt, tk, stateName) => {
    if (!universe || (universe.capturedAt || '').slice(0, 10) !== day) return undefined;
    const e = (universe.events || []).find((x) => x.event_ticker === evt);
    if (!e) return undefined;
    if (stateName && e.title && !new RegExp(stateName.replace(/\s+/g, '\\s+'), 'i').test(e.title)) {
      return { mismatch: `event ${evt} is titled "${e.title}", which does not name ${stateName} (irregularity #59) — not paired` };
    }
    const m = e.markets.find((x) => x.ticker === tk);
    return m ? { ticker: tk, bid: m.yes_bid, ask: m.yes_ask, last: m.last_price, capturedAt: universe.capturedAt, capturedFrom: universe.capturedFrom } : undefined;
  };
}

export function appendSnapshots(snapFile, parsed, { capturedAt, universe, source = HUB_URL }) {
  const day = capturedAt.slice(0, 10);
  const kalshiFor = kalshiLookup(universe, day);
  const add = [];
  const bad = parsed.inconsistent || {};
  const defs = [
    ['SENATE-CONTROL-2026', 'CONTROLS-2026', 'CONTROLS-2026-D', bad.senate ? null : parsed.senateD],
    ['HOUSE-CONTROL-2026', 'CONTROLH-2026', 'CONTROLH-2026-D', bad.house ? null : parsed.houseD],
  ];
  for (const [q, evt, tk, p] of defs) {
    if (p == null) continue;
    const id = `${day}-${q === 'SENATE-CONTROL-2026' ? 'senate' : 'house'}`;
    if (snapFile.snapshots.some((s) => s.id === id)) continue; // one auto row per question per day
    const layers = { metaculus: Number((p / 100).toFixed(4)) };
    const k = kalshiFor(evt, tk);
    if (k) layers.kalshi = k;
    add.push({ id, question: q, electionDate: '2026-11-03', capturedAt, layers, source, collector: 'scripts/collect-metaculus.mjs' });
  }
  snapFile.snapshots.push(...add);
  return add.length;
}

/**
 * Per-seat snapshots from the question pages: one row per (state, office, day). The Kalshi leg is the
 * same-day SENATE{ST}-26-D (Ohio's special is SENATEOHS-26, Florida's SENATEFLS-26) or GOVPARTY{ST}-26-D.
 * Questions are registered in snapFile.questions the first time they appear so the scorer can be fed an
 * official outcome per seat after Nov 3.
 */
// Ohio's and Florida's 2026 specials carry an S suffix; Kentucky's event is tickered SENATELA-26 on the exchange
// (title "Kentucky Senate winner?", markets Andy Barr / Charles Booker in the 2026-09-20 capture — irregularity #59).
// The alias is only ever used together with the title check in kalshiLookup, so a Louisiana question can never
// be paired to it and the Kentucky pairing is confirmed by the event's own title.
export const SENATE_EVENT = (st) => (st === 'OH' ? 'SENATEOHS-26' : st === 'FL' ? 'SENATEFLS-26' : st === 'KY' ? 'SENATELA-26' : `SENATE${st}-26`);
export function appendSeatSnapshots(snapFile, questions, { capturedAt, universe }) {
  const day = capturedAt.slice(0, 10);
  const kalshiFor = kalshiLookup(universe, day);
  let added = 0;
  snapFile.questions = snapFile.questions || {};
  const put = (office, st, p, src, extra = {}) => {
    if (p == null) return;
    const qid = office === 'senate' ? `SENATE-${st}-2026` : `GOVERNOR-${st}-2026`;
    const evt = office === 'senate' ? SENATE_EVENT(st) : `GOVPARTY${st}-26`;
    if (!snapFile.questions[qid]) {
      snapFile.questions[qid] = { text: office === 'senate' ? `Democratic candidate wins the 2026 U.S. Senate election in ${st}` : `Democratic candidate wins the 2026 gubernatorial election in ${st}`, electionDate: '2026-11-03', kalshiEvent: evt, metaculusQuestion: src, seat: true, ...extra };
    }
    const id = `${day}-${qid.toLowerCase()}`;
    if (snapFile.snapshots.some((s) => s.id === id)) return;
    const layers = { metaculus: Number((p / 100).toFixed(4)) };
    const k = kalshiFor(evt, `${evt}-D`, STATE_NAMES[st]);
    const row = { id, question: qid, electionDate: '2026-11-03', capturedAt, layers, source: src, collector: 'scripts/collect-metaculus.mjs', ...(extra.caveat ? { caveat: extra.caveat } : {}) };
    if (k && k.mismatch) row.kalshiSkipped = k.mismatch;
    else if (k) layers.kalshi = k;
    snapFile.snapshots.push(row);
    added += 1;
  };
  for (const q of questions) {
    if (!q || q.parse !== 'ok') continue;
    if (q.kind === 'state-group' && q.states) for (const [st, p] of Object.entries(q.states)) put(q.office, st, p, q.capturedFrom, { note: q.note });
    if (q.kind === 'party-choice' && q.state) put(q.office, q.state, q.D, q.capturedFrom, { note: q.note });
    if (q.kind === 'binary' && q.state) put(q.office, q.state, q.p, q.capturedFrom, { note: q.note, caveat: 'candidate question (Peltola) paired with a party market (SENATEAK-26-D)' });
  }
  return added;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const replayFile = arg('--replay');
  const recordText = arg('--record-text');
  const recordUrl = arg('--url') || HUB_URL;
  const capturedAt = new Date().toISOString();
  const rawDir = join(ROOT, 'data/crosslayer/raw');
  mkdirSync(rawDir, { recursive: true });

  let html = null; let via = HUB_URL; let fetchMethod = null; let fetchLog = null; let fetchError = null;
  const questions = [];
  if (replayFile) {
    html = readFileSync(replayFile, 'utf8'); via = `replay:${replayFile}`; fetchMethod = 'replay';
  } else if (recordText) {
    // Text saved from the rendering fetch tool during a session — provenance says so on the row.
    html = readFileSync(recordText, 'utf8'); via = `fetch-tool:${recordUrl}`; fetchMethod = 'rendering-fetch-tool (manual session capture)';
  } else {
    const r = await fetchPage(HUB_URL, { raw: rawDir });
    html = r.html; fetchMethod = r.method; fetchLog = r.log; fetchError = r.error || null;
    for (const q of QUESTION_PAGES) {
      const rq = await fetchPage(q.url, { raw: rawDir });
      const parsed = rq.html ? parseQuestionPage(rq.html, q.kind) : { kind: q.kind, parse: 'failed', fetchError: rq.error };
      questions.push({ id: q.id, office: q.office, state: q.state || null, note: q.note, capturedFrom: q.url, fetchMethod: rq.method, ...parsed });
      await new Promise((res) => setTimeout(res, 500));
    }
    // Second pass: the headless profile keeps cookies for the whole run, so a bot check solved on a later page
    // often clears the earlier ones (first live run 2026-09-20: 3 of 7 pages rendered, the hub did not).
    if (findChrome() && questions.some((q) => q.fetchMethod === 'headless-chrome')) {
      if (html == null) {
        const r2 = await fetchPage(HUB_URL, { raw: rawDir, renderRetries: 0 });
        if (r2.html) { html = r2.html; fetchMethod = `${r2.method} (second pass)`; fetchLog = { ...fetchLog, secondPass: r2.log }; fetchError = null; }
      }
      for (let i = 0; i < questions.length; i += 1) {
        if (questions[i].parse !== 'failed' || !questions[i].fetchError) continue;
        const q = QUESTION_PAGES[i];
        const rq = await fetchPage(q.url, { raw: rawDir, renderRetries: 0 });
        if (!rq.html) continue;
        questions[i] = { id: q.id, office: q.office, state: q.state || null, note: q.note, capturedFrom: q.url, fetchMethod: `${rq.method} (second pass)`, ...parseQuestionPage(rq.html, q.kind) };
      }
    }
  }
  // A fetch failure is a row too (parse:'failed' + the error) — the first live run 2026-09-20 wrote nothing because
  // the process died before this point; that left no audit trail, which is the one thing the collector must never do.
  const parsed = html == null ? { parse: 'failed', houseD: null, senateD: null, control: {}, consistencyFlags: [], fetchError } : parseHub(html);
  let api = null;
  if (process.env.METACULUS_API_TOKEN && !replayFile && !recordText) {
    try {
      const res = await fetch(API_URL, { headers: { authorization: `Token ${process.env.METACULUS_API_TOKEN}`, 'user-agent': 'elections-collector (github.com/buffedlizard55-lab/Elections)' } });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 120)}`);
      const j = JSON.parse(body);
      api = { ok: true, id: j.id, title: j.title, keys: Object.keys(j).slice(0, 30) };
    } catch (e) { api = { ok: false, error: String(e.message).slice(0, 200) }; }
  }
  mkdirSync(join(ROOT, 'data/crosslayer'), { recursive: true });
  const dailyPath = join(ROOT, 'data/crosslayer/metaculus-daily.json');
  const daily = readJson(dailyPath, {
    title: 'Metaculus midterms-2026 hub — daily community forecast capture',
    capturedFrom: HUB_URL,
    method: 'Server-rendered hub parsed by scripts/collect-metaculus.mjs (parseHub). Numbers are community forecasts published by Metaculus, transcribed as-is; consistencyFlags records any D+R or quadrant-sum mismatch instead of correcting it. api2 requires authentication (#54) and is only queried when METACULUS_API_TOKEN is set.',
    rows: [],
  });
  daily.method = 'Server-rendered hub parsed by scripts/collect-metaculus.mjs (parseHub) plus the server-rendered question pages listed in QUESTION_PAGES (parseQuestionPage). Numbers are community forecasts published by Metaculus, transcribed as-is; consistencyFlags records any D+R or quadrant-sum mismatch instead of correcting it. fetchMethod says whether the row came from a plain fetch (and which header profile), a headless-Chrome render, or text saved from the rendering fetch tool during a session. The JSON API requires authentication (#54) and is only queried when METACULUS_API_TOKEN is set.';
  const row = { date: capturedAt.slice(0, 10), capturedAt, capturedFrom: via, fetchMethod, ...parsed, questions, api, fetchLog };
  // One row per RUN (not per day): the 03:16 run on 2026-09-20 replaced the 02:54 row and with it the only successful
  // reads of the Montana/Nebraska questions (#63). Rows are never overwritten; the file is capped at the last 730 runs.
  const existing = daily.rows.findIndex((r) => r.capturedAt === capturedAt && r.capturedFrom === via);
  if (existing >= 0) daily.rows[existing] = row; else daily.rows.push(row);
  if (daily.rows.length > 730) daily.rows = daily.rows.slice(-730);
  daily.capturedAt = capturedAt;
  if (!replayFile) writeFileSync(dailyPath, JSON.stringify(daily, null, 1) + '\n');

  const snapPath = join(ROOT, 'data/crosslayer/snapshots.json');
  const snap = readJson(snapPath, null);
  let added = 0; let seats = 0;
  if (snap && !replayFile) {
    const universe = readJson(join(ROOT, 'data/kalshi/universe/latest.json'), null);
    if (parsed.parse === 'ok' || parsed.parse === 'inconsistent') added = appendSnapshots(snap, parsed, { capturedAt, universe, source: via });
    seats = appendSeatSnapshots(snap, questions, { capturedAt, universe });
    if (added || seats) { snap.capturedAt = capturedAt; writeFileSync(snapPath, JSON.stringify(snap, null, 1) + '\n'); }
  }
  console.log('[metaculus]', JSON.stringify({ parse: parsed.parse, fetchMethod, houseD: parsed.houseD, senateD: parsed.senateD, control: parsed.control, flags: parsed.consistencyFlags, questionsOk: questions.filter((q) => q.parse === 'ok').length, questionsTotal: questions.length, snapshotsAdded: added, seatSnapshotsAdded: seats, api: api && api.ok, error: fetchError }));
  if (parsed.parse === 'failed') process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('[metaculus] fatal', e); process.exit(1); });
}
