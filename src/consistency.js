/**
 * Elections — Cross-market consistency monitor (ROADMAP R5, standing checks)
 * =====================================================================
 * Pure checks over one day's collected open events. Each finding is a
 * published data-quality observation, never an adjustment to the data.
 *
 *  C1 mutually-exclusive-sum-over : for events flagged mutually_exclusive by the
 *     exchange with >= 2 markets that all have two-sided books, the sum of YES
 *     midpoints cannot legitimately exceed 1 (at most one outcome can resolve
 *     YES). Flag if sum - 1 > tolerance (default 0.06 — bid/ask midpoints on N
 *     thin books can drift a few cents). Severity "high": either the flag is
 *     wrong on the exchange side or the books are inconsistent.
 *  C1b mutually-exclusive-sum-under : sum < 1 - tolerance with >= 3 markets.
 *     Severity "info": Kalshi's mutually_exclusive flag does NOT imply the listed
 *     markets are exhaustive (e.g. a nominee event that lists only 2 of many
 *     candidates), so an under-sum is usually a coverage note, not a contradiction.
 *     Observed 2026-09-19: 83 under-sum vs 46 over-sum events on the first live run.
 *  C2 crossed-book : yes_bid > yes_ask on a single market (should be impossible
 *     on a matched book). Severity "high".
 *  C3 stale-last-vs-book : last_price outside [yes_bid, yes_ask] by > 0.10 with
 *     a two-sided book — irregularity #2 generalised (stale last-price on the
 *     shared host). Severity "info" (it is why impliedProb() prefers the book).
 *
 * Findings carry `us_election` (derived series flag) and `volume` so consumers can
 * rank U.S.-election, high-volume findings first without re-reading the universe.
 */

const round4 = (x) => Number(x.toFixed(4));

export function checkConsistency(events, { sumTolerance = 0.06, staleTolerance = 0.10, underMinMarkets = 3 } = {}) {
  const findings = [];
  let eventsChecked = 0;
  let marketsChecked = 0;
  for (const ev of events) {
    const mkts = ev.markets || [];
    const usFlag = ev.us_election ? 1 : 0;
    eventsChecked += 1;
    for (const m of mkts) {
      marketsChecked += 1;
      const { yes_bid: bid, yes_ask: ask, last_price: last } = m;
      if (bid !== null && ask !== null && bid > ask) {
        findings.push({ check: 'crossed-book', severity: 'high', us_election: usFlag, event_ticker: ev.event_ticker, ticker: m.ticker, yes_bid: bid, yes_ask: ask, volume: m.volume ?? null });
      }
      if (bid !== null && ask !== null && bid > 0 && ask < 1 && last !== null && last > 0) {
        const outside = last < bid - staleTolerance || last > ask + staleTolerance;
        if (outside) findings.push({ check: 'stale-last-vs-book', severity: 'info', us_election: usFlag, event_ticker: ev.event_ticker, ticker: m.ticker, yes_bid: bid, yes_ask: ask, last_price: last, volume: m.volume ?? null });
      }
    }
    if (ev.mutually_exclusive && mkts.length >= 2) {
      const twoSided = mkts.every((m) => m.yes_bid !== null && m.yes_ask !== null && m.yes_bid > 0 && m.yes_ask < 1);
      if (twoSided) {
        const sum = mkts.reduce((s, m) => s + (m.yes_bid + m.yes_ask) / 2, 0);
        const volume = mkts.reduce((s, m) => s + (m.volume || 0), 0);
        if (sum - 1 > sumTolerance) {
          findings.push({ check: 'mutually-exclusive-sum-over', severity: 'high', us_election: usFlag, event_ticker: ev.event_ticker, title: ev.title, markets: mkts.length, sumOfMids: round4(sum), deviation: round4(sum - 1), volume });
        } else if (1 - sum > sumTolerance && mkts.length >= underMinMarkets) {
          findings.push({ check: 'mutually-exclusive-sum-under', severity: 'info', us_election: usFlag, event_ticker: ev.event_ticker, title: ev.title, markets: mkts.length, sumOfMids: round4(sum), deviation: round4(sum - 1), volume });
        }
      }
    }
  }
  const counts = {};
  for (const f of findings) counts[f.check] = (counts[f.check] || 0) + 1;
  return {
    method: `C1 mutually-exclusive-sum-over (sum of YES mids - 1 > ${sumTolerance}, fully two-sided events; high) / C1b -under (1 - sum > ${sumTolerance}, >= ${underMinMarkets} markets; info — the exchange flag does not imply an exhaustive outcome set); C2 crossed-book (bid > ask; high); C3 stale-last-vs-book (last trade > ${staleTolerance} outside the book; info). Findings are published, never used to alter data.`,
    eventsChecked,
    marketsChecked,
    counts,
    findings,
  };
}
