/**
 * Elections — Cross-market consistency monitor (ROADMAP R5, standing checks)
 * =====================================================================
 * Pure checks over one day's collected open events. Each finding is a
 * published data-quality observation, never an adjustment to the data.
 *
 *  C1 mutually-exclusive-sum : for events flagged mutually_exclusive by the
 *     exchange with >= 2 markets that all have two-sided books, the sum of
 *     YES midpoints should be ~1. Flag if |sum - 1| > tolerance (default 0.06 —
 *     bid/ask midpoints on N thin books can legitimately drift a few cents).
 *     Only flagged when the event's markets are all priced (no partial books),
 *     because a partially-quoted event is a coverage gap, not a contradiction.
 *  C2 crossed-book : yes_bid > yes_ask on a single market (should be impossible
 *     on a matched book).
 *  C3 stale-last-vs-book : last_price outside [yes_bid, yes_ask] by > 0.10 with
 *     a two-sided book — irregularity #2 generalised (stale last-price on the
 *     shared host).
 */

export function checkConsistency(events, { sumTolerance = 0.06, staleTolerance = 0.10 } = {}) {
  const findings = [];
  let eventsChecked = 0;
  let marketsChecked = 0;
  for (const ev of events) {
    const mkts = ev.markets || [];
    eventsChecked += 1;
    for (const m of mkts) {
      marketsChecked += 1;
      const { yes_bid: bid, yes_ask: ask, last_price: last } = m;
      if (bid !== null && ask !== null && bid > ask) {
        findings.push({ check: 'crossed-book', event_ticker: ev.event_ticker, ticker: m.ticker, yes_bid: bid, yes_ask: ask });
      }
      if (bid !== null && ask !== null && bid > 0 && ask < 1 && last !== null && last > 0) {
        const outside = last < bid - staleTolerance || last > ask + staleTolerance;
        if (outside) findings.push({ check: 'stale-last-vs-book', event_ticker: ev.event_ticker, ticker: m.ticker, yes_bid: bid, yes_ask: ask, last_price: last });
      }
    }
    if (ev.mutually_exclusive && mkts.length >= 2) {
      const twoSided = mkts.every((m) => m.yes_bid !== null && m.yes_ask !== null && m.yes_bid > 0 && m.yes_ask < 1);
      if (twoSided) {
        const sum = mkts.reduce((s, m) => s + (m.yes_bid + m.yes_ask) / 2, 0);
        if (Math.abs(sum - 1) > sumTolerance) {
          findings.push({ check: 'mutually-exclusive-sum', event_ticker: ev.event_ticker, title: ev.title, markets: mkts.length, sumOfMids: Number(sum.toFixed(4)), deviation: Number((sum - 1).toFixed(4)) });
        }
      }
    }
  }
  return {
    method: 'C1 mutually-exclusive-sum (|sum of YES mids - 1| > 0.06, fully two-sided events only); C2 crossed-book (bid > ask); C3 stale-last-vs-book (last trade > 0.10 outside the book). Findings are published, never used to alter data.',
    eventsChecked,
    marketsChecked,
    findings,
  };
}
