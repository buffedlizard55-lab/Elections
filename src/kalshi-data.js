/**
 * Elections — Verified Kalshi 2024 Election Market Captures
 * =====================================================================
 * Every bar and field below was captured verbatim from the OFFICIAL Kalshi
 * public API on 2026-09-18 (shared production host api.elections.kalshi.com,
 * which docs.kalshi.com lists as a supported production base URL).
 *
 * Endpoints captured:
 *   GET /trade-api/v2/historical/markets?series_ticker=PRES&limit=3
 *   GET /trade-api/v2/historical/markets?series_ticker=CONTROLH&limit=5
 *   GET /trade-api/v2/historical/markets?series_ticker=CONTROLS&limit=10
 *   GET /trade-api/v2/historical/markets/{ticker}/candlesticks?start_ts=..&end_ts=..&period_interval=1440
 *
 * The historical tier is required because these markets settled before the
 * historical cutoff (GET /historical/cutoff -> market_settled_ts =
 * 2026-07-20T00:00:00Z, captured 2026-09-18).
 *
 * CANDLESTICK BAR LAYOUT (column order), prices in CENTS (integers),
 * null = no trade/quote that day (exactly as returned by the API):
 *   [0] end_period_ts      (unix seconds)
 *   [1] volume             (contracts traded that day)
 *   [2..5] price OHLC       (trade prices, cents)
 *   [6]  price.mean        (dollars x 10000 — the API returns 4dp; e.g. 4921 = 0.4921)
 *   [7]  price.previous    (cents)
 *   [8..11] yes_bid OHLC   (cents)
 *   [12..15] yes_ask OHLC  (cents)
 *   [16] open_interest     (contracts, end of day)
 *
 * The engine and backtests use price.close as the taker reference price and
 * refuse to fill on bars with volume === 0 (honesty rule: no invented fills).
 */

export const HISTORICAL_CUTOFF = Object.freeze({
  market_settled_ts: '2026-07-20T00:00:00Z',
  capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/cutoff',
  capturedAt: '2026-09-18T23:33:00Z',
});

/** Market objects (settled outcomes are the exchange's own verified results). */
export const MARKETS_2024 = Object.freeze({
  'PRES-2024-DJT': Object.freeze({
    ticker: 'PRES-2024-DJT',
    series: 'PRES',
    event: 'PRES-2024',
    title: 'Will Donald Trump or another Republican win the Presidency?',
    rule: 'If Donald Trump or another representative of the Republican party is inaugurated as President for the term beginning January 20, 2025, then the market resolves to Yes.',
    settlementSource: 'Office of the Presidency (https://www.whitehouse.gov/ — series settlement source captured from GET /series/PRES)',
    openTime: '2024-10-04T12:15:00Z',
    settlementTs: '2025-01-20T18:04:06.288352Z',
    result: 'yes',
    settlementValueDollars: 1.0,
    status: 'finalized',
    totalVolumeContracts: 262334207,
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets?series_ticker=PRES&limit=3',
    capturedAt: '2026-09-18T23:32:00Z',
  }),
  'CONTROLH-2024-R': Object.freeze({
    ticker: 'CONTROLH-2024-R',
    series: 'CONTROLH',
    event: 'CONTROLH-2024',
    title: 'Will Republicans win the House?',
    rule: 'If Republicans have won control of the House in 2024, then the market resolves to Yes. Victory will be determined by the party identification of the Speaker of the House on February 1, 2025.',
    settlementSource: 'Library of Congress (https://www.congress.gov/ — series settlement source captured from GET /series/CONTROLH)',
    openTime: '2024-09-12T16:15:00Z',
    settlementTs: '2025-02-01T16:00:09.979663Z',
    result: 'yes',
    settlementValueDollars: 1.0,
    status: 'finalized',
    totalVolumeContracts: 1537259,
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets?series_ticker=CONTROLH&limit=5',
    capturedAt: '2026-09-18T23:31:00Z',
  }),
  'CONTROLH-2024-D': Object.freeze({
    ticker: 'CONTROLH-2024-D',
    series: 'CONTROLH',
    event: 'CONTROLH-2024',
    title: 'Will Democrats win the House?',
    rule: 'If Democrats have won control of the House in 2024, then the market resolves to Yes. Victory will be determined by the party identification of the Speaker of the House on February 1, 2025.',
    openTime: '2024-09-12T16:15:00Z',
    settlementTs: '2025-02-01T16:00:09.979663Z',
    result: 'no',
    settlementValueDollars: 0.0,
    status: 'finalized',
    totalVolumeContracts: 1472438,
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets?series_ticker=CONTROLH&limit=5',
    capturedAt: '2026-09-18T23:31:00Z',
  }),
  'CONTROLS-2024-R': Object.freeze({
    ticker: 'CONTROLS-2024-R',
    series: 'CONTROLS',
    event: 'CONTROLS-2024',
    title: 'Will Republicans win the Senate?',
    rule: 'If Republicans have won control of the Senate in 2024, then the market resolves to Yes. Victory will be determined by the party identification of the President pro tempore of the Senate on February 1, 2025.',
    settlementSource: 'Library of Congress (https://www.congress.gov/ — series settlement source captured from GET /series/CONTROLS)',
    openTime: '2024-09-12T16:15:00Z',
    settlementTs: '2025-02-01T16:00:09.919634Z',
    result: 'yes',
    settlementValueDollars: 1.0,
    status: 'finalized',
    totalVolumeContracts: 908243,
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets?series_ticker=CONTROLS&limit=10',
    capturedAt: '2026-09-18T23:34:00Z',
  }),
  'CONTROLS-2024-D': Object.freeze({
    ticker: 'CONTROLS-2024-D',
    series: 'CONTROLS',
    event: 'CONTROLS-2024',
    title: 'Will Democrats win the Senate?',
    rule: 'If Democrats have won control of the Senate in 2024, then the market resolves to Yes. Victory will be determined by the party identification of the President pro tempore of the Senate on February 1, 2025.',
    openTime: '2024-09-12T16:15:00Z',
    settlementTs: '2025-02-01T16:00:09.919634Z',
    result: 'no',
    settlementValueDollars: 0.0,
    status: 'finalized',
    totalVolumeContracts: 875027,
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets?series_ticker=CONTROLS&limit=10',
    capturedAt: '2026-09-18T23:34:00Z',
  }),
});

/**
 * Daily (period_interval=1440) YES-side candlesticks, transcribed field-for-field
 * from the API responses captured 2026-09-18. Layout per the file header.
 */
export const CANDLESTICKS_2024 = Object.freeze({
  'PRES-2024-DJT': Object.freeze({
    ticker: 'PRES-2024-DJT',
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets/PRES-2024-DJT/candlesticks?start_ts=1728000000&end_ts=1730851200&period_interval=1440',
    capturedAt: '2026-09-18T23:36:00Z',
    bars: Object.freeze([
      [1728100800, 257284, 49, 51, 49, 50, 4921, null, 49, 49, 49, 49, 100, 100, 50, 50, 151640],
      [1728187200, 19956, 49, 50, 49, 50, 4978, 50, 49, 49, 49, 49, 50, 50, 50, 50, 167088],
      [1728273600, 32093, 49, 50, 49, 50, 4948, 50, 49, 49, 49, 49, 50, 50, 50, 50, 171750],
      [1728360000, 353967, 50, 51, 49, 50, 4969, 50, 49, 50, 49, 50, 50, 51, 50, 51, 320170],
      [1728446400, 324480, 51, 51, 49, 51, 4985, 50, 49, 50, 49, 50, 50, 51, 50, 51, 456769],
      [1728532800, 895596, 50, 51, 49, 50, 5003, 51, 49, 50, 49, 49, 51, 51, 50, 50, 989648],
      [1728619200, 949590, 50, 53, 50, 53, 5137, 50, 49, 52, 49, 52, 50, 53, 50, 53, 1367963],
      [1728705600, 985158, 53, 53, 52, 53, 5250, 53, 52, 52, 51, 52, 50, 53, 50, 53, 1890797],
      [1728792000, 148080, 53, 54, 52, 54, 5331, 53, 52, 53, 52, 53, 53, 54, 53, 54, 1974256],
      [1728878400, 93402, 54, 54, 53, 54, 5371, 54, 53, 53, 53, 53, 54, 54, 54, 54, 2005384],
      [1728964800, 277400, 54, 55, 53, 55, 5419, 54, 53, 54, 53, 54, 54, 55, 54, 55, 2250559],
      [1729051200, 3717812, 55, 57, 54, 57, 5542, 55, 54, 56, 54, 56, 55, 57, 55, 57, 3766640],
      [1729137600, 2689220, 57, 58, 54, 56, 5576, 57, 56, 57, 54, 55, 55, 58, 55, 56, 4926161],
      [1729224000, 3379510, 56, 58, 55, 58, 5645, 56, 55, 57, 55, 57, 56, 58, 56, 58, 6773409],
      [1729310400, 3216683, 58, 59, 56, 58, 5740, 58, 56, 58, 56, 57, 57, 59, 57, 58, 8145275],
      [1729396800, 1023130, 58, 59, 56, 56, 5753, 58, 56, 58, 56, 56, 57, 59, 57, 57, 8026446],
      [1729483200, 1126022, 56, 58, 56, 58, 5672, 56, 56, 57, 56, 57, 57, 57, 57, 58, 8633360],
      [1729569600, 4790141, 58, 61, 56, 61, 5746, 58, 57, 60, 56, 60, 58, 61, 57, 61, 10438541],
      [1729656000, 4360010, 61, 61, 58, 60, 5993, 61, 58, 60, 58, 59, 61, 61, 59, 60, 11230733],
      [1729742400, 3635392, 59, 61, 56, 59, 5885, 60, 59, 60, 56, 58, 60, 61, 57, 59, 12099258],
      [1729828800, 5561760, 59, 63, 57, 62, 6103, 59, 58, 62, 57, 61, 59, 63, 58, 62, 14293553],
      [1729915200, 4728207, 62, 63, 60, 61, 6190, 62, 61, 62, 60, 60, 62, 63, 61, 61, 15811972],
      [1730001600, 1207238, 61, 63, 60, 62, 6118, 61, 60, 62, 60, 62, 61, 63, 61, 63, 16729864],
      [1730088000, 1904280, 62, 63, 61, 63, 6222, 62, 61, 62, 61, 62, 62, 63, 62, 63, 17267834],
      [1730174400, 2790825, 63, 63, 61, 62, 6252, 63, 61, 62, 61, 61, 63, 63, 62, 62, 18988359],
      [1730260800, 7151031, 62, 66, 61, 62, 6368, 62, 61, 65, 60, 61, 62, 66, 61, 62, 20957403],
      [1730347200, 5205974, 62, 64, 58, 59, 6184, 62, 61, 63, 57, 58, 62, 64, 58, 59, 24337728],
      [1730433600, 10604350, 59, 62, 56, 58, 5924, 59, 58, 61, 56, 57, 58, 62, 57, 58, 32014024],
      [1730520000, 10687749, 58, 59, 53, 56, 5546, 58, 57, 58, 53, 55, 58, 59, 54, 56, 36775723],
      [1730606400, 8860634, 56, 57, 47, 49, 5299, 56, 55, 56, 47, 49, 56, 57, 48, 50, 39798132],
      [1730692800, 469, 53, 53, 53, 53, 5300, null, 52, 52, 52, 52, 53, 53, 53, 53, 43714165],
      [1730782800, 20497706, 53, 59, 52, 57, 5608, null, 52, 58, 52, 56, 53, 59, 53, 57, 58458606],
    ]),
  }),
  'CONTROLH-2024-R': Object.freeze({
    ticker: 'CONTROLH-2024-R',
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets/CONTROLH-2024-R/candlesticks?start_ts=1726099200&end_ts=1730851200&period_interval=1440',
    capturedAt: '2026-09-18T23:35:00Z',
    bars: Object.freeze([
      [1726200000, 15000, 35, 38, 35, 37, 3667, null, 34, 37, 0, 36, 100, 100, 35, 38, 15000],
      [1727928000, 0, null, null, null, null, null, 37, 36, 37, 0, 36, 38, 100, 38, 39, 15000],
      [1728014400, 0, null, null, null, null, null, 37, 36, 36, 36, 36, 39, 39, 39, 39, 15000],
      [1728100800, 0, null, null, null, null, null, 37, 36, 37, 0, 36, 39, 100, 39, 39, 15000],
      [1728360000, 0, null, null, null, null, null, 37, 36, 36, 36, 36, 39, 39, 39, 39, 15000],
      [1728446400, 0, null, null, null, null, null, 37, 36, 38, 36, 37, 39, 39, 39, 39, 15000],
      [1728532800, 10000, 39, 40, 39, 40, 3950, 37, 37, 43, 37, 43, 39, 99, 39, 45, 20000],
      [1728619200, 0, null, null, null, null, null, 40, 43, 44, 40, 40, 45, 100, 45, 100, 20000],
      [1728705600, 0, null, null, null, null, null, 40, 40, 44, 40, 43, 100, 100, 46, 46, 20000],
      [1729051200, 0, null, null, null, null, null, 40, 43, 44, 43, 44, 46, 46, 46, 46, 20000],
      [1729137600, 10000, 46, 46, 46, 46, 4600, 40, 44, 45, 44, 45, 46, 46, 46, 46, 25000],
      [1729224000, 20000, 47, 50, 47, 49, 4825, 46, 45, 50, 45, 49, 46, 53, 46, 50, 30000],
      [1729310400, 5000, 49, 49, 49, 49, 4900, 49, 49, 49, 49, 49, 50, 54, 50, 51, 25000],
      [1729396800, 0, null, null, null, null, null, 49, 49, 49, 49, 49, 50, 51, 50, 51, 25000],
      [1729569600, 30000, 50, 52, 50, 52, 5067, 49, 49, 50, 49, 49, 50, 53, 50, 51, 55000],
      [1729656000, 10000, 50, 52, 50, 52, 5100, 52, 49, 50, 49, 49, 51, 60, 50, 51, 60000],
      [1729742400, 20000, 50, 51, 50, 51, 5075, 52, 49, 50, 49, 50, 51, 53, 51, 52, 75000],
      [1729915200, 5000, 52, 52, 52, 52, 5200, 51, 49, 51, 49, 50, 52, 53, 52, 53, 80000],
      [1730001600, 0, null, null, null, null, null, 52, 50, 50, 49, 50, 53, 99, 51, 52, 80000],
      [1730088000, 0, null, null, null, null, null, 52, 50, 52, 49, 52, 52, 55, 52, 54, 80000],
      [1730174400, 5784, 53, 53, 50, 53, 5038, 52, 52, 52, 50, 50, 54, 54, 52, 53, 75635],
      [1730260800, 77241, 53, 57, 50, 57, 5370, 53, 50, 55, 49, 54, 53, 65, 52, 57, 122030],
      [1730347200, 63961, 57, 58, 53, 58, 5560, 57, 54, 55, 53, 54, 55, 58, 55, 58, 176810],
      [1730433600, 11518, 57, 58, 53, 54, 5687, 58, 54, 56, 53, 53, 58, 59, 54, 54, 187043],
      [1730520000, 44200, 54, 54, 40, 52, 5269, 54, 53, 53, 40, 49, 54, 54, 48, 51, 183514],
      [1730606400, 3772, 51, 52, 48, 51, 5085, 52, 49, 49, 46, 49, 50, 52, 50, 51, 186491],
      [1730692800, 212, 47, 47, 47, 47, 4700, null, 46, 46, 46, 46, 47, 47, 47, 47, 194374],
      [1730782800, 52948, 46, 52, 41, 49, 4800, null, 45, 49, 41, 48, 47, 52, 44, 50, 225894],
    ]),
  }),
  'CONTROLS-2024-R': Object.freeze({
    ticker: 'CONTROLS-2024-R',
    capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/historical/markets/CONTROLS-2024-R/candlesticks?start_ts=1726099200&end_ts=1730851200&period_interval=1440',
    capturedAt: '2026-09-18T23:37:00Z',
    bars: Object.freeze([
      [1726200000, 5000, 75, 75, 75, 75, 7500, null, 78, 78, 0, 74, 100, 100, 75, 75, 5000],
      [1727928000, 0, null, null, null, null, null, 75, 74, 74, 0, 71, 75, 100, 73, 74, 5000],
      [1728014400, 15000, 73, 73, 73, 73, 7300, 75, 71, 73, 71, 71, 74, 74, 73, 74, 15000],
      [1728100800, 0, null, null, null, null, null, 73, 71, 73, 41, 71, 74, 74, 72, 73, 15000],
      [1728273600, 0, null, null, null, null, null, 73, 71, 72, 71, 72, 73, 73, 73, 73, 15000],
      [1728360000, 0, null, null, null, null, null, 73, 72, 73, 72, 73, 73, 74, 73, 74, 15000],
      [1728446400, 5000, 74, 74, 74, 74, 7400, 73, 73, 73, 73, 73, 74, 74, 74, 74, 20000],
      [1728532800, 5000, 74, 74, 74, 74, 7400, 74, 73, 73, 73, 73, 74, 74, 74, 74, 15000],
      [1728619200, 10000, 74, 74, 74, 74, 7400, 74, 73, 76, 1, 1, 74, 98, 74, 98, 15000],
      [1728705600, 0, null, null, null, null, null, 74, 1, 76, 1, 76, 98, 98, 78, 78, 15000],
      [1728878400, 10000, 78, 78, 78, 78, 7800, 74, 76, 77, 76, 77, 78, 80, 78, 79, 25000],
      [1728964800, 5000, 79, 79, 79, 79, 7900, 78, 77, 78, 77, 78, 79, 80, 79, 80, 30000],
      [1729051200, 30000, 79, 80, 79, 80, 7967, 79, 78, 80, 78, 80, 80, 98, 79, 81, 60000],
      [1729137600, 10000, 81, 82, 81, 82, 8150, 80, 80, 82, 80, 81, 81, 83, 81, 83, 70000],
      [1729224000, 15000, 82, 82, 82, 82, 8200, 82, 81, 82, 78, 80, 83, 83, 81, 82, 75000],
      [1729310400, 0, null, null, null, null, null, 82, 80, 80, 80, 80, 81, 82, 81, 82, 75000],
      [1729483200, 0, null, null, null, null, null, 82, 80, 81, 80, 81, 82, 82, 82, 82, 75000],
      [1729569600, 0, null, null, null, null, null, 82, 81, 83, 81, 83, 82, 85, 82, 84, 75000],
      [1729656000, 0, null, null, null, null, null, 82, 83, 83, 83, 83, 84, 85, 84, 85, 75000],
      [1729742400, 0, null, null, null, null, null, 82, 83, 85, 83, 85, 85, 86, 85, 86, 75000],
      [1729828800, 10000, 85, 85, 85, 85, 8500, 82, 85, 85, 84, 84, 86, 86, 85, 86, 85000],
      [1729915200, 0, null, null, null, null, null, 85, 84, 84, 84, 84, 86, 86, 86, 86, 85000],
      [1730001600, 15000, 84, 85, 84, 85, 8467, 85, 84, 85, 84, 84, 86, 98, 85, 87, 90000],
      [1730174400, 7196, 85, 86, 84, 86, 8499, 85, 84, 85, 84, 85, 87, 87, 85, 86, 92173],
      [1730260800, 33955, 86, 86, 84, 86, 8506, 86, 85, 85, 84, 84, 85, 86, 85, 86, 126059],
      [1730347200, 37070, 86, 86, 82, 84, 8451, 86, 82, 84, 82, 82, 86, 86, 84, 84, 162497],
      [1730433600, 34396, 84, 97, 80, 85, 8566, 84, 82, 83, 80, 82, 82, 97, 82, 85, 185883],
      [1730520000, 25186, 85, 85, 82, 83, 8355, 85, 81, 83, 81, 82, 83, 86, 83, 84, 204605],
      [1730606400, 6045, 82, 84, 79, 82, 8192, 83, 82, 83, 79, 79, 84, 84, 81, 82, 208298],
      [1730692800, 126, 79, 79, 79, 79, 7900, null, 78, 78, 78, 78, 79, 79, 79, 79, 213987],
      [1730782800, 31412, 78, 83, 77, 83, 8141, null, 77, 82, 77, 81, 79, 83, 78, 83, 241067],
    ]),
  }),
});

/**
 * Convert a raw bar (cents layout) to a typed object.
 *
 * DATE LABEL: Kalshi's daily bars end at midnight EASTERN (verified: every
 * captured end_period_ts lands on 04:00Z during EDT and 05:00Z during EST,
 * i.e. exactly the DST transition on 2024-11-03). A bar that ends at
 * midnight ET covers the day that just ended, so the trading-day label is
 * the America/New_York calendar date of (endPeriodTs - 1 day).
 */
export function parseBar(raw) {
  const [ts, vol, po, ph, pl, pc, pm, pp, bo, bh, bl, bc, ao, ah, al, ac, oi] = raw;
  const c = (v) => (v === null ? null : v / 100);
  return {
    endPeriodTs: ts,
    date: new Date((ts - 86400) * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    volume: vol,
    price: { open: c(po), high: c(ph), low: c(pl), close: c(pc), mean: pm === null ? null : pm / 10000, previous: c(pp) },
    yesBid: { open: c(bo), high: c(bh), low: c(bl), close: c(bc) },
    yesAsk: { open: c(ao), high: c(ah), low: c(al), close: c(ac) },
    openInterest: oi,
  };
}
