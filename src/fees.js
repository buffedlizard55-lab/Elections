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
 *     M = the multiplier for each contract (default is 1 unless otherwise
 *         indicated)
 *     round up = rounds up such that the fee + positionCost is rounded to a
 *                centicent
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
 * Additional per-series fee configs captured by the collectors (e.g. the 34
 * SENATE{ST} series from GET /series/SENATE{ST}, see
 * data/kalshi/historical/senate-2024.json). Registered at runtime so the
 * verified core registry above stays frozen and auditable.
 */
const CAPTURED_SERIES_FEES = {};
export function registerSeriesFees(map) {
  let n = 0;
  for (const [ticker, cfg] of Object.entries(map || {})) {
    if (!cfg || !Number.isFinite(Number(cfg.fee_multiplier))) continue;
    CAPTURED_SERIES_FEES[ticker] = Object.freeze({ fee_type: cfg.fee_type || 'quadratic', fee_multiplier: Number(cfg.fee_multiplier), category: cfg.category || 'unknown', title: cfg.title || ticker, capturedFrom: cfg.capturedFrom || null, capturedAt: cfg.capturedAt || null });
    n += 1;
  }
  return n;
}

/** Resolve the fee configuration for a series (falls back to documented default M=1, labelled). */
export function seriesFeeConfig(series) {
  const hit = SERIES_FEE_REGISTRY[series] || CAPTURED_SERIES_FEES[series];
  if (hit) return hit;
  // Documented default (PDF: "default is 1 unless otherwise indicated").
  return Object.freeze({ fee_type: 'quadratic', fee_multiplier: 1, category: 'unknown', title: series, assumed: true });
}
