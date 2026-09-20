#!/usr/bin/env node
/**
 * Metaculus collector (ROADMAP R14) — the third intelligence layer, scored continuously.
 * ==================================================================================
 * Source: https://www.metaculus.com/midterms-2026/ — the hub is SERVER-RENDERED, so the
 * community forecast numbers (House D/R, Senate D/R, Congressional-control quadrants) are in
 * the HTML and can be parsed without an account. The JSON API (api2) answered
 * "Permission Error: The API is only available to authenticated users." on 2026-09-19
 * (irregularity #54), so it is used ONLY when METACULUS_API_TOKEN is set; the HTML path
 * is the default and is what the workflow runs.
 *
 * Output (append-only, every row carries capturedFrom/capturedAt):
 *   data/crosslayer/metaculus-daily.json  { capturedFrom, method, rows: [{date, capturedAt, houseD, houseR, senateD, senateR, control:{DH_DS,DH_RS,RH_RS,RH_DS}, raw:{...} }] }
 *   data/crosslayer/snapshots.json        a new snapshot per question per day, layers.metaculus filled from the hub and
 *                                          layers.kalshi filled from data/kalshi/universe/latest.json when that capture is from the same UTC day
 *
 * Honesty rules: if a number cannot be extracted the row records parse:'failed' with the first 300
 * characters of the page — nothing is reconstructed. Usage:
 *   node scripts/collect-metaculus.mjs            live fetch
 *   node scripts/collect-metaculus.mjs --replay f.html   parse a saved page (offline tests)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HUB_URL = 'https://www.metaculus.com/midterms-2026/';
export const API_URL = 'https://www.metaculus.com/api2/questions/34484/';

function pct(re, text) {
  const m = text.match(re);
  return m ? Number(m[1]) : null;
}

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
  const text = String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;?/g, ' ').replace(/&#x[0-9a-f]+;?/gi, ' ').replace(/&#\d+;?/g, ' ').replace(/&amp;/g, '&').replace(/\*\*/g, '').replace(/(\d)\s+%/g, '$1%').replace(/[ \t]+/g, ' ');
  const N = '(\\d{1,3}(?:\\.\\d)?)\\s*%';
  const chamber = (label) => {
    // heading (markdown "#### House" or bare "House") followed within 400 chars by "Democrats N% Republicans M%"
    const re = new RegExp(`\\b${label}\\b(?:(?!Congressional Control|Dem House|Rep House|####)[\\s\\S]){0,400}?Democrats?\\s*${N}\\s*Republicans?\\s*${N}`, 'i');
    const m = text.match(re);
    return m ? { d: Number(m[1]), r: Number(m[2]) } : null;
  };
  const house = chamber('House');
  const senate = chamber('Senate');
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
  if (out.houseD != null && out.houseR != null && Math.abs(out.houseD + out.houseR - 100) > 0.6) checks.push(`house D+R=${(out.houseD + out.houseR).toFixed(1)}`);
  if (out.senateD != null && out.senateR != null && Math.abs(out.senateD + out.senateR - 100) > 0.6) checks.push(`senate D+R=${(out.senateD + out.senateR).toFixed(1)}`);
  const q = Object.values(out.control).filter((v) => v != null);
  if (q.length === 4 && Math.abs(q.reduce((a, b) => a + b, 0) - 100) > 0.6) checks.push(`quadrants sum=${q.reduce((a, b) => a + b, 0).toFixed(1)}`);
  // Cross-derivation: P(Senate D) should equal DH_DS + RH_DS within rounding.
  if (out.senateD != null && out.control.DH_DS != null && out.control.RH_DS != null) {
    const derived = out.control.DH_DS + out.control.RH_DS;
    if (Math.abs(derived - out.senateD) > 0.6) checks.push(`senateD ${out.senateD} vs quadrant-derived ${derived.toFixed(1)}`);
  }
  out.parse = out.houseD == null || out.senateD == null ? 'failed' : 'ok';
  out.consistencyFlags = checks;
  if (out.parse === 'failed') out.sample = text.replace(/\s+/g, ' ').slice(0, 300);
  return out;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': 'elections-collector (github.com/buffedlizard55-lab/Elections)', ...headers } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}: ${body.slice(0, 200)}`);
  return body;
}

function readJson(p, fallback) { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback; }

export function appendSnapshots(snapFile, parsed, { capturedAt, universe }) {
  const day = capturedAt.slice(0, 10);
  const kalshiFor = (evt, tk) => {
    if (!universe || (universe.capturedAt || '').slice(0, 10) !== day) return undefined; // only same-day Kalshi captures are paired
    const e = (universe.events || []).find((x) => x.event_ticker === evt);
    const m = e && e.markets.find((x) => x.ticker === tk);
    return m ? { ticker: tk, bid: m.yes_bid, ask: m.yes_ask, last: m.last_price, capturedAt: universe.capturedAt, capturedFrom: universe.capturedFrom } : undefined;
  };
  const add = [];
  const defs = [
    ['SENATE-CONTROL-2026', 'CONTROLS-2026', 'CONTROLS-2026-D', parsed.senateD],
    ['HOUSE-CONTROL-2026', 'CONTROLH-2026', 'CONTROLH-2026-D', parsed.houseD],
  ];
  for (const [q, evt, tk, p] of defs) {
    if (p == null) continue;
    const id = `${day}-${q === 'SENATE-CONTROL-2026' ? 'senate' : 'house'}`;
    if (snapFile.snapshots.some((s) => s.id === id)) continue; // one auto row per question per day
    const layers = { metaculus: Number((p / 100).toFixed(4)) };
    const k = kalshiFor(evt, tk);
    if (k) layers.kalshi = k;
    add.push({ id, question: q, electionDate: '2026-11-03', capturedAt, layers, source: HUB_URL, collector: 'scripts/collect-metaculus.mjs' });
  }
  snapFile.snapshots.push(...add);
  return add.length;
}

async function main() {
  const argv = process.argv.slice(2);
  const replayIdx = argv.indexOf('--replay');
  const capturedAt = new Date().toISOString();
  let html;
  let via = HUB_URL;
  if (replayIdx >= 0) {
    html = readFileSync(argv[replayIdx + 1], 'utf8');
    via = `replay:${argv[replayIdx + 1]}`;
  } else {
    try { html = await fetchText(HUB_URL); } catch (e) { html = null; var fetchError = String(e.message).slice(0, 300); }
  }
  // A fetch failure is a row too (parse:'failed' + the error) — the first live run 2026-09-20 wrote nothing because
  // the process died before this point; that left no audit trail, which is the one thing the collector must never do.
  const parsed = html == null ? { parse: 'failed', houseD: null, senateD: null, control: {}, consistencyFlags: [], fetchError } : parseHub(html);
  let api = null;
  if (process.env.METACULUS_API_TOKEN && replayIdx < 0) {
    try {
      const j = JSON.parse(await fetchText(API_URL, { authorization: `Token ${process.env.METACULUS_API_TOKEN}` }));
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
  const row = { date: capturedAt.slice(0, 10), capturedAt, capturedFrom: via, ...parsed, api };
  const existing = daily.rows.findIndex((r) => r.date === row.date && r.capturedFrom === via);
  if (existing >= 0) daily.rows[existing] = row; else daily.rows.push(row);
  daily.capturedAt = capturedAt;
  if (replayIdx < 0) writeFileSync(dailyPath, JSON.stringify(daily, null, 1) + '\n');

  const snapPath = join(ROOT, 'data/crosslayer/snapshots.json');
  const snap = readJson(snapPath, null);
  let added = 0;
  if (snap && parsed.parse === 'ok' && replayIdx < 0) {
    added = appendSnapshots(snap, parsed, { capturedAt, universe: readJson(join(ROOT, 'data/kalshi/universe/latest.json'), null) });
    if (added) { snap.capturedAt = capturedAt; writeFileSync(snapPath, JSON.stringify(snap, null, 1) + '\n'); }
  }
  console.log('[metaculus]', JSON.stringify({ parse: parsed.parse, houseD: parsed.houseD, senateD: parsed.senateD, control: parsed.control, flags: parsed.consistencyFlags, snapshotsAdded: added, api: api && api.ok }));
  if (parsed.parse === 'failed') process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('[metaculus] fatal', e); process.exit(1); });
}
