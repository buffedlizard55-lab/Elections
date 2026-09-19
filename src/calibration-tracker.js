/**
 * Elections — 2026 forward calibration tracker (ROADMAP R3).
 * =====================================================================
 * Consumes ONLY captured artifacts (never invented numbers):
 *   data/kalshi/forward/open-prices.csv       append-only daily snapshots of every
 *                                             open politics/elections market
 *                                             (written by scripts/collect-universe.mjs)
 *   data/kalshi/forward/settled-2026-seed.json settled 2026 Elections markets +
 *                                             normalised daily bars (same collector)
 *   data/kalshi/forward/universe-open.json    latest open universe (watchlist source)
 *
 * Produces the running "expected vs actual" record:
 *   - per settled 2026 market: Brier / log-loss of the market price at T-1..T-60
 *     before close (the exchange's own calibration claims, tested on forward data)
 *   - calibration buckets: pooled (price, outcome) pairs at T-7 and T-1
 *   - the daily tracker history for headline control markets (site charts)
 *   - upcoming settlement watchlist (first big settlement: LA mayor, 2026-11-03 —
 *     located by scanning event tickers, never hard-coded)
 *
 * Returns null when no forward artifacts exist yet.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brier, logloss, LEAD_TIMES_DAYS } from './backtest.js';
import { parseBar } from './kalshi-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FORWARD_DIR = 'data/kalshi/forward';
export const WATCH_EVENT_PATTERNS = [/MAYORLA|LOSANGELES|LA[-_]?MAYOR/i];
export const HEADLINE_TICKERS = ['CONTROLS-2026-D', 'CONTROLS-2026-R', 'CONTROLH-2026-R', 'CONTROLH-2026-D'];

/** Minimal RFC4180-ish CSV parser (handles the quoted yes_sub_title column). */
export function parseCsv(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])));
}

function lastCloseOnOrBeforeTs(bars, ts) {
  let last = null;
  for (const raw of bars) {
    const bar = parseBar(raw);
    if (bar.endPeriodTs > ts) break;
    if (bar.price.close !== null) last = bar.price.close;
  }
  return last;
}

export function runCalibrationTracker(root = ROOT) {
  const fdir = join(root, FORWARD_DIR);
  const csvPath = join(fdir, 'open-prices.csv');
  const seedPath = join(fdir, 'settled-2026-seed.json');
  const universePath = join(fdir, 'universe-open.json');
  if (!existsSync(csvPath) && !existsSync(seedPath)) return null;

  const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  const seed = readJson(seedPath);
  const universe = readJson(universePath);
  const csvRows = existsSync(csvPath) ? parseCsv(readFileSync(csvPath, 'utf8')) : [];

  // --- tracker history ---
  const days = [...new Set(csvRows.map((r) => r.date))].sort();
  const rowsPerDay = Object.fromEntries(days.map((d) => [d, csvRows.filter((r) => r.date === d).length]));
  const headline = {};
  for (const t of HEADLINE_TICKERS) {
    const pts = csvRows.filter((r) => r.ticker === t).map((r) => {
      const bid = r.yes_bid_dollars === '' ? null : Number(r.yes_bid_dollars);
      const ask = r.yes_ask_dollars === '' ? null : Number(r.yes_ask_dollars);
      const mid = bid != null && ask != null ? (bid + ask) / 2 : (r.last_price_dollars === '' ? null : Number(r.last_price_dollars));
      return { date: r.date, bid, ask, mid };
    }).filter((p) => p.mid != null);
    if (pts.length) headline[t] = pts;
  }

  // --- settled-2026 forward calibration ---
  const settled = [];
  if (seed) {
    for (const [ticker, m] of Object.entries(seed.markets)) {
      if (!m.result || (m.result !== 'yes' && m.result !== 'no')) continue;
      const bars = seed.bars[ticker];
      if (!bars || !bars.length || !m.close_time) continue;
      const closeTs = Math.floor(Date.parse(m.close_time) / 1000);
      const outcomeIsYes = m.result === 'yes';
      const leads = LEAD_TIMES_DAYS.map((nDays) => {
        const p = lastCloseOnOrBeforeTs(bars, closeTs - nDays * 86400);
        return p == null ? { nDays, p: null, brier: null, logloss: null } : { nDays, p, brier: brier(p, outcomeIsYes ? 1 : 0), logloss: logloss(p, outcomeIsYes ? 1 : 0) };
      });
      settled.push({
        ticker, event: m.event_ticker, series: m.series, sub: m.sub || null,
        result: m.result, outcomeIsYes, closeTime: m.close_time, volume: m.volume ?? null,
        nBars: bars.length, leads,
      });
    }
  }
  const byLead = LEAD_TIMES_DAYS.map((nDays) => {
    const rows = settled
      .map((m) => ({ outcomeIsYes: m.outcomeIsYes, l: m.leads.find((x) => x.nDays === nDays) }))
      .filter((x) => x.l && x.l.p !== null);
    if (!rows.length) return { nDays, nMarkets: 0, meanProbYes: null, outcomeRate: null, meanBrier: null, meanLogloss: null };
    const mean = (f) => rows.reduce((s, x) => s + f(x.l), 0) / rows.length;
    return {
      nDays,
      nMarkets: rows.length,
      meanProbYes: mean((l) => l.p),
      // share of the markets priced at this lead whose result was YES
      outcomeRate: rows.filter((x) => x.outcomeIsYes).length / rows.length,
      meanBrier: mean((l) => l.brier),
      meanLogloss: mean((l) => l.logloss),
    };
  });

  const bucketize = (nDays) => {
    const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((lo) => ({ lo, hi: lo + 10, n: 0, meanP: null, hitRate: null }));
    const pts = [];
    for (const m of settled) {
      const l = m.leads.find((x) => x.nDays === nDays);
      if (l && l.p !== null) pts.push({ p: l.p, o: m.outcomeIsYes ? 1 : 0 });
    }
    for (const pt of pts) {
      const b = buckets[Math.min(9, Math.floor((pt.p * 100) / 10))];
      b.n++;
      b.meanP = b.meanP == null ? pt.p : (b.meanP * (b.n - 1) + pt.p) / b.n;
      b.hitRate = b.hitRate == null ? pt.o : (b.hitRate * (b.n - 1) + pt.o) / b.n;
    }
    return { nDays, nPoints: pts.length, buckets: buckets.filter((b) => b.n > 0) };
  };

  // --- watchlists (located from captured data, never hard-coded results) ---
  const openMarkets = (universe && universe.markets) || [];
  const laMayor = openMarkets.filter((m) => WATCH_EVENT_PATTERNS.some((re) => re.test(String(m.event_ticker || '')) || re.test(String(m.sub || ''))));
  const upcoming = openMarkets
    .filter((m) => m.close_time)
    .sort((a, b) => String(a.close_time).localeCompare(String(b.close_time)))
    .slice(0, 15)
    .map((m) => ({ ticker: m.ticker, event: m.event_ticker, series: m.series, sub: m.sub, bid: m.bid, ask: m.ask, vol: m.vol, close_time: m.close_time }));

  return {
    tracker: { days, rowsPerDay, totalRows: csvRows.length, headlineSeries: headline },
    settled2026: {
      capturedFrom: seed ? seed.capturedFrom : null,
      capturedAt: seed ? seed.capturedAt : null,
      nMarketsWithResult: Object.values(seed?.markets || {}).filter((m) => m.result === 'yes' || m.result === 'no').length,
      nScored: settled.length,
      byLead,
      bucketsT7: bucketize(7),
      bucketsT1: bucketize(1),
      markets: settled.map((m) => ({ ticker: m.ticker, series: m.series, sub: m.sub, result: m.result, closeTime: m.closeTime, nBars: m.nBars, leads: m.leads })),
    },
    watch: {
      laMayor: laMayor.map((m) => ({ ticker: m.ticker, event: m.event_ticker, series: m.series, sub: m.sub, bid: m.bid, ask: m.ask, vol: m.vol, close_time: m.close_time })),
      upcomingSettlements: upcoming,
    },
  };
}
