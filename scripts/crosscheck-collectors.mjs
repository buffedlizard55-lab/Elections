#!/usr/bin/env node
/**
 * Elections — two-collector cross-check (verification-first: two independent
 * captures of the same public data should agree).
 *
 * Compares the Node tracker row for today (data/kalshi/tracker/daily/<date>.csv,
 * written by scripts/collect-kalshi.mjs from GET /events?with_nested_markets=true)
 * with the Python-track compact sample (data/kalshi/markets_politics_latest.json,
 * written by scripts/fetch_kalshi.py from GET /markets?status=open) on the tickers
 * both captured. The runs are minutes apart, so small price moves are expected;
 * the report publishes the agreement distribution and the largest differences
 * instead of a pass/fail. Written to data/kalshi/tracker/collector-crosscheck.json.
 *
 * Usage: node scripts/crosscheck-collectors.mjs [--date YYYY-MM-DD]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../src/kalshi-api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const day = argv.indexOf('--date') >= 0 ? argv[argv.indexOf('--date') + 1] : new Date().toISOString().slice(0, 10);
const nodePath = join(ROOT, `data/kalshi/tracker/daily/${day}.csv`);
const pyPath = join(ROOT, 'data/kalshi/markets_politics_latest.json');
const outPath = join(ROOT, 'data/kalshi/tracker/collector-crosscheck.json');

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export function crossCheck(nodeRows, pyMarkets, { tolerance = 0.02 } = {}) {
  const node = new Map(nodeRows.map((r) => [r.ticker, r]));
  const overlap = [];
  let pyOnly = 0;
  for (const m of pyMarkets) {
    const n = node.get(m.ticker);
    if (!n) { pyOnly += 1; continue; }
    const a = { bid: num(n.yes_bid), ask: num(n.yes_ask), last: num(n.last_price), volume: num(n.volume) };
    const b = { bid: num(m.yes_bid_dollars), ask: num(m.yes_ask_dollars), last: num(m.last_price_dollars), volume: num(m.volume_fp) };
    const dLast = a.last !== null && b.last !== null ? Math.abs(a.last - b.last) : null;
    const dBid = a.bid !== null && b.bid !== null ? Math.abs(a.bid - b.bid) : null;
    const dAsk = a.ask !== null && b.ask !== null ? Math.abs(a.ask - b.ask) : null;
    overlap.push({ ticker: m.ticker, node: a, python: b, dLast, dBid, dAsk, volumeDelta: a.volume !== null && b.volume !== null ? b.volume - a.volume : null });
  }
  const withLast = overlap.filter((o) => o.dLast !== null);
  const agreeLast = withLast.filter((o) => o.dLast <= tolerance).length;
  const withBook = overlap.filter((o) => o.dBid !== null && o.dAsk !== null);
  const agreeBook = withBook.filter((o) => o.dBid <= tolerance && o.dAsk <= tolerance).length;
  const volumeWentDown = overlap.filter((o) => o.volumeDelta !== null && o.volumeDelta < 0).length; // lifetime volume must be monotone
  const largest = [...overlap].filter((o) => o.dLast !== null).sort((x, y) => y.dLast - x.dLast).slice(0, 25);
  return {
    tolerance,
    nodeRows: nodeRows.length,
    pythonMarkets: pyMarkets.length,
    overlap: overlap.length,
    pythonOnly: pyOnly,
    lastPrice: { compared: withLast.length, withinTolerance: agreeLast, share: withLast.length ? Number((agreeLast / withLast.length).toFixed(4)) : null },
    book: { compared: withBook.length, withinTolerance: agreeBook, share: withBook.length ? Number((agreeBook / withBook.length).toFixed(4)) : null },
    volumeDecreased: volumeWentDown,
    largestLastPriceDifferences: largest,
  };
}

function main() {
  if (!existsSync(nodePath) || !existsSync(pyPath)) {
    console.log(`[crosscheck] skipped: need ${nodePath} and ${pyPath}`);
    return;
  }
  const nodeRows = parseCsv(readFileSync(nodePath, 'utf8'));
  const py = JSON.parse(readFileSync(pyPath, 'utf8'));
  const report = {
    capturedFrom: `${nodePath.replace(ROOT + '/', '')} (Node, ${nodeRows[0] ? nodeRows[0].date : day}) vs ${pyPath.replace(ROOT + '/', '')} (Python, ${py.capturedAt})`,
    capturedAt: new Date().toISOString(),
    capturedBy: 'scripts/crosscheck-collectors.mjs',
    date: day,
    pythonCapturedAt: py.capturedAt,
    method: 'Tickers present in both captures are compared on last price, bid and ask (dollars). Runs are minutes apart; differences within tolerance are agreement, larger ones are listed for review (not corrected). Lifetime volume must never decrease between the earlier and the later capture.',
    ...crossCheck(nodeRows, py.markets || []),
  };
  writeFileSync(outPath, JSON.stringify(report, null, 1) + '\n');
  // merge the agreement summary into the per-day run history written by collect-kalshi.mjs
  const historyPath = join(ROOT, 'data/kalshi/tracker/history.json');
  if (existsSync(historyPath)) {
    const history = JSON.parse(readFileSync(historyPath, 'utf8'));
    const rec = (history.days || []).find((d) => d.date === day);
    if (rec) {
      rec.crosscheck = { pythonCapturedAt: report.pythonCapturedAt, pythonMarkets: report.pythonMarkets, overlap: report.overlap, lastWithinTolerance: report.lastPrice.withinTolerance, lastCompared: report.lastPrice.compared, lastShare: report.lastPrice.share, volumeDecreased: report.volumeDecreased };
      writeFileSync(historyPath, JSON.stringify(history, null, 1) + '\n');
    }
  }
  console.log(`[crosscheck] overlap ${report.overlap}/${report.pythonMarkets}; last within ${report.tolerance}: ${report.lastPrice.withinTolerance}/${report.lastPrice.compared}; book: ${report.book.withinTolerance}/${report.book.compared}; volume decreased: ${report.volumeDecreased}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
