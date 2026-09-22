/**
 * Independent scan of the Balance-of-Power basket.
 * This does not call combo-coherence. The runner compares the two and refuses
 * to publish a season whose strategy metrics disagree with this scan.
 */
import { takerFee } from '../fees.js';
import { COMBO_LEGS, COMBO_CONTROL_PAIRS, COMBO_EDGE_THRESHOLD } from './strategies-forward.js';

const round6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * @param {object} args
 * @param {string[]} args.dates
 * @param {Record<string, Map<string, { series: string, row: object }>>} args.eligible
 */
export function scanComboEdges({ dates, eligible, threshold = COMBO_EDGE_THRESHOLD }) {
  const days = [];
  let best = null;
  let pairAttempts = 0;
  for (const date of dates || []) {
    const day = eligible && eligible[date];
    const legs = COMBO_LEGS.map((l) => {
      const entry = day && day.get(l.ticker);
      if (!entry || !entry.row || !entry.row.tradedToday) return null;
      return { ...l, series: entry.series, yesAsk: entry.row.yesAsk, yesBid: entry.row.yesBid };
    });
    if (legs.some((l) => !l)) {
      days.push({ date, priceable: false, reason: 'a leg was not eligible and traded' });
      continue;
    }
    const askSum = legs.reduce((s, l) => s + l.yesAsk, 0);
    const feeSum = legs.reduce((s, l) => s + takerFee({ count: 1, price: l.yesAsk, series: l.series }), 0);
    const edge = 1 - (askSum + feeSum);
    const recorded = {
      date,
      priceable: true,
      askSum: round6(askSum),
      feePerContract: round6(feeSum),
      edge: round6(edge),
      feeClears: edge > threshold,
      legs: legs.map((l) => ({ key: l.key, ticker: l.ticker, series: l.series, yesAsk: l.yesAsk })),
    };
    days.push(recorded);
    if (best === null || edge > best.edge) best = recorded;
    for (const cp of COMBO_CONTROL_PAIRS) {
      const ctl = day.get(cp.control);
      if (!ctl || !ctl.row || !ctl.row.tradedToday) continue;
      pairAttempts += 1;
    }
  }
  return {
    threshold,
    days,
    bestObservedEdge: best
      ? { date: best.date, askSum: best.askSum, feePerContract: best.feePerContract, edge: best.edge }
      : null,
    daysTheFullBasketWasPriceable: days.filter((d) => d.priceable).length,
    daysThePairTradeWasPriceable: pairAttempts,
  };
}
