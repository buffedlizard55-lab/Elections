#!/usr/bin/env node
/**
 * State Navigate collector (ROADMAP R14) — the state-legislative layer Kalshi does not price.
 * ========================================================================================
 * What was verified on 2026-09-19 (VERIFICATION.md §11c):
 *   - data.statenavigate.com (the API documentation host named in the task) returned HTTP 500 at
 *     / and /index.html and GitHub-Pages 404 at /api/ and /docs/  -> no endpoint could be read,
 *     so NONE is invented here (irregularity #55). Re-test each run: the probe result is recorded.
 *   - projects.statenavigate.com/downloads/data.html  -> login wall, "Required Tier: Tier 3" (paid)
 *     -> not a free source; not used.
 *   - FREE and fetchable: the national forecast page and per-state forecast pages, e.g.
 *       https://projects.statenavigate.com/25-26/national/
 *       https://projects.statenavigate.com/25-26/states/va/forecast-lower.html
 *     which carry the headline numbers ("2,306 seats forecasted", "124 D pickups", "11 R pickups",
 *     "27 chambers", "143 close seats within 5 pts", "135 projected flips") and per-chamber
 *     "Democrats favored to win 60 seats (+9)" lines.
 *
 * Output: data/statenavigate/forecast-daily.json (append-only rows, capturedFrom/capturedAt each),
 * plus data/statenavigate/api-probe.json (what data.statenavigate.com answered, every run).
 * Anything that fails to parse is recorded as parse:'failed' with a text sample — never filled in.
 * KNOWN LIMIT (first live run 2026-09-20): the pages are client-rendered, so the raw-HTML fetch here sees only
 * the shell and every row parses 'failed'. Session 7 therefore renders each page in headless Chrome when a binary
 * exists (GitHub's ubuntu runners ship one; scripts/lib/render.mjs) and falls back to the plain fetch otherwise.
 * Each chamber row records fetchMethod ('fetch' | 'headless-chrome') so a reader can tell which path produced it.
 * The API-doc host is rendered too: if its client-side documentation ever describes endpoints, the text sample is
 * stored for a human to read (reachableDocs=true) — no endpoint is called until a session has verified it.
 * Raw bodies go to data/statenavigate/raw/ (git-ignored, uploaded as a workflow artifact) for parser development.
 *
 * Usage: node scripts/collect-statenavigate.mjs [--replay national.html] [--states va,wi,...] [--no-render]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithProfiles, renderDom, findChrome, htmlToText } from './lib/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const NATIONAL_URL = 'https://projects.statenavigate.com/25-26/national/';
export const API_DOC_HOST = 'https://data.statenavigate.com/';
export const LAUNCHED_STATES = ['ak', 'wi', 'mn', 'mi', 'ny', 'ia', 'pa', 'nj', 'ut', 'co', 'wv', 'va', 'nc', 'sc', 'ga', 'tx', 'fl']; // listed on the national page 2026-09-19
export const stateUrl = (st, chamber) => `https://projects.statenavigate.com/25-26/states/${st}/forecast-${chamber}.html`;

// First live run 2026-09-20: the forecast pages are client-rendered — the raw HTML holds only the shell
// ("2026 National Statehouse Forecast | State Navigate … Sign in …") and the numbers seen through a rendering
// fetcher are absent. Before stripping, any inline JSON (__NEXT_DATA__ / application/json) is kept as text so
// that server-embedded state, if present, can be matched; otherwise the row records parse:'failed' honestly.
const keepJson = (html) => String(html).replace(/<script[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>([\s\S]*?)<\/script>/gi, ' $1 ').replace(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi, ' $1 ');
const strip = (html) => keepJson(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;?/g, ' ').replace(/&#x[0-9a-f]+;?/gi, ' ').replace(/&#\d+;?/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/(\d)\s+%/g, '$1%').replace(/\s+/g, ' ');
const int = (re, t) => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, '')) : null; };

/** National page: headline counts. Regexes match the phrases observed on 2026-09-19. */
export function parseNational(html) {
  const t = strip(html);
  const out = {
    seatsForecasted: int(/([\d,]+)\s+seats forecasted/i, t),
    dPickups: int(/([\d,]+)\s+D pickups/i, t),
    rPickups: int(/([\d,]+)\s+R pickups/i, t),
    statesWithModel: int(/(\d+)\s+states with current 2026 model/i, t),
    chambers: int(/(\d+)\s+chambers/i, t),
    closeSeats: int(/(\d+)\s+close seats/i, t),
    projectedFlips: int(/(\d+)\s+projected flips/i, t),
  };
  out.parse = out.seatsForecasted == null ? 'failed' : 'ok';
  if (out.parse === 'failed') out.sample = t.slice(0, 300);
  return out;
}

/** Per-chamber page: "Democrats favored to win 60 seats (+9)" / "Republicans ... 40 (−9)" and majority odds. */
export function parseChamber(html) {
  const t = strip(html);
  const seat = (party) => {
    const m = t.match(new RegExp(`${party}s?[^.]{0,40}?favored to win\\s+(\\d+)\\s+seats?\\s*\\(([+\\-−–]?\\d+)\\)`, 'i'))
      || t.match(new RegExp(`${party}s?\\s+(\\d+)\\s*\\(([+\\-−–]?\\d+)\\)`, 'i'));
    return m ? { seats: Number(m[1]), change: Number(m[2].replace(/[−–]/, '-')) } : null;
  };
  const p = (re) => { const m = t.match(re); return m ? (m[1] === '<1' ? 0.5 : Number(m[1])) : null; };
  const out = {
    title: (t.match(/(\d{4} [A-Z][a-z]+(?: [A-Z][a-z]+)? State Legislative Forecast)/) || [])[1] || null,
    D: seat('Democrat'),
    R: seat('Republican'),
    odds: {
      dMajority: p(/D(?:emocratic)? majority[^\d<]{0,20}(<1|\d{1,3})%/i),
      rMajority: p(/R(?:epublican)? majority[^\d<]{0,20}(<1|\d{1,3})%/i),
      tie: p(/tie[^\d<]{0,20}(<1|\d{1,3})%/i),
    },
  };
  out.parse = out.D || out.R ? 'ok' : 'failed';
  if (out.parse === 'failed') out.sample = t.slice(0, 300);
  return out;
}

const RAW_DIR = join(ROOT, 'data/statenavigate/raw');
const rawName = (url, kind) => join(RAW_DIR, `${url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_')}.${kind}.html`);
/**
 * Plain fetch (project UA, browser profile only after a 403/503/interstitial). When the body is only the
 * client-rendered shell — no "seats forecasted" / "favored to win" text — and Chrome is available, render it.
 * Returns { status, ok, body, fetchMethod, attempts } and keeps raw copies for parser work.
 */
async function get(url, { render = true } = {}) {
  const f = await fetchWithProfiles(url);
  let out = { status: f.status, ok: f.ok, body: f.body || '', fetchMethod: f.ok ? `fetch:${f.profile}` : 'fetch', attempts: f.attempts };
  if (f.body) { mkdirSync(RAW_DIR, { recursive: true }); writeFileSync(rawName(url, 'fetch'), f.body); }
  const shellOnly = !/seats forecasted|favored to win|projected flips|close seats/i.test(htmlToText(f.body || ''));
  if (render && shellOnly && findChrome()) {
    const r = renderDom(url);
    if (r.ok && !r.challenge) {
      writeFileSync(rawName(url, 'rendered'), r.html);
      out = { status: f.status || 200, ok: true, body: r.html, fetchMethod: 'headless-chrome', attempts: f.attempts, renderBytes: r.html.length };
    } else {
      out.render = { ok: false, reason: r.reason || r.challenge };
    }
  }
  return out;
}
const readJson = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fb);

async function main() {
  const argv = process.argv.slice(2);
  const replayIdx = argv.indexOf('--replay');
  const statesIdx = argv.indexOf('--states');
  const states = statesIdx >= 0 ? argv[statesIdx + 1].split(',') : LAUNCHED_STATES;
  const render = !argv.includes('--no-render');
  const capturedAt = new Date().toISOString();
  const outDir = join(ROOT, 'data/statenavigate');
  mkdirSync(outDir, { recursive: true });

  if (replayIdx >= 0) {
    const parsed = parseNational(readFileSync(argv[replayIdx + 1], 'utf8'));
    console.log('[statenavigate] replay', JSON.stringify(parsed));
    if (parsed.parse === 'failed') process.exitCode = 2;
    return;
  }

  // 1. API-doc host probe — recorded, not relied on (irregularity #55 re-test).
  const probe = { capturedAt, capturedFrom: API_DOC_HOST, chrome: render ? findChrome() : null, results: [] };
  for (const path of ['', 'index.html', 'api/', 'docs/']) {
    try {
      const r = await get(API_DOC_HOST + path, { render: false });
      probe.results.push({ path: '/' + path, status: r.status, sample: strip(r.body).slice(0, 160) });
    } catch (e) { probe.results.push({ path: '/' + path, error: String(e.message).slice(0, 160) }); }
  }
  // 2026-09-20: the host answers 200 but the body is an empty client-rendered shell ("Document") — still no
  // readable documentation. Session 7: render the root in headless Chrome and keep a longer sample of whatever the
  // client draws, so a human can read the documentation if it appears. reachableDocs stays false unless the text
  // actually describes endpoints; even then nothing is called automatically.
  if (render && findChrome()) {
    const r = renderDom(API_DOC_HOST);
    probe.rendered = r.ok ? { ok: true, bytes: r.html.length, sample: htmlToText(r.html).slice(0, 1200) } : { ok: false, reason: r.reason };
    if (r.ok) { mkdirSync(RAW_DIR, { recursive: true }); writeFileSync(rawName(API_DOC_HOST, 'rendered'), r.html); }
  }
  const docText = [...probe.results.map((r) => r.sample || ''), probe.rendered && probe.rendered.sample || ''].join(' ');
  probe.reachableDocs = /endpoint|\/api\/v\d|GET \/|openapi|swagger/i.test(docText);
  writeFileSync(join(outDir, 'api-probe.json'), JSON.stringify(probe, null, 1) + '\n');

  // 2. Free forecast pages.
  const daily = readJson(join(outDir, 'forecast-daily.json'), {
    title: 'State Navigate 2025-26 state-legislative forecast — daily capture of the free forecast pages',
    capturedFrom: NATIONAL_URL,
    method: 'Headline numbers parsed from the free national and per-state forecast pages (parseNational / parseChamber in scripts/collect-statenavigate.mjs). These are State Navigate\'s model outputs, transcribed as published; the project does not re-model them. The documented API host (data.statenavigate.com) and the Tier-3 data downloads are NOT used (see api-probe.json and irregularity #55). Chamber-page titles still read "2025 … Forecast" on some states — recorded as observed.',
    rows: [],
  });
  const row = { date: capturedAt.slice(0, 10), capturedAt, renderer: render ? (findChrome() || 'none (plain fetch only)') : 'disabled (--no-render)', national: null, chambers: {}, errors: [] };
  try {
    const r = await get(NATIONAL_URL, { render });
    row.national = r.ok ? { capturedFrom: NATIONAL_URL, fetchMethod: r.fetchMethod, ...parseNational(r.body) } : { capturedFrom: NATIONAL_URL, fetchMethod: r.fetchMethod, parse: 'failed', status: r.status };
  } catch (e) { row.errors.push(`national: ${e.message}`); }
  for (const st of states) {
    for (const ch of ['lower', 'upper']) {
      const url = stateUrl(st, ch);
      try {
        const r = await get(url, { render });
        if (r.status === 404) { row.chambers[`${st}-${ch}`] = { capturedFrom: url, parse: 'absent', status: 404 }; continue; }
        row.chambers[`${st}-${ch}`] = r.ok ? { capturedFrom: url, fetchMethod: r.fetchMethod, ...parseChamber(r.body) } : { capturedFrom: url, fetchMethod: r.fetchMethod, parse: 'failed', status: r.status };
      } catch (e) { row.errors.push(`${st}-${ch}: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const i = daily.rows.findIndex((x) => x.date === row.date);
  if (i >= 0) daily.rows[i] = row; else daily.rows.push(row);
  daily.capturedAt = capturedAt;
  writeFileSync(join(outDir, 'forecast-daily.json'), JSON.stringify(daily, null, 1) + '\n');
  const okCh = Object.values(row.chambers).filter((c) => c.parse === 'ok').length;
  console.log('[statenavigate]', JSON.stringify({ national: row.national && row.national.parse, nationalVia: row.national && row.national.fetchMethod, chambersOk: okCh, chambersTotal: Object.keys(row.chambers).length, renderer: row.renderer, apiDocsReachable: probe.reachableDocs, errors: row.errors.length }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('[statenavigate] fatal', e); process.exit(1); });
}
