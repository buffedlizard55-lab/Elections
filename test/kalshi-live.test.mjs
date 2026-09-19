import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBar, compactMarket, compactSeries, isPoliticsSeries, toCents, toMean, toInt } from '../src/kalshi-live.js';
import { CANDLESTICKS_2024 } from '../src/kalshi-data.js';

// Raw candlestick object probed LIVE from the official API on 2026-09-19
// (GET /historical/markets/PRES-2024-DJT/candlesticks?start_ts=1728000000&end_ts=1728200000&period_interval=1440).
// Verbatim, no edits:
const RAW_PROBE_2026_09_19 = {
  end_period_ts: 1728100800,
  open_interest: '151640.00',
  price: { close: '0.5000', high: '0.5100', low: '0.4900', mean: '0.4921', open: '0.4900', previous: null },
  volume: '257284.00',
  yes_ask: { close: '0.5000', high: '1.0000', low: '0.5000', open: '1.0000' },
  yes_bid: { close: '0.4900', high: '0.4900', low: '0.4900', open: '0.4900' },
};

test('normalizeBar reproduces the 2026-09-18 hand transcription EXACTLY (transcription integrity across sessions)', () => {
  const expectedFirstBar = CANDLESTICKS_2024['PRES-2024-DJT'].bars[0];
  assert.deepEqual(normalizeBar(RAW_PROBE_2026_09_19), expectedFirstBar);
});

test('verbatim converters never round away precision', () => {
  assert.equal(toCents('0.4900'), 49);
  assert.equal(toCents('1.0000'), 100);
  assert.equal(toCents(null), null);
  assert.equal(toCents(''), null);
  assert.equal(toMean('0.4921'), 4921);
  assert.equal(toInt('151640.00'), 151640);
  assert.equal(toInt('257284.00'), 257284);
});

test('compactMarket keeps only the documented snapshot fields', () => {
  const row = compactMarket({
    ticker: 'T-1', event_ticker: 'E-1', yes_sub_title: 'Outcome A',
    yes_bid_dollars: '0.5900', yes_ask_dollars: '0.6000', last_price_dollars: '0.5900',
    volume_fp: '123.00', open_interest_fp: '45.00', close_time: '2026-11-04T01:00:00Z', status: 'open',
  }, 'SERIESX');
  assert.deepEqual(Object.keys(row).sort(), ['ask', 'bid', 'close_time', 'event_ticker', 'last', 'oi', 'series', 'status', 'sub', 'ticker', 'vol']);
  assert.equal(row.series, 'SERIESX');
  assert.equal(row.bid, '0.5900'); // values kept verbatim as strings
});

test('compactSeries keeps only the documented registry fields', () => {
  const row = compactSeries({ ticker: 'SENATEAZ', title: 'Arizona Senate', category: 'Elections', categories: ['Elections'], tags: ['2026', 'US Elections'], frequency: 'custom', fee_type: 'quadratic', fee_multiplier: 1 });
  assert.deepEqual(row, { ticker: 'SENATEAZ', title: 'Arizona Senate', category: 'Elections', categories: ['Elections'], tags: ['2026', 'US Elections'], frequency: 'custom', fee_type: 'quadratic', fee_multiplier: 1 });
});

test('isPoliticsSeries uses only API-provided category/tag fields (never guesses)', () => {
  assert.equal(isPoliticsSeries({ category: 'Elections' }), true);
  assert.equal(isPoliticsSeries({ category: 'Sports', categories: ['Sports'] }), false);
  assert.equal(isPoliticsSeries({ category: 'Politics' }), true);
  assert.equal(isPoliticsSeries({ category: 'Health', tags: ['US Elections'] }), true);
  assert.equal(isPoliticsSeries({ category: 'Health', tags: ['CDC'] }), false);
  assert.equal(isPoliticsSeries({}), false);
});
