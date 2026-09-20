#!/usr/bin/env node
/**
 * Host re-test monitor (ROADMAP R15) — turns the "re-tests" list into a standing, evidence-producing job.
 * ======================================================================================================
 * Every URL this project could not read (irregularities #35, #40–#43, #45, #47, #48, #51–#55, #58) is listed
 * in data/probes/targets.json. This script fetches each one from wherever it runs (the GitHub-hosted runner
 * in the daily workflow; a laptop by hand) and records what came back:
 *   - status code, final URL, content type, byte count and bot-interstitial type per header profile
 *     (project user-agent first, browser-like profile only after a 403/503/interstitial),
 *   - the <title> and the first 300 characters of visible text,
 *   - for targets marked render:true, the same for the headless-Chrome DOM (client-rendered pages),
 *   - a verdict: reachable | reachable-rendered-only | blocked-challenge | http-<code> | error.
 *
 * What it does NOT do: admit a source. A "reachable" verdict is the cue for a session to fetch the page,
 * read it and write the observed text into data/sources/master.json — the same line-by-line rule as before.
 * Raw bodies go to data/probes/raw/ (git-ignored; uploaded as a workflow artifact for parser development).
 *
 * Usage: node scripts/probe-hosts.mjs [--only id1,id2] [--no-render] [--raw-dir data/probes/raw]
 * Output: data/probes/latest.json (this run) and data/probes/history.json (one summary row per run).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithProfiles, renderDom, findChrome, htmlToText, pageTitle } from './lib/render.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const only = arg('--only') ? arg('--only').split(',') : null;
const noRender = argv.includes('--no-render');
const rawDir = arg('--raw-dir') || join(ROOT, 'data/probes/raw');

export function verdictFor(fetched, rendered) {
  if (fetched.ok) return 'reachable';
  if (rendered && rendered.ok && !rendered.challenge && rendered.textLength > 200) return 'reachable-rendered-only';
  const last = fetched.attempts[fetched.attempts.length - 1] || {};
  if (last.challenge) return `blocked-${last.challenge}`;
  if (last.error) return 'error';
  return `http-${last.status ?? fetched.status ?? 0}`;
}

export async function probeTarget(t, { render = true } = {}) {
  const startedAt = new Date().toISOString();
  const f = await fetchWithProfiles(t.url);
  const row = {
    id: t.id, url: t.url, name: t.name, irregularity: t.irregularity ?? null, capturedAt: startedAt,
    fetch: {
      ok: f.ok, status: f.status, finalUrl: f.finalUrl || null, profile: f.profile || null, attempts: f.attempts,
      title: f.body ? pageTitle(f.body) : null, sample: f.body ? htmlToText(f.body).slice(0, 300) : null, error: f.error || null,
    },
  };
  if (f.body && rawDir) { mkdirSync(rawDir, { recursive: true }); writeFileSync(join(rawDir, `${t.id}.fetch.html`), f.body); }
  if (render && t.render) {
    const r = renderDom(t.url, { retries: 1 }); // one retry keeps ~10 render targets inside the step budget; the profile persists across targets
    row.render = r.ok
      ? { ok: true, bin: r.bin, challenge: r.challenge || null, title: pageTitle(r.html), textLength: htmlToText(r.html).length, sample: htmlToText(r.html).slice(0, 300), attempts: r.attempts }
      : { ok: false, reason: r.reason, bin: r.bin || null, attempts: r.attempts || null };
    if (r.ok && rawDir) { mkdirSync(rawDir, { recursive: true }); writeFileSync(join(rawDir, `${t.id}.rendered.html`), r.html); }
  }
  row.verdict = verdictFor(row.fetch, row.render);
  return row;
}

async function main() {
  const targets = JSON.parse(readFileSync(join(ROOT, 'data/probes/targets.json'), 'utf8')).targets
    .filter((t) => !only || only.includes(t.id));
  const capturedAt = new Date().toISOString();
  const chrome = noRender ? null : findChrome();
  const rows = [];
  for (const t of targets) {
    let row;
    try {
      row = await probeTarget(t, { render: !!chrome });
    } catch (e) {
      // One target must never take the whole run down (first live run, 2026-09-20: an ENOENT on the raw dir did).
      row = { id: t.id, url: t.url, name: t.name, irregularity: t.irregularity ?? null, capturedAt: new Date().toISOString(), fetch: { ok: false, status: 0, attempts: [{ error: `probe crashed: ${String(e && e.message || e).slice(0, 200)}` }] }, verdict: 'error' };
    }
    rows.push(row);
    console.log(`[probe] ${t.id.padEnd(28)} ${row.verdict.padEnd(28)} fetch=${row.fetch.status}${row.render ? ` render=${row.render.ok ? 'ok' : row.render.reason}` : ''}`);
    await new Promise((r) => setTimeout(r, 400));
  }
  const out = {
    title: 'Host re-test monitor — what each previously unreachable URL answered from this runner',
    capturedFrom: 'data/probes/targets.json (URLs) fetched by scripts/probe-hosts.mjs',
    capturedAt,
    runner: { platform: process.platform, node: process.version, chrome: chrome || null, github: process.env.GITHUB_RUN_ID ? { runId: process.env.GITHUB_RUN_ID, workflow: process.env.GITHUB_WORKFLOW, ref: process.env.GITHUB_REF_NAME } : null },
    method: 'Project user-agent first; browser-like profile only after a 403/503 or a bot interstitial; headless Chrome render for render:true targets when a binary exists. Verdicts describe reachability from this vantage point only — a source is admitted to the registry only after a session reads the page and records the observed text.',
    summary: Object.fromEntries(rows.map((r) => [r.id, r.verdict])),
    rows,
  };
  mkdirSync(join(ROOT, 'data/probes'), { recursive: true });
  if (!only) {
    writeFileSync(join(ROOT, 'data/probes/latest.json'), JSON.stringify(out, null, 1) + '\n');
    const histPath = join(ROOT, 'data/probes/history.json');
    const hist = existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf8')) : { title: 'Host re-test monitor — one summary row per run', capturedFrom: 'scripts/probe-hosts.mjs', rows: [] };
    hist.rows.push({ capturedAt, runner: out.runner.github ? 'github-actions' : 'local', chrome: !!chrome, summary: out.summary });
    if (hist.rows.length > 400) hist.rows = hist.rows.slice(-400);
    hist.capturedAt = capturedAt;
    writeFileSync(histPath, JSON.stringify(hist, null, 1) + '\n');
  } else {
    console.log(JSON.stringify(out, null, 1));
  }
  const reach = rows.filter((r) => r.verdict.startsWith('reachable')).length;
  console.log(`[probe] ${reach}/${rows.length} reachable (${chrome ? 'with' : 'without'} headless Chrome) -> data/probes/latest.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error('[probe] fatal', e); process.exit(1); });
}
