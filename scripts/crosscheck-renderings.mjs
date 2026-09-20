#!/usr/bin/env node
/**
 * R13 standing monitor — third-party renderings of Kalshi vs this project's own capture.
 * ====================================================================================
 * Irregularity #46 was a one-off manual comparison; this makes it daily. Three renderers, all
 * fetched directly on 2026-09-19 and parseable as plain text:
 *   270toWin   https://www.270towin.com/            Kalshi panel "57% / 41% as of Sep. 19, 2026 at 20:29 UTC" (2028 presidency)
 *   DDHQ Votes https://votes.decisiondeskhq.com/    "House D 70%", "Senate D 52%" (DDHQ's own odds, a CONTEXT layer, not Kalshi)
 *   EBO        https://electionbettingodds.com/     per-market rows "Kalshi ... 58.4-59.4%" for Senate Control 2026 (renders Kalshi bid-ask)
 *
 * Rule: a renderer that says it is showing Kalshi (270toWin, EBO's Kalshi row) is compared with the
 * captured yes_bid/yes_ask for the same market; a divergence larger than the capture-time gap
 * tolerance is flagged for review (not asserted as an error — timestamps differ). DDHQ's numbers are
 * not Kalshi and are recorded as the context layer only. A page that cannot be parsed is recorded as
 * extract:'failed' with a sample; nothing is estimated.
 *
 * Output: data/kalshi/tracker/rendering-crosscheck.json (append-only rows per day).
 * Usage:  node scripts/crosscheck-renderings.mjs [--replay-ebo f.html] [--replay-ddhq f.html] [--replay-270 f.html]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCES = {
  ebo: 'https://electionbettingodds.com/',
  ddhq: 'https://votes.decisiondeskhq.com/',
  '270': 'https://www.270towin.com/',
};
export const TOLERANCE = 0.03; // 3 points: renderers refresh every 1-20 min; our capture is once a day

// Raw HTML (as fetched by the collector) differs from the fetch-tool text the fixtures were transcribed from:
// entities are un-decoded (&nbsp without a semicolon, &#x1F1FA flag emoji, &amp;) and numbers can be split
// ("D 70 %"). First live run 2026-09-20 recorded extract:'failed' for all three renderers for exactly this reason.
const strip = (html) => String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;?/g, ' ').replace(/&#x[0-9a-f]+;?/gi, ' ').replace(/&#\d+;?/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/(\d)\s+%/g, '$1%').replace(/\s+/g, ' ');

/** EBO: the block titled "Senate Control 2026" contains "DEM ... Kalshi ... 58.4-59.4%" and "REP ... Kalshi ... 40.6-41.6%". */
export function parseEbo(html) {
  const t = strip(html);
  const block = (t.match(/Senate Control 2026[\s\S]{0,15000}?(?=US Presidency|House Control|$)/i) || [''])[0];
  const kalshiRanges = [...block.matchAll(/Kalshi[^\d]{0,60}(\d{1,3}(?:\.\d)?)-(\d{1,3}(?:\.\d)?)%/g)].map((m) => ({ bid: Number(m[1]) / 100, ask: Number((Number(m[2]) / 100).toFixed(4)) }));
  const headline = (block.match(/(\d{1,3}(?:\.\d)?)%\s*(?:<br>)?\s*(?:!\[\]\([^)]*\))?\s*[+\-−]?\d/) || [])[1];
  const stamp = (t.match(/Last updated:\s*([^_|*]+?(?:20\d\d))/i) || [])[1] || null;
  const out = { extract: kalshiRanges.length ? 'ok' : 'failed', stamp, senateDemKalshi: kalshiRanges[0] || null, senateRepKalshi: kalshiRanges[1] || null, eboHeadlineDem: headline ? Number(headline) / 100 : null };
  if (out.extract === 'failed') out.sample = block.slice(0, 300) || t.slice(0, 300);
  return out;
}

/** DDHQ Votes: "House D 70%" / "Senate D 52%" style figures (DDHQ's own odds). */
export function parseDdhq(html) {
  const t = strip(html);
  const pick = (label) => { const m = t.match(new RegExp(`\\b${label}\\s*D(?:em(?:ocrat)?s?)?\\s*(\\d{1,3})%`, 'i')) || t.match(new RegExp(`\\b${label}[^%]{0,80}?D(?:em(?:ocrat)?s?)?[^%\\d]{0,30}(\\d{1,3})%`, 'i')); return m ? Number(m[1]) / 100 : null; };
  const out = { extract: 'ok', houseD: pick('House'), senateD: pick('Senate') };
  if (out.houseD == null && out.senateD == null) { out.extract = 'failed'; out.sample = t.slice(0, 300); }
  return out;
}

/** 270toWin: Kalshi 2028 panel "57% ... 41% ... as of Sep. 19, 2026 at 20:29 UTC". */
export function parse270(html) {
  const t = strip(html);
  const m = t.match(/(\d{1,3})%[^%]{0,60}?(\d{1,3})%[^]{0,200}?as of ([A-Z][a-z]+\.? \d{1,2}, 20\d\d at \d{1,2}:\d{2} UTC)/);
  const kpow = (t.match(/([+\-−]\d+(?:\.\d+)?\s*[DR])\s*as of\s*(\d{1,2}\/\d{1,2}\/\d{2})/) || []);
  const out = { extract: m ? 'ok' : 'failed', kalshiPanel: m ? { a: Number(m[1]) / 100, b: Number(m[2]) / 100, asOf: m[3] } : null, kpow: kpow[1] ? { value: kpow[1], asOf: kpow[2] } : null };
  if (!m) out.sample = t.slice(0, 300);
  return out;
}

/** Compare a rendered {bid,ask} with the captured market; flag when the ranges are further apart than TOLERANCE. */
export function compareRange(rendered, captured, tolerance = TOLERANCE) {
  if (!rendered || !captured || typeof captured.yes_bid !== 'number') return { comparable: false };
  const rMid = (rendered.bid + rendered.ask) / 2;
  const cMid = (captured.yes_bid + captured.yes_ask) / 2;
  const diff = Number((rMid - cMid).toFixed(4));
  return { comparable: true, renderedMid: rMid, capturedMid: cMid, diff, flagged: Math.abs(diff) > tolerance };
}

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'elections-collector (github.com/buffedlizard55-lab/Elections)' } });
  return { status: res.status, ok: res.ok, body: await res.text() };
}
const readJson = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fb);
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };

async function load(key, replay) {
  if (replay) return { capturedFrom: `replay:${replay}`, body: readFileSync(replay, 'utf8'), status: 200 };
  try { const r = await get(SOURCES[key]); return { capturedFrom: SOURCES[key], ...r }; } catch (e) { return { capturedFrom: SOURCES[key], status: 0, error: String(e.message).slice(0, 200) }; }
}

async function main() {
  const capturedAt = new Date().toISOString();
  const replay = { ebo: arg('--replay-ebo'), ddhq: arg('--replay-ddhq'), '270': arg('--replay-270') };
  const isReplay = Object.values(replay).some(Boolean);
  const universe = readJson(join(ROOT, 'data/kalshi/universe/latest.json'), null);
  const market = (evt, tk) => { const e = universe && universe.events.find((x) => x.event_ticker === evt); return e ? e.markets.find((m) => m.ticker === tk) : null; };

  const row = { date: capturedAt.slice(0, 10), capturedAt, kalshiCapturedAt: universe ? universe.capturedAt : null, renderers: {}, flags: [] };
  const ebo = await load('ebo', replay.ebo);
  row.renderers.ebo = { capturedFrom: ebo.capturedFrom, status: ebo.status, ...(ebo.body ? parseEbo(ebo.body) : { extract: 'failed', error: ebo.error }) };
  if (row.renderers.ebo.senateDemKalshi) {
    row.renderers.ebo.vsCaptured = compareRange(row.renderers.ebo.senateDemKalshi, market('CONTROLS-2026', 'CONTROLS-2026-D'));
    if (row.renderers.ebo.vsCaptured.flagged) row.flags.push(`EBO's Kalshi Senate-D row ${JSON.stringify(row.renderers.ebo.senateDemKalshi)} vs captured mid ${row.renderers.ebo.vsCaptured.capturedMid} (diff ${row.renderers.ebo.vsCaptured.diff}) — review (timestamps differ)`);
  }
  const ddhq = await load('ddhq', replay.ddhq);
  row.renderers.ddhq = { capturedFrom: ddhq.capturedFrom, status: ddhq.status, layer: 'context (DDHQ odds, not Kalshi)', ...(ddhq.body ? parseDdhq(ddhq.body) : { extract: 'failed', error: ddhq.error }) };
  const t70 = await load('270', replay['270']);
  row.renderers['270towin'] = { capturedFrom: t70.capturedFrom, status: t70.status, note: 'Kalshi panel on the homepage is the 2028 presidency (not a 2026 market); recorded, compared only when a matching captured market exists', ...(t70.body ? parse270(t70.body) : { extract: 'failed', error: t70.error }) };
  for (const [k, r] of Object.entries(row.renderers)) if (r.extract === 'failed') row.flags.push(`${k}: not extractable this run (status ${r.status}) — recorded, nothing estimated`);

  const outPath = join(ROOT, 'data/kalshi/tracker/rendering-crosscheck.json');
  const file = readJson(outPath, {
    title: 'R13 standing monitor — third-party renderings of Kalshi vs this project\'s captured yes_bid/yes_ask',
    capturedFrom: Object.values(SOURCES).join(' ; '),
    method: `Daily. Renderers that display Kalshi (EBO's Kalshi row; 270toWin's panel) are compared with data/kalshi/universe/latest.json at the bid/ask midpoint; |diff| > ${TOLERANCE} is flagged for review, never asserted as an error, because the renderer refreshes every 1-20 minutes and our capture is daily. DDHQ's odds are its own model and are stored as the context layer. Parse failures are recorded verbatim.`,
    rows: [],
  });
  if (!isReplay) {
    const i = file.rows.findIndex((x) => x.date === row.date);
    if (i >= 0) file.rows[i] = row; else file.rows.push(row);
    file.capturedAt = capturedAt;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(file, null, 1) + '\n');
  }
  console.log('[renderings]', JSON.stringify({ ebo: row.renderers.ebo.extract, ddhq: row.renderers.ddhq.extract, '270': row.renderers['270towin'].extract, flags: row.flags }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('[renderings] fatal', e); process.exit(1); });
}
