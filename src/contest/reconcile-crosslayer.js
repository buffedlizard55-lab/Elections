/**
 * Tie each crosslayer-arb entry fill to the snapshot the strategy would have
 * traded on. Extraction and dedupe are crowdSignalsFromSnapshots — the same
 * function buildSignals uses — so a fill cannot be cited against a later
 * duplicate the entrant never saw.
 */
import { takerFee } from '../fees.js';
import { executionPrice, round6 } from './forward-engine.js';
import { crowdSignalsFromSnapshots, CROSSLAYER_ENTRY_GAP } from './strategies-forward.js';

export const CROSSLAYER_RECONCILE_METHOD = 'Crowd extraction matches buildSignals: dedupe key is asOf|question, first row wins, metaculus when it is a number else ddhq. The binding snapshot is the prior row (asOf strictly before the trading day) for that ticker with the largest absolute gap of crowdProb minus that day\'s panel mid that clears the strategy threshold. An equal absolute gap keeps the first row. The fill price is checked against the taker cross (a NO entry pays 1 - yes_bid) and the fee against takerFee on the fill\'s series.';

export function reconcileCrosslayerFills({ fills, snapshots, eligible, threshold = CROSSLAYER_ENTRY_GAP }) {
  const signals = crowdSignalsFromSnapshots(snapshots);
  const rows = [];
  for (const fill of (fills || []).filter((f) => f && f.action === 'enter')) {
    const day = eligible && eligible[fill.date];
    const entry = day && day.get(fill.ticker);
    const row = entry ? entry.row : null;
    const panelMid = row && row.mid !== null && row.mid !== undefined ? row.mid : null;
    const prior = signals.filter((s) => s.kalshiTicker === fill.ticker && s.asOf && s.asOf < fill.date);
    let binding = null;
    const candidates = [];
    for (const s of prior) {
      if (panelMid === null || typeof s.crowdProb !== 'number') {
        candidates.push({ snapshotId: s.snapshotId, asOf: s.asOf, crowdProb: s.crowdProb, clears: false });
        continue;
      }
      const gap = s.crowdProb - panelMid;
      const abs = Math.abs(gap);
      const clears = !(abs < threshold);
      candidates.push({ snapshotId: s.snapshotId, asOf: s.asOf, crowdProb: s.crowdProb, gap: round6(gap), clears });
      if (!clears) continue;
      if (!binding || abs > binding.abs) binding = { ...s, gap, abs };
    }
    const expectedPrice = row ? executionPrice(fill.side, row, 'enter') : null;
    const priceMatches = expectedPrice !== null && Math.abs(round6(expectedPrice) - Number(fill.price)) < 1e-9;
    const expectedFee = takerFee({ count: Number(fill.shares), price: Number(fill.price), series: fill.series });
    const feeMatches = Math.abs(round6(expectedFee) - Number(fill.fee)) < 1e-9;
    const expectedSide = binding ? (binding.gap > 0 ? 'YES' : 'NO') : null;
    const sideMatches = !!(binding && fill.side === expectedSide);
    const tied = !!(binding && sideMatches && priceMatches && feeMatches);
    let reason = null;
    if (!row) reason = 'ticker was not eligible on the fill date, so the captured book cannot price the fill';
    else if (panelMid === null) reason = 'the captured book has no midpoint';
    else if (!binding) reason = 'no prior snapshot cleared the gap threshold against that day\'s panel mid';
    else if (!sideMatches) reason = `fill side ${fill.side} does not match the binding gap side ${expectedSide}`;
    else if (!priceMatches) reason = `fill price ${fill.price} is not the taker cross ${expectedPrice}`;
    else if (!feeMatches) reason = `fill fee ${fill.fee} is not takerFee ${expectedFee} on series ${fill.series}`;
    rows.push({
      date: fill.date,
      ticker: fill.ticker,
      series: fill.series,
      side: fill.side,
      shares: fill.shares,
      price: fill.price,
      fee: fill.fee,
      executedAt: fill.executedAt || null,
      tied,
      reason,
      binding: binding ? {
        snapshotId: binding.snapshotId,
        question: binding.question,
        asOf: binding.asOf,
        crowdLayer: binding.crowdLayer,
        crowdProb: binding.crowdProb,
        kalshiSnapshotMid: binding.kalshiSnapshotMid,
        panelMid: round6(panelMid),
        gap: round6(binding.gap),
        expectedSide,
        expectedPrice: expectedPrice === null ? null : round6(expectedPrice),
        expectedFee,
        priceMatches,
        feeMatches,
        sideMatches,
      } : null,
      candidates,
    });
  }
  return {
    method: CROSSLAYER_RECONCILE_METHOD,
    threshold,
    entrant: 'crosslayer-arb',
    fills: rows,
    untied: rows.filter((r) => !r.tied).length,
  };
}
