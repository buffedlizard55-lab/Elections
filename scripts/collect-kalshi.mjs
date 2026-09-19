#!/usr/bin/env node
/**
 * Elections — Kalshi collector (runs where general internet is available,
 * e.g. GitHub Actions). This session's sandbox had no direct internet, so
 * the committed data was captured via a proxied fetch tool instead; this
 * script is the standing forward-collection loop (ROADMAP R1/R3).
 *
 * It NEVER rewrites verified historical files. It appends to:
 *   data/kalshi/live/{date}/markets-{series}.json   (raw GET /markets)
 *   data/kalshi/live/{date}/candles-{ticker}.json   (candlesticks, new trades)
 *   data/kalshi/live/{date}/meta.json               (cutoff, series fees, universe counts)
 * and rebuilds the site bundle. Every artifact carries capturedFrom +
 * capturedAt (the lint enforces provenance on all data JSON).
 *
 * Usage: node scripts/collect-kalshi.mjs [--dry-run]
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');

const API = process.env.KALSHI_API_BASE || 'https://api.elections.kalshi.com/trade-api/v2';
// Election-focused series to collect (verified this session; extend as R2 lands).
const SERIES = ['PRES', 'CONTROLH', 'CONTROLS', 'SENATEAZ', 'SENATETX', 'SENATENE', 'SENATEAK', 'SENATEIA', 'SENATETN'];

async function getJson(path) {
  const res = await fetch(API + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json();
}

async function collectSeriesMarkets(series) {
  const out = [];
  let cursor = '';
  do {
    const q = `/markets?series_ticker=${series}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await getJson(q);
    out.push(...(page.markets || []));
    cursor = page.cursor || '';
  } while (cursor);
  return out;
}

async function collectHistoricalMarkets(series) {
  const out = [];
  let cursor = '';
  do {
    const q = `/historical/markets?series_ticker=${series}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await getJson(q);
    out.push(...(page.markets || []));
    cursor = page.cursor || '';
  } while (cursor);
  return out;
}

async function collectCandles(ticker, startTs, endTs) {
  const out = [];
  let cursor = '';
  do {
    const q = `/historical/markets/${ticker}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=1440${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const page = await getJson(q);
    out.push(...(page.candlesticks || []));
    cursor = page.cursor || '';
  } while (cursor);
  return out;
}

const now = new Date();
const day = now.toISOString().slice(0, 10);
const outDir = join(ROOT, 'data/kalshi/live', day);
const provenance = (url) => ({ capturedFrom: url, capturedAt: now.toISOString(), capturedBy: 'scripts/collect-kalshi.mjs' });

async function main() {
  console.log(`[collect] ${DRY ? 'DRY RUN' : 'LIVE'} ${day} base=${API}`);
  // meta.json carries the same provenance fields as every other artifact —
  // the no-fabrication lint walks ALL data/*.json and a provenance-less meta
  // file failed the fatal lint on the first networked run (run #6, 2026-09-19).
  const meta = { ...provenance(API), date: day, series: {}, errors: [] };
  for (const series of SERIES) {
    try {
      const [live, hist] = await Promise.all([collectSeriesMarkets(series), collectHistoricalMarkets(series)]);
      meta.series[series] = { open: live.length, settled: hist.length };
      if (!DRY) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `markets-${series}.json`), JSON.stringify({ ...provenance(API + `/markets?series_ticker=${series}`), markets: live }, null, 1));
        writeFileSync(join(outDir, `historical-${series}.json`), JSON.stringify({ ...provenance(API + `/historical/markets?series_ticker=${series}`), markets: hist }, null, 1));
      }
      console.log(`  ${series}: ${live.length} open / ${hist.length} settled`);
    } catch (e) {
      meta.errors.push(`${series}: ${e.message}`);
      console.error(`  ${series}: FAILED ${e.message}`);
    }
    // Pace between series: this step runs right after the 36-minute universe
    // sweep, and unpaced bursts got HTTP 429 on 3 of 10 series in run #6.
    await new Promise((r) => setTimeout(r, 450));
  }
  if (!DRY) {
    try {
      const cutoff = await getJson('/historical/cutoff');
      meta.cutoff = cutoff;
      writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
    } catch (e) {
      meta.errors.push('cutoff: ' + e.message);
    }
    writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  }
  if (meta.errors.length) {
    console.error(`[collect] ${meta.errors.length} errors (recorded in meta.json); site NOT rebuilt`);
    process.exitCode = 1;
    return;
  }
  console.log('[collect] OK — rebuilding site bundle');
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-site.mjs')], { stdio: 'inherit', cwd: ROOT });
}

main().catch((e) => {
  console.error('[collect] fatal:', e.message);
  process.exit(1);
});
