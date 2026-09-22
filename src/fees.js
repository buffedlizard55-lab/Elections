/**
 * Elections — Official Kalshi Fee Engine
 * =====================================================================
 * Implements the fee formula EXACTLY as published in Kalshi's official
 * Fee Schedule (PDF: https://kalshi.com/docs/kalshi-fee-schedule.pdf,
 * landing page: https://kalshi.com/fee-schedule).
 *
 * Quoted from the PDF (see sibling repo KalshiPaperSim VERIFICATION.md for
 * the full capture; formula re-verified against the same PDF):
 *
 *   "Trading fees are only charged for orders that are immediately matched
 *    with orders sitting on the orderbook. Trading fees are not charged for
 *    orders placed that are not immediately matched and are instead left as
 *    resting orders on the orderbook unless they are included in our
 *    'Maker Fees' section."
 *
 *   General (taker): fees = round up(M x 0.07   x C x P x (1-P))
 *   Maker:           fees = round up(M x 0.0175 x C x P x (1-P))
 *     P = the price of a contract in dollars (50 cents is 0.5)
 *     C = the number of contracts being traded
 *     M = the multiplier for each contract. The schedule's taker default is 1.
 *         The schedule's maker default is 0. They are not the same M.
 *     round up = rounds up such that the fee + positionCost is rounded to a
 *                centicent
 *
 * The Series object publishes one fee_multiplier. That field is the taker
 * multiplier. It is never copied onto maker M. A fee_type of
 * quadratic_with_maker_fees without an explicit maker_multiplier stays maker
 * M 0 and is labelled unstated — one observation of that type is not a rule
 * for copying the taker multiplier across.
 *
 *   "There is no settlement fee."
 *   "There is no membership fee."
 *
 * Per-series M is published by the live API on the Series object as
 * `fee_multiplier` alongside `fee_type`. The election series used by this
 * repo were captured 2026-09-18 from the official API (see
 * data/kalshi/series-fees.json for the raw captures):
 *   GET /series/PRES     -> fee_multiplier: 1, fee_type: "quadratic"
 *   GET /series/CONTROLH -> fee_multiplier: 1, fee_type: "quadratic"
 *   GET /series/CONTROLS -> fee_multiplier: 1, fee_type: "quadratic"
 */

export const KALSHI_FEES = Object.freeze({
  takerCoefficient: 0.07,
  makerCoefficient: 0.0175,
  roundingIncrement: 0.0001, // one centicent
  scheduleSource: 'https://kalshi.com/docs/kalshi-fee-schedule.pdf',
});

/**
 * Per-series fee configuration captured from the official API
 * (GET /series/{ticker}) on 2026-09-18.
 */
export const SERIES_FEE_REGISTRY = Object.freeze({
  PRES: Object.freeze({ fee_type: 'quadratic', fee_multiplier: 1, category: 'Politics', title: 'Presidential elections', capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/series/PRES', capturedAt: '2026-09-18T23:40:00Z' }),
  CONTROLH: Object.freeze({ fee_type: 'quadratic', fee_multiplier: 1, category: 'Elections', title: 'House winner', capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/series/CONTROLH', capturedAt: '2026-09-18T23:40:00Z' }),
  CONTROLS: Object.freeze({ fee_type: 'quadratic', fee_multiplier: 1, category: 'Elections', title: 'Senate winner', capturedFrom: 'https://api.elections.kalshi.com/trade-api/v2/series/CONTROLS', capturedAt: '2026-09-18T23:40:00Z' }),
});

/**
 * Round a dollar amount UP to the given increment (default: one centicent).
 * Integer arithmetic on the increment to avoid binary float drift.
 */
export function roundUpToIncrement(value, increment = KALSHI_FEES.roundingIncrement) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  const steps = Math.ceil(value / increment - 1e-9);
  return parseFloat((steps * increment).toFixed(8));
}

/**
 * Official Kalshi taker fee for C contracts at price P with series multiplier M.
 * fee = roundUpToCenticent(M * 0.07 * C * P * (1 - P))
 */
export function takerFee({ count, price, series }) {
  const C = Number(count);
  const P = Number(price);
  const M = seriesFeeConfig(series).fee_multiplier;
  if (!Number.isFinite(C) || C <= 0) return 0;
  if (!Number.isFinite(P) || P <= 0 || P >= 1) return 0;
  if (!Number.isFinite(M) || M <= 0) return 0;
  return roundUpToIncrement(M * KALSHI_FEES.takerCoefficient * C * P * (1 - P));
}

/**
 * Official Kalshi maker fee. Maker M defaults to 0. An explicit makerMultiplier
 * argument is the only way a caller overrides that; the captured taker
 * fee_multiplier is not consulted.
 * fee = roundUpToCenticent(M * 0.0175 * C * P * (1 - P))
 */
export function makerFee({ count, price, series, makerMultiplier } = {}) {
  const C = Number(count);
  const P = Number(price);
  const cfg = seriesFeeConfig(series);
  const M = makerMultiplier !== undefined
    ? Number(makerMultiplier)
    : (typeof cfg.maker_multiplier === 'number' ? cfg.maker_multiplier : 0);
  if (!Number.isFinite(C) || C <= 0) return 0;
  if (!Number.isFinite(P) || P <= 0 || P >= 1) return 0;
  if (!Number.isFinite(M) || M <= 0) return 0;
  return roundUpToIncrement(M * KALSHI_FEES.makerCoefficient * C * P * (1 - P));
}

/**
 * Additional per-series fee configs captured by the collectors (e.g. the 34
 * SENATE{ST} series from GET /series/SENATE{ST}, see
 * data/kalshi/historical/senate-2024.json). Registered at runtime so the
 * verified core registry above stays frozen and auditable.
 */
const CAPTURED_SERIES_FEES = {};

function numericMultiplier(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Register captured series fee configs.
 * A numeric fee_multiplier is accepted (the 2024 contest already passes that
 * shape). A config that only has multiplier/type is refused: skipping it used
 * to return 0 while the caller had already counted the series as captured.
 * Returns the number of series actually registered.
 */
export function registerSeriesFees(map) {
  let n = 0;
  for (const [ticker, cfg] of Object.entries(map || {})) {
    if (!cfg) continue;
    const hasLegacy = cfg.multiplier !== undefined || cfg.type !== undefined;
    const hasNumeric = numericMultiplier(cfg.fee_multiplier);
    if (!hasNumeric) {
      if (hasLegacy) {
        throw new Error(`series ${ticker}: fee config uses multiplier/type without a numeric fee_multiplier — registration would silently skip it`);
      }
      continue;
    }
    const feeType = cfg.fee_type || 'quadratic';
    const makerExplicit = numericMultiplier(cfg.maker_multiplier);
    CAPTURED_SERIES_FEES[ticker] = Object.freeze({
      fee_type: feeType,
      fee_multiplier: cfg.fee_multiplier,
      maker_multiplier: makerExplicit ? cfg.maker_multiplier : 0,
      makerMultiplierSource: makerExplicit ? 'explicit' : (feeType === 'quadratic_with_maker_fees' ? 'unstated' : 'schedule-default'),
      category: cfg.category || 'unknown',
      title: cfg.title || ticker,
      capturedFrom: cfg.capturedFrom || null,
      capturedAt: cfg.capturedAt || null,
    });
    n += 1;
  }
  return n;
}

/**
 * Resolve the taker fee configuration for a series.
 * Taker M falls back to the documented default 1 and is labelled assumed.
 * Maker M falls back to the documented default 0. A missing maker_multiplier
 * is not filled from fee_multiplier.
 */
export function seriesFeeConfig(series) {
  const hit = SERIES_FEE_REGISTRY[series] || CAPTURED_SERIES_FEES[series];
  if (hit) {
    const makerExplicit = numericMultiplier(hit.maker_multiplier);
    return Object.freeze({
      ...hit,
      maker_multiplier: makerExplicit ? hit.maker_multiplier : 0,
      makerMultiplierSource: hit.makerMultiplierSource || (makerExplicit ? 'explicit' : (hit.fee_type === 'quadratic_with_maker_fees' ? 'unstated' : 'schedule-default')),
    });
  }
  return Object.freeze({
    fee_type: 'quadratic',
    fee_multiplier: 1,
    maker_multiplier: 0,
    makerMultiplierSource: 'schedule-default',
    category: 'unknown',
    title: series,
    assumed: true,
    makerAssumed: true,
  });
}
