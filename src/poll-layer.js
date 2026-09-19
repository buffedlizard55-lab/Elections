/**
 * Elections — 2026 poll layer helpers (ROADMAP R4)
 * =====================================================================
 * Pure functions over data/polls/poll-layer-2026.json and the collected Kalshi
 * universe (data/kalshi/universe/latest.json). Nothing here fetches or trades.
 *
 *  - marginToProb(margin, k=4.5): the same labelled logistic mapping the 2024
 *    poll backtest uses (src/poll-backtest.js) so 2024 and 2026 are comparable.
 *  - compareRacesToMarkets(layer, universe): for each state-race poll with a
 *    Kalshi event, put the poll-implied Democratic win probability next to the
 *    market-implied one (order-book midpoint, else last trade) and report the gap.
 *    Gaps are published for review; they are not a trading signal.
 */
import { impliedProb } from './kalshi-api.js';

export const LOGISTIC_K = 4.5;

export function marginToProb(marginPts, k = LOGISTIC_K) {
  if (marginPts === null || marginPts === undefined || !Number.isFinite(marginPts)) return null;
  return 1 / (1 + Math.exp(-marginPts / k));
}

/** Democratic margin in points from a stateRaces entry (D minus R); null if either side is missing. */
export function demMargin(entry) {
  const d = entry.candidates && entry.candidates.D ? entry.candidates.D.pct : null;
  const r = entry.candidates && entry.candidates.R ? entry.candidates.R.pct : null;
  if (d === null || r === null) return null;
  return d - r;
}

function marketFor(universe, eventTicker, ticker) {
  if (!universe || !Array.isArray(universe.events)) return null;
  const ev = universe.events.find((e) => e.event_ticker === eventTicker);
  if (!ev) return null;
  const m = ev.markets.find((x) => x.ticker === ticker);
  return m ? { ...m, event_title: ev.title } : null;
}

export function compareRacesToMarkets(layer, universe, { k = LOGISTIC_K } = {}) {
  const rows = [];
  for (const e of layer.stateRaces || []) {
    const margin = demMargin(e);
    const pollP = marginToProb(margin, k);
    const m = e.kalshiEvent && e.kalshiDemTicker ? marketFor(universe, e.kalshiEvent, e.kalshiDemTicker) : null;
    const mk = m ? impliedProb(m) : { p: null, basis: 'none' };
    rows.push({
      id: e.id,
      race: e.race,
      pollster: e.pollster,
      fieldDates: e.fieldDates,
      n: e.n,
      moe: e.moe,
      dem: e.candidates && e.candidates.D ? e.candidates.D.name : null,
      rep: e.candidates && e.candidates.R ? e.candidates.R.name : null,
      demPct: e.candidates && e.candidates.D ? e.candidates.D.pct : null,
      repPct: e.candidates && e.candidates.R ? e.candidates.R.pct : null,
      demMargin: margin,
      pollImpliedDemProb: pollP === null ? null : Number(pollP.toFixed(4)),
      withinMoe: margin !== null && e.moe !== null && e.moe !== undefined ? Math.abs(margin) <= e.moe : null,
      kalshiEvent: e.kalshiEvent || null,
      kalshiDemTicker: e.kalshiDemTicker || null,
      marketDemProb: mk.p === null ? null : Number(mk.p.toFixed(4)),
      marketBasis: mk.basis,
      marketDate: universe ? universe.date : null,
      gap: pollP !== null && mk.p !== null ? Number((mk.p - pollP).toFixed(4)) : null,
      source: e.source,
    });
  }
  return {
    method: `Poll-implied Democratic win probability = logistic(D minus R margin, k=${k}) — the 2024 poll-backtest mapping, labelled as a model. Market-implied = Kalshi YES mid (or last) for the Democratic-candidate market on the tracker date. gap = market - poll; positive means the market is more confident in the Democrat than the single poll's margin implies.`,
    k,
    rows,
  };
}

/** Ratings (Cook / Inside Elections) next to the Kalshi price of the non-Republican side. */
export function compareRatingsToMarkets(layer, universe) {
  const rr = layer.raceRatings;
  if (!rr) return null;
  const bands = rr.bands || {};
  const rows = [];
  for (const r of rr.senate2026 || []) {
    const m = marketFor(universe, r.kalshiEvent, r.kalshiTicker);
    const mk = m ? impliedProb(m) : { p: null, basis: 'none' };
    const p = mk.p === null ? null : Number(mk.p.toFixed(4));
    const inBand = (label) => {
      const b = bands[label];
      if (!b || p === null) return null;
      return p >= b[0] && p <= b[1];
    };
    const cookIn = inBand(r.cook);
    const insideIn = inBand(r.inside);
    rows.push({
      state: r.state, seat: r.seat, cook: r.cook, inside: r.inside,
      kalshiEvent: r.kalshiEvent, kalshiTicker: r.kalshiTicker, side: r.kalshiSide,
      candidate: m ? m.yes_sub_title : null,
      marketProb: p, marketBasis: mk.basis, marketDate: universe ? universe.date : null,
      withinCookBand: cookIn, withinInsideBand: insideIn,
      review: cookIn === false && insideIn === false,
      note: r.note || null,
    });
  }
  return {
    method: 'Market = Kalshi YES mid (or last) for the listed non-Republican candidate on the tracker date. Bands are a heuristic per rating category (see raceRatings.bands); "review" = the market sits outside BOTH publishers\' bands. Published for human review only.',
    asOf: { cook: rr.sources.cook.asOf, inside: rr.sources.inside.asOf },
    rows,
    reviewCount: rows.filter((x) => x.review).length,
  };
}
