#!/usr/bin/env node
/**
 * Elections — 2024 per-state Senate market capture (ROADMAP R2)
 * =====================================================================
 * Enumerates Kalshi's settled 2024 Senate race markets state by state and
 * captures their daily candlesticks from the official historical tier, so the
 * 2024 market backtest grows from 3 chamber-level markets to the full set of
 * per-state race markets. Runs where general internet is available.
 *
 * Endpoints (documented; see src/kalshi-api.js header):
 *   GET /series/SENATE{ST}                                   fee config + settlement sources
 *   GET /historical/markets?series_ticker=SENATE{ST}&limit=1000
 *   GET /historical/markets/{ticker}/candlesticks?start_ts&end_ts&period_interval=1440
 *
 * Discovery is exhaustive over all 50 state codes (a state without a SENATE{ST}
 * series or without a 2024-cycle market is recorded as such — never guessed).
 * A market counts as 2024-cycle when its close_time falls in
 * [2024-11-01, 2025-02-01) — this also catches any 2024 special election.
 *
 * Candles are captured from the market's open through 2024-11-30 (covers the
 * pre-election window used by the backtest, election day itself — fixing
 * irregularity #11 — and the post-election convergence), normalised into the
 * repo's 17-field integer-cents bar layout.
 *
 * Output: data/kalshi/historical/senate-2024.json (idempotent; re-running
 * re-captures and overwrites — every object carries capturedFrom/capturedAt).
 *
 * Usage: node scripts/collect-senate-2024.mjs [--states AZ,OH,...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_BASE, getJson, paginate, normalizeBar, num, stats } from '../src/kalshi-api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const statesArg = argv.indexOf('--states') >= 0 ? argv[argv.indexOf('--states') + 1].split(',') : null;

export const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

const CYCLE_CLOSE_MIN = Date.parse('2024-11-01T00:00:00Z');
const CYCLE_CLOSE_MAX = Date.parse('2025-02-01T00:00:00Z');
const CANDLE_END_TS = Math.floor(Date.parse('2024-12-01T00:00:00Z') / 1000); // bars ending on/before 2024-11-30 midnight ET are included

const capturedAt = new Date().toISOString();

async function main() {
  const states = statesArg || US_STATES;
  const out = {
    capturedFrom: `${API_BASE}/historical/markets?series_ticker=SENATE{ST}&limit=1000 (+ /series/SENATE{ST}, + /historical/markets/{ticker}/candlesticks?period_interval=1440)`,
    capturedAt,
    capturedBy: 'scripts/collect-senate-2024.mjs',
    method: 'Exhaustive over 50 state codes; 2024-cycle = close_time in [2024-11-01, 2025-02-01); candles from open through 2024-11-30 (daily, YES side), normalised to the 17-field integer-cents layout documented in src/kalshi-data.js.',
    cycleWindow: { closeTimeMin: '2024-11-01T00:00:00Z', closeTimeMax: '2025-02-01T00:00:00Z', candleEndTs: CANDLE_END_TS },
    states: {},
    series: {},
    markets: {},
    candlesticks: {},
    errors: [],
  };

  for (const st of states) {
    const series = `SENATE${st}`;
    const rec = { series, seriesExists: null, markets2024: [], eventsSeen: [], note: '' };
    out.states[st] = rec;
    // series metadata (fee config + settlement sources)
    try {
      const s = await getJson(`${API_BASE}/series/${series}`);
      const so = s.series || s;
      rec.seriesExists = true;
      out.series[series] = {
        ticker: so.ticker, title: so.title, category: so.category, tags: so.tags || [],
        fee_type: so.fee_type, fee_multiplier: so.fee_multiplier,
        settlement_sources: (so.settlement_sources || []).map((x) => ({ name: x.name, url: x.url })),
        contract_url: so.contract_url,
        capturedFrom: `${API_BASE}/series/${series}`, capturedAt,
      };
    } catch (e) {
      if (/HTTP 404/.test(e.message)) { rec.seriesExists = false; rec.note = 'no SENATE{ST} series on the exchange'; console.log(`  ${st}: no series`); continue; }
      out.errors.push(`${series} series: ${e.message}`);
      console.error(`  ${st}: series lookup failed ${e.message}`);
      continue;
    }
    // settled markets
    let items;
    try {
      ({ items } = await paginate(`${API_BASE}/historical/markets?series_ticker=${series}&limit=1000`, 'markets', { maxPages: 20 }));
    } catch (e) {
      out.errors.push(`${series} historical/markets: ${e.message}`);
      console.error(`  ${st}: historical markets failed ${e.message}`);
      continue;
    }
    rec.eventsSeen = [...new Set(items.map((m) => m.event_ticker))].sort();
    const cycle = items.filter((m) => {
      const ct = Date.parse(m.close_time);
      return Number.isFinite(ct) && ct >= CYCLE_CLOSE_MIN && ct < CYCLE_CLOSE_MAX;
    });
    if (!cycle.length) { rec.note = items.length ? 'series exists but no market closed in the 2024 cycle window' : 'series exists but has no settled markets in the historical tier'; console.log(`  ${st}: 0 cycle markets (${items.length} settled in series)`); continue; }
    for (const m of cycle) {
      const capturedFrom = `${API_BASE}/historical/markets?series_ticker=${series}&limit=1000`;
      out.markets[m.ticker] = {
        ticker: m.ticker,
        series,
        event: m.event_ticker,
        state: st,
        title: m.title,
        subtitle: m.subtitle || '',
        yes_sub_title: m.yes_sub_title || '',
        no_sub_title: m.no_sub_title || '',
        rules_primary: m.rules_primary,
        custom_strike: m.custom_strike || null,
        openTime: m.open_time,
        closeTime: m.close_time,
        settlementTs: m.settlement_ts || null,
        expirationValue: m.expiration_value || '',
        result: m.result,
        settlementValueDollars: num(m.settlement_value_dollars),
        status: m.status,
        totalVolumeContracts: Math.round(num(m.volume_fp) || 0),
        priceLevelStructure: m.price_level_structure || '',
        capturedFrom,
        capturedAt,
      };
      rec.markets2024.push(m.ticker);
      // candlesticks
      const startTs = Math.floor(Date.parse(m.open_time) / 1000) - 86400;
      const cUrl = `${API_BASE}/historical/markets/${m.ticker}/candlesticks?start_ts=${startTs}&end_ts=${CANDLE_END_TS}&period_interval=1440`;
      try {
        const { items: candles } = await paginate(cUrl, 'candlesticks', { maxPages: 10 });
        out.candlesticks[m.ticker] = { ticker: m.ticker, capturedFrom: cUrl, capturedAt, barCount: candles.length, bars: candles.map(normalizeBar) };
      } catch (e) {
        out.errors.push(`${m.ticker} candlesticks: ${e.message}`);
        console.error(`  ${m.ticker}: candlesticks failed ${e.message}`);
      }
    }
    console.log(`  ${st}: ${cycle.length} cycle markets (${rec.eventsSeen.join(',')})`);
  }

  out.summary = {
    statesQueried: states.length,
    statesWithSeries: Object.values(out.states).filter((s) => s.seriesExists).length,
    statesWith2024Markets: Object.values(out.states).filter((s) => s.markets2024.length).length,
    markets: Object.keys(out.markets).length,
    marketsWithCandles: Object.keys(out.candlesticks).length,
    bars: Object.values(out.candlesticks).reduce((s, c) => s + c.bars.length, 0),
    api: { requests: stats.requests, retries: stats.retries, bytesDownloaded: stats.bytes },
    errors: out.errors.length,
  };
  console.log('[senate-2024] summary', JSON.stringify(out.summary));
  const dir = join(ROOT, 'data/kalshi/historical');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'senate-2024.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('[senate-2024] wrote data/kalshi/historical/senate-2024.json');
  if (out.errors.length) process.exitCode = 2;
}

main().catch((e) => { console.error('[senate-2024] fatal:', e.message); process.exit(1); });
