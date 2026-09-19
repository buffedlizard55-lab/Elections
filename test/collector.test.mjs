// Unit tests for the forward-collection layer (R1/R3/R5): pure helpers only — no network.
// Fixtures are SYNTHETIC and labelled as such; they never stand in for captured data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBar, impliedProb, toCsv, parseCsv, compactMarket, num, dollarsToCents } from '../src/kalshi-api.js';
import { scoreCalibration, seriesByTicker, lastOnOrBefore, LEAD_DAYS } from '../src/calibration.js';
import { checkConsistency } from '../src/consistency.js';
import { crossCheck } from '../scripts/crosscheck-collectors.mjs';
import { DAILY_COLUMNS, isTraded, isOpenForTrading, isUsElectionSeries } from '../scripts/collect-kalshi.mjs';
import { existsSync, readFileSync } from 'node:fs';

// ---------- kalshi-api normalisers ----------

test('num / dollarsToCents handle dollar strings, blanks and sub-cent levels', () => {
  assert.equal(num('0.7800'), 0.78);
  assert.equal(num(''), null);
  assert.equal(num(null), null);
  assert.equal(num('abc'), null);
  assert.equal(dollarsToCents('0.70'), 70);
  assert.equal(dollarsToCents('0.0015'), 0.15); // sub-cent price level kept exactly
  assert.equal(dollarsToCents(''), null);
});

test('normalizeBar maps the documented candlestick shape to the 17-field integer-cents layout', () => {
  // SYNTHETIC fixture shaped like GET /historical/markets/{t}/candlesticks
  const bar = {
    end_period_ts: 1730782800,
    volume_fp: '93619.00',
    open_interest_fp: '593059.00',
    price: { open_dollars: '0.77', high_dollars: '0.77', low_dollars: '0.70', close_dollars: '0.70', mean_dollars: '0.7352', previous_dollars: null },
    yes_bid: { open_dollars: '0.76', high_dollars: '0.76', low_dollars: '0.69', close_dollars: '0.70' },
    yes_ask: { open_dollars: '0.77', high_dollars: '0.77', low_dollars: '0.70', close_dollars: '0.72' },
  };
  const out = normalizeBar(bar);
  assert.equal(out.length, 17);
  assert.deepEqual(out, [1730782800, 93619, 77, 77, 70, 70, 7352, null, 76, 76, 69, 70, 77, 77, 70, 72, 593059]);
  // plain (non-_dollars) shape is accepted too
  const plain = normalizeBar({ end_period_ts: 1, volume: 2, open_interest: 3, price: { open: '0.5', high: '0.5', low: '0.5', close: '0.5', mean: '0.5' }, yes_bid: {}, yes_ask: {} });
  assert.equal(plain[1], 2);
  assert.equal(plain[5], 50);
  assert.equal(plain[6], 5000);
  assert.equal(plain[8], null);
});

test('impliedProb prefers a tight two-sided book, falls back to last trade, else null', () => {
  assert.deepEqual(impliedProb({ yes_bid: 0.59, yes_ask: 0.60, last_price: 0.90 }), { p: 0.595, basis: 'mid' });
  assert.deepEqual(impliedProb({ yes_bid: 0.20, yes_ask: 0.60, last_price: 0.40 }), { p: 0.40, basis: 'last' }); // spread too wide -> last
  assert.deepEqual(impliedProb({ yes_bid: null, yes_ask: null, last_price: 0.33 }), { p: 0.33, basis: 'last' });
  assert.deepEqual(impliedProb({ yes_bid: 0, yes_ask: 1, last_price: 0 }), { p: null, basis: 'none' });
  assert.deepEqual(impliedProb({ yes_bid: null, yes_ask: null, last_price: null }), { p: null, basis: 'none' });
});

test('toCsv / parseCsv round-trip titles with commas, quotes and newlines', () => {
  const cols = ['date', 'ticker', 'title', 'yes_bid'];
  const rows = [
    { date: '2026-09-19', ticker: 'A-1', title: 'Will "X", Y win?', yes_bid: 0.5 },
    { date: '2026-09-19', ticker: 'B-2', title: 'line1\nline2', yes_bid: null },
  ];
  const text = toCsv(rows, cols);
  const back = parseCsv(text);
  assert.equal(back.length, 2);
  assert.equal(back[0].title, 'Will "X", Y win?');
  assert.equal(back[1].title, 'line1\nline2');
  assert.equal(back[1].yes_bid, ''); // null -> empty field
  assert.equal(back[0].yes_bid, '0.5');
});

test('compactMarket converts dollar strings to numbers and keeps the result field', () => {
  const m = compactMarket({ ticker: 'T', event_ticker: 'E', title: 't', status: 'active', open_time: 'o', close_time: 'c', yes_bid_dollars: '0.5900', yes_ask_dollars: '0.6000', last_price_dollars: '0.6000', volume_fp: '4083806.76', volume_24h_fp: '10.00', open_interest_fp: '5.00', liquidity_dollars: '0.0000', result: '' });
  assert.equal(m.yes_bid, 0.59);
  assert.equal(m.volume, 4083806.76);
  assert.equal(m.liquidity, 0);
  assert.equal(m.yes_sub_title, '');
  assert.equal(m.result, '');
});

// ---------- calibration (R3) ----------

// SYNTHETIC daily rows: two markets observed for 10 days, settled on day 11.
const synthRows = [];
for (let d = 1; d <= 10; d++) {
  const date = `2026-10-${String(d).padStart(2, '0')}`;
  synthRows.push({ date, ticker: 'SYN-YES', yes_bid: 0.69, yes_ask: 0.71, last_price: 0.70 });
  synthRows.push({ date, ticker: 'SYN-NO', yes_bid: 0.29, yes_ask: 0.31, last_price: 0.30 });
  synthRows.push({ date, ticker: 'SYN-OPEN', yes_bid: 0.49, yes_ask: 0.51, last_price: 0.50 }); // never settles
}
const synthSettlements = {
  'SYN-YES': { result: 'yes', settlement_ts: '2026-10-11T02:00:00Z', title: 'synthetic yes' },
  'SYN-NO': { result: 'no', settlement_ts: '2026-10-11T02:00:00Z', title: 'synthetic no' },
  'SYN-VOID': { result: '', settlement_ts: '2026-10-11T02:00:00Z', title: 'not binary — must be ignored' },
};

test('calibration: empty state is explicit, never padded', () => {
  const out = scoreCalibration([], {});
  assert.equal(out.settledMarkets, 0);
  assert.equal(out.trackedMarkets, 0);
  assert.deepEqual(out.observationDays, []);
  for (const b of out.byLead) { assert.equal(b.nMarkets, 0); assert.equal(b.meanBrier, null); }
  for (const b of out.pooled) { assert.equal(b.n, 0); assert.equal(b.observedYesRate, null); }
  // tracked but nothing settled yet
  const out2 = scoreCalibration(synthRows, {});
  assert.equal(out2.trackedMarkets, 3);
  assert.equal(out2.settledMarkets, 0);
});

test('calibration: lead-time scoring uses the last observation on or before settlement-day minus N', () => {
  const out = scoreCalibration(synthRows, synthSettlements);
  assert.equal(out.settledMarkets, 2); // the non-binary result is ignored
  const yes = out.perMarket.find((m) => m.ticker === 'SYN-YES');
  const l1 = yes.leads.find((l) => l.nDays === 1);
  assert.equal(l1.date, '2026-10-10');
  assert.ok(Math.abs(l1.p - 0.70) < 1e-9);
  assert.ok(Math.abs(l1.brier - 0.09) < 1e-9); // (0.7-1)^2
  const l7 = yes.leads.find((l) => l.nDays === 7);
  assert.equal(l7.date, '2026-10-04');
  const l30 = yes.leads.find((l) => l.nDays === 30);
  assert.equal(l30.p, null); // no observation 30 days before settlement
  const by1 = out.byLead.find((b) => b.nDays === 1);
  assert.equal(by1.nMarkets, 2);
  assert.ok(Math.abs(by1.meanBrier - 0.09) < 1e-9); // both markets 0.09
  assert.deepEqual(LEAD_DAYS, [1, 3, 7, 14, 30]);
});

test('calibration: pooled curve buckets every (day, market) observation of settled markets only', () => {
  const out = scoreCalibration(synthRows, synthSettlements);
  const b7 = out.pooled.find((b) => b.lo === 0.7); // SYN-YES mid = 0.70 -> bucket [0.7, 0.8)
  assert.equal(b7.n, 10);
  assert.equal(b7.observedYesRate, 1);
  const b3 = out.pooled.find((b) => b.lo === 0.3);
  assert.equal(b3.n, 10);
  assert.equal(b3.observedYesRate, 0);
  const b5 = out.pooled.find((b) => b.lo === 0.5); // SYN-OPEN is not settled -> not pooled
  assert.equal(b5.n, 0);
});

test('seriesByTicker / lastOnOrBefore are date-ordered and cutoff-inclusive', () => {
  const s = seriesByTicker([
    { date: '2026-10-03', ticker: 'A', yes_bid: 0.4, yes_ask: 0.42, last_price: 0.41 },
    { date: '2026-10-01', ticker: 'A', yes_bid: 0.5, yes_ask: 0.52, last_price: 0.51 },
    { date: '2026-10-02', ticker: 'A', yes_bid: '', yes_ask: '', last_price: '' }, // unpriced day dropped
  ]);
  assert.deepEqual(s.get('A').map((p) => p.date), ['2026-10-01', '2026-10-03']);
  assert.equal(lastOnOrBefore(s.get('A'), '2026-10-02').date, '2026-10-01');
  assert.equal(lastOnOrBefore(s.get('A'), '2026-10-03').date, '2026-10-03');
  assert.equal(lastOnOrBefore(s.get('A'), '2026-09-30'), null);
});

// ---------- consistency (R5) ----------

test('consistency: over-sum is high severity, under-sum is informational and needs >= 3 markets', () => {
  const mk = (t, bid, ask, last = null, volume = 100) => ({ ticker: t, yes_bid: bid, yes_ask: ask, last_price: last, volume });
  const events = [
    { event_ticker: 'OVER', title: 'over', mutually_exclusive: true, us_election: true, markets: [mk('O-A', 0.60, 0.62), mk('O-B', 0.50, 0.52)] }, // sum 1.12
    { event_ticker: 'UNDER2', title: 'under two', mutually_exclusive: true, markets: [mk('U-A', 0.05, 0.07), mk('U-B', 0.03, 0.05)] }, // sum 0.10 but only 2 markets -> not flagged
    { event_ticker: 'UNDER3', title: 'under three', mutually_exclusive: true, markets: [mk('V-A', 0.05, 0.07), mk('V-B', 0.03, 0.05), mk('V-C', 0.02, 0.04)] }, // flagged info
    { event_ticker: 'OK', title: 'ok', mutually_exclusive: true, markets: [mk('K-A', 0.59, 0.61), mk('K-B', 0.39, 0.41)] }, // sum 1.00
    { event_ticker: 'PARTIAL', title: 'partial book', mutually_exclusive: true, markets: [mk('P-A', 0.9, 0.95), mk('P-B', null, null)] }, // not fully quoted -> skipped
    { event_ticker: 'CROSSED', title: 'crossed', mutually_exclusive: false, markets: [mk('C-A', 0.70, 0.60)] },
    { event_ticker: 'STALE', title: 'stale', mutually_exclusive: false, markets: [mk('S-A', 0.36, 0.38, 0.90)] },
  ];
  const out = checkConsistency(events);
  const by = (c) => out.findings.filter((f) => f.check === c);
  assert.equal(by('mutually-exclusive-sum-over').length, 1);
  assert.equal(by('mutually-exclusive-sum-over')[0].severity, 'high');
  assert.equal(by('mutually-exclusive-sum-over')[0].us_election, 1);
  assert.equal(by('mutually-exclusive-sum-under').length, 1);
  assert.equal(by('mutually-exclusive-sum-under')[0].event_ticker, 'UNDER3');
  assert.equal(by('crossed-book').length, 1);
  assert.equal(by('stale-last-vs-book').length, 1);
  assert.equal(out.eventsChecked, 7);
  assert.deepEqual(out.counts, { 'mutually-exclusive-sum-over': 1, 'mutually-exclusive-sum-under': 1, 'crossed-book': 1, 'stale-last-vs-book': 1 });
});

// ---------- two-collector cross-check ----------

test('crossCheck reports agreement shares and never a pass/fail', () => {
  const nodeRows = [
    { ticker: 'A', yes_bid: '0.59', yes_ask: '0.60', last_price: '0.60', volume: '100' },
    { ticker: 'B', yes_bid: '0.10', yes_ask: '0.12', last_price: '0.11', volume: '50' },
  ];
  const py = [
    { ticker: 'A', yes_bid_dollars: '0.5900', yes_ask_dollars: '0.6000', last_price_dollars: '0.6000', volume_fp: '101.00' },
    { ticker: 'B', yes_bid_dollars: '0.1000', yes_ask_dollars: '0.1200', last_price_dollars: '0.2000', volume_fp: '49.00' }, // last moved 9c; volume went DOWN (impossible)
    { ticker: 'C', yes_bid_dollars: '0.5', yes_ask_dollars: '0.6', last_price_dollars: '0.5', volume_fp: '1' }, // python-only
  ];
  const r = crossCheck(nodeRows, py);
  assert.equal(r.overlap, 2);
  assert.equal(r.pythonOnly, 1);
  assert.equal(r.lastPrice.withinTolerance, 1);
  assert.equal(r.book.withinTolerance, 2);
  assert.equal(r.volumeDecreased, 1);
  assert.equal(r.largestLastPriceDifferences[0].ticker, 'B');
});

// ---------- captured files (only when present; the collector runs on CI) ----------

test('captured tracker files, when present, carry provenance and the documented columns', () => {
  const p = 'data/kalshi/tracker/daily';
  if (!existsSync(p)) return; // not yet collected in this checkout
  const meta = JSON.parse(readFileSync('data/kalshi/tracker/calibration.json', 'utf8'));
  assert.ok(meta.capturedFrom && meta.capturedAt);
  assert.ok(Array.isArray(meta.byLead));
  const idx = JSON.parse(readFileSync('data/kalshi/tracker/index.json', 'utf8'));
  assert.ok(Array.isArray(idx.tickers) || typeof idx.tickers === 'object');
});

// ---------- offline end-to-end: the collector's main path over the saved universe ----------

test('collect-kalshi.mjs --replay --dry-run runs the whole pipeline offline over the saved universe', async () => {
  if (!existsSync('data/kalshi/universe/latest.json')) return;
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(process.execPath, ['scripts/collect-kalshi.mjs', '--replay', '--dry-run'], { encoding: 'utf8', timeout: 120000 });
  assert.match(out, /replaying \d+ saved events/);
  assert.match(out, /markets: \d+ \(\d+ traded, \d+ priced\)/);
  assert.match(out, /dry run — nothing written/);
  const m = out.match(/markets: (\d+) \((\d+) traded/);
  assert.ok(Number(m[1]) >= Number(m[2]) && Number(m[2]) > 0);
});

test('collect-kalshi.mjs --replay reproduces the live capture byte-for-byte (except timestamps) in a scratch copy', async () => {
  if (!existsSync('data/kalshi/universe/latest.json') || !existsSync('data/kalshi/tracker/index.json')) return;
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, cpSync, rmSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const scratch = mkdtempSync(join(tmpdir(), 'collect-replay-'));
  try {
    cpSync('data/kalshi/universe', join(scratch, 'universe'), { recursive: true });
    cpSync('data/kalshi/tracker', join(scratch, 'tracker'), { recursive: true });
    const day = JSON.parse(readFileSync('data/kalshi/universe/latest.json', 'utf8')).date;
    const out = execFileSync(process.execPath, ['scripts/collect-kalshi.mjs', '--replay', '--date', day], { encoding: 'utf8', timeout: 180000, env: { ...process.env, COLLECT_DATA_DIR: scratch } });
    assert.match(out, /scratch data dir — site bundle not rebuilt/);
    // timestamps differ by construction; the replay also adds a `replayedAt` provenance key that a live run never writes
    const strip = (t) => t
      .replace(/,?\s*"replayedAt": ?"[^"]*"/g, '')
      .replace(/"(capturedAt|finishedAt)": ?"[^"]*"/g, '"$1":"-"');
    const firstDiff = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return `first difference at offset ${i}: live=${JSON.stringify(a.slice(Math.max(0, i - 60), i + 60))} replay=${JSON.stringify(b.slice(Math.max(0, i - 60), i + 60))}`; };
    for (const rel of ['universe/latest.json', 'universe/series.json', 'tracker/index.json', 'tracker/settlements.json', 'tracker/calibration.json', 'tracker/discrepancy-watch.json', `tracker/daily/${day}.csv`]) {
      const live = strip(readFileSync(join('data/kalshi', rel), 'utf8'));
      const replayed = strip(readFileSync(join(scratch, rel), 'utf8'));
      assert.ok(replayed === live, `${rel}: replay is not faithful — ${firstDiff(live, replayed)}`);
    }
    const history = JSON.parse(readFileSync(join(scratch, 'tracker/history.json'), 'utf8'));
    const rec = history.days.find((d) => d.date === day);
    assert.ok(rec && rec.openEvents > 0 && rec.openMarketsTraded > 0 && rec.consistency.total >= 0);
    assert.equal(rec.replayedAt !== undefined, true);
    assert.equal(readdirSync(join(scratch, 'tracker/daily')).includes(`${day}.csv`), true);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('collector helpers: daily schema carries the exchange status; lifecycle and trade predicates', () => {
  assert.deepEqual(DAILY_COLUMNS.slice(0, 2), ['date', 'ticker']);
  assert.ok(DAILY_COLUMNS.includes('status') && DAILY_COLUMNS.includes('close_time') && DAILY_COLUMNS.includes('volume_24h'));
  // SYNTHETIC rows
  assert.equal(isTraded({ volume: 0, open_interest: 0 }), false);
  assert.equal(isTraded({ volume: 0, open_interest: 3 }), true);
  assert.equal(isOpenForTrading({ status: 'active' }), true);
  assert.equal(isOpenForTrading({ status: '' }), true); // unknown (first-day files) is not treated as closed
  assert.equal(isOpenForTrading({ status: 'closed' }), false);
  assert.equal(isOpenForTrading({ status: 'finalized' }), false);
  assert.equal(isUsElectionSeries({ ticker: 'KXNEXTUKPRIMEMIN', tags: ['World Elections'] }), false);
  assert.equal(isUsElectionSeries({ ticker: 'SENATE', tags: [] }), true);
  assert.equal(isUsElectionSeries(null), false);
});

