/**
 * Elections — Live 2026 contest entrants (ROADMAP R16)
 * =====================================================================
 * The field is 12 entrants: unique usernames, one executable thesis each.
 *
 * SEVEN ARE TRANSFERRED UNCHANGED from the 2024 contest. Their `decide()`
 * functions are imported by reference, not re-implemented, and the test suite
 * asserts that object identity — so a silent 2026 retune of a 2024 strategy
 * fails the build. Running the same code on a new cycle is the only way the
 * 2024 result becomes an out-of-sample test rather than a fitting exercise.
 *
 * FIVE ARE NEW, and each is an election-specific, falsifiable claim whose inputs
 * are captured evidence rather than a hard-coded view:
 *
 *   poll-anchor-26   The verified poll layer and the market disagree; one is
 *                    wrong. (Reduced from 2024's single national anchor to
 *                    state races, because that is where the 2026 poll layer has
 *                    verified rows.)
 *   ratings-ratchet  Both independent publishers put a race outside the band the
 *                    market is pricing it in.
 *   crosslayer-arb   Metaculus and Kalshi disagree on the same control question.
 *   longshot-fader   The CONTROL for longshot-lotto: it sells what lotto buys.
 *                    A matched pair is the only way the pair's spread is
 *                    evidence about favourite-longshot bias rather than about
 *                    the market's direction.
 *   combo-coherence  The four mutually-exclusive, exhaustive Balance-of-Power
 *                    legs must sum to $1.00. Where they do not, and the gap
 *                    exceeds the fee, buy the cheap basket.
 *
 * THE IDENTITY GATE. `poll-anchor-26` will not place an order on a poll row
 * unless the poll's own Democratic nominee is the person the Kalshi leg
 * resolves on (exact normalised match, both legs) and the leg is not a party
 * market. This is not a nicety: before the gate existed, a poll about **Kevin**
 * Sununu produced a −0.258 "gap" against a market about **John E.** Sununu, and
 * that signal would have been traded. The refusals are published one per row.
 */

import { STRATEGIES } from './strategies.js';
import { takerFee } from '../fees.js';
import { LOGISTIC_K, marginToProb } from '../poll-layer.js';

export const TRANSFERRED_FROM_2024 = Object.freeze([
  'favorite-cash', 'longshot-lotto', 'momentum-mule', 'fader-flipper',
  'yield-yak', 'shock-surfer', 'breakout-bandit',
]);

/**
 * `poll-anchor` is deliberately NOT transferred. Its `decide()` is hard-wired to
 * `PRES-2024-DJT`, a market that does not exist in 2026, so it would sit flat for
 * the whole season and its P&L would measure the transfer harness rather than
 * the thesis. It is replaced by poll-anchor-26 and this record is published so
 * the reduced field size is explained rather than merely observed.
 */
export const EXCLUDED_FROM_FORWARD_FIELD = Object.freeze([{
  username: 'poll-anchor',
  reason: 'decide() is hard-wired to PRES-2024-DJT (a 2024 market absent from the 2026 universe); it would never place an order, so carrying it would report 0 trades and imply the thesis was tested when it was not. Superseded by poll-anchor-26.',
}]);

export const transferred = (username) => {
  const s = STRATEGIES.find((x) => x.username === username);
  if (!s) throw new Error(`no 2024 strategy named ${username}`);
  return { ...s, origin: 'transferred-2024', adapts: 'Carried unchanged from the 2024 contest field — same decide() reference, asserted by test.' };
};

// ---------------------------------------------------------------------------
// Shared helpers for the new 2026 entrants
// ---------------------------------------------------------------------------

function curMid(ctx, ticker) {
  const m = ctx.markets[ticker];
  return m && m.current && m.current.hasTrade ? m.current.close : null;
}

/** One order per ticker per day, largest conviction first. */
function bestPerTicker(orders) {
  const by = new Map();
  for (const o of orders) {
    const prev = by.get(o.ticker);
    if (!prev || Math.abs(o.conviction) > Math.abs(prev.conviction)) by.set(o.ticker, o);
  }
  return [...by.values()].map(({ conviction, ...rest }) => rest);
}

// ---------------------------------------------------------------------------
// 1. poll-anchor-26 — the verified poll layer versus the market
// ---------------------------------------------------------------------------
const POLL_ENTRY_GAP = 0.05;
const POLL_EXIT_GAP = 0.02;

const pollAnchor26 = {
  username: 'poll-anchor-26',
  name: 'StatePollVsMarket',
  origin: 'new-2026',
  state: () => ({ admittedPollRows: 0, largestAbsGapObserved: 0, daysWithAUsablePollRow: 0 }),
  thesis: `The 2026 poll layer's verified state-race margins, mapped to a win probability by the labelled logistic (k=${LOGISTIC_K}, the 2024 poll-backtest mapping — an assumption, not a measurement), disagree with the Kalshi mid by >=${POLL_ENTRY_GAP * 100}pp in 19 of 31 admitted rows. If single polls carry information the market underweights, buying the side the poll favours profits as the gap closes to <${POLL_EXIT_GAP * 100}pp. The mapping is the weak link: a wrong k produces confident, wrong gaps.`,
  state: () => ({ races: [], admitted: 0, excluded: 0, largestAbsGap: 0, rowsByDay: {} }),
  decide(ctx, st) {
    const races = ctx.signals && ctx.signals.pollRaces ? ctx.signals.pollRaces : [];
    const orders = [];
    for (const r of races) {
      const p = curMid(ctx, r.kalshiTicker);
      if (p === null) continue;
      const gap = r.pollProb - p;
      if (ctx.i === ctx.signals.finalDayIndex) {
        st.admitted = races.length;
        if (Math.abs(gap) > st.largestAbsGap) st.largestAbsGap = Math.round(Math.abs(gap) * 1e6) / 1e6;
      }
      const pos = ctx.positions[r.kalshiTicker];
      if (pos) {
        if (Math.abs(gap) < POLL_EXIT_GAP) orders.push({ ticker: r.kalshiTicker, exit: true, conviction: 0 });
        continue;
      }
      if (Math.abs(gap) < POLL_ENTRY_GAP) continue;
      orders.push({
        ticker: r.kalshiTicker,
        side: gap > 0 ? 'YES' : 'NO',
        fractionOfEquity: 0.05,
        conviction: gap,
      });
    }
    return bestPerTicker(orders);
  },
  metrics: (st) => ({
    admittedPollRows: st.admitted,
    largestAbsGapObserved: st.largestAbsGap,
    entryThresholdPp: POLL_ENTRY_GAP * 100,
    exitThresholdPp: POLL_EXIT_GAP * 100,
    note: 'Sized at 5% of start-of-day equity per race (not the 2024 strategy\'s 30%), because the 2026 universe offers tens of simultaneous races and a 30% order would consume the whole day\'s deployment budget in one market.',
  }),
};

// ---------------------------------------------------------------------------
// 2. ratings-ratchet — two independent publishers versus the market
// ---------------------------------------------------------------------------
const ratingsRatchet = {
  username: 'ratings-ratchet',
  name: 'TwoPublisherBandGap',
  origin: 'new-2026',
  thesis: 'Cook Political Report and Inside Elections rate every 2026 Senate race independently. When the Kalshi mid for the non-Republican side sits ABOVE both publishers\' bands the market is more confident than both raters; when it sits BELOW both, less. Buy the side the two bands agree on and hold. The bands are a labelled heuristic mapping (not a published probability), so a loss indicts the mapping before it indicts the publishers.',
  state: () => ({ seats: 0, movesOutsideBothBands: 0, nonOverlappingBandPairs: 0, ratedSeatsSeen: {} }),
  decide(ctx, st) {
    const ratings = ctx.signals && ctx.signals.polls ? ctx.signals.polls.ratings : [];
    const orders = [];
    for (const r of ratings) {
      const p = curMid(ctx, r.kalshiTicker);
      if (p === null) continue;
      if (ctx.i === ctx.signals.finalDayIndex) {
        st.seats = ratings.length;
        st.ratedSeatsSeen[r.state] = true;
        if (p > r.bandHigh || p < r.bandLow) st.movesOutsideBothBands += 1;
      }
      const pos = ctx.positions[r.kalshiTicker];
      const inside = p >= r.bandLow && p <= r.bandHigh;
      if (pos) {
        if (inside) orders.push({ ticker: r.kalshiTicker, exit: true, conviction: 0 });
        continue;
      }
      if (inside) continue;
      orders.push({
        ticker: r.kalshiTicker,
        side: p > r.bandHigh ? 'NO' : 'YES',
        fractionOfEquity: 0.06,
        conviction: p > r.bandHigh ? p - r.bandHigh : r.bandLow - p,
      });
    }
    return bestPerTicker(orders);
  },
  metrics: (st) => ({
    ratedSeatsAdmitted: st.seats,
    marketMovesOutsideBothBands: st.movesOutsideBothBands,
    distinctSeatsSeen: Object.keys(st.ratedSeatsSeen).length,
    note: 'The band is a heuristic interval per rating category, published by this project and labelled as such in data/polls/poll-layer-2026.json raceRatings.bands — it is NOT a Cook or Inside Elections probability, and neither publisher is being corrected by this entrant.',
  }),
};

// ---------------------------------------------------------------------------
// 3. crosslayer-arb — Metaculus versus Kalshi on the same control question
// ---------------------------------------------------------------------------
const crosslayerArb = {
  username: 'crosslayer-arb',
  name: 'LayerDisagreement',
  origin: 'new-2026',
  thesis: `Two independent aggregators of the same question — a Kalshi order book and Metaculus' community forecast — price 2026 chamber control differently (Senate: Kalshi 60c vs Metaculus 51.7% on 2026-09-19, a ${((0.60 - 0.517) * 100).toFixed(1)}pp gap). If the crowd forecast carries information the order book has not absorbed, buying the cheap layer profits when they converge. The gap must exceed fees to be a trade, and three captures of a months-long question cannot settle it.`,
  state: () => ({ questions: 0, largestGap: 0, gaps: [] }),
  decide(ctx, st) {
    const rows = ctx.signals && ctx.signals.crossLayer ? ctx.signals.crossLayer : [];
    const orders = [];
    for (const r of rows) {
      const p = curMid(ctx, r.kalshiTicker);
      if (p === null || r.crowdProb === null) continue;
      const gap = r.crowdProb - p;
      if (ctx.i === ctx.signals.finalDayIndex) {
        st.questions = rows.length;
        if (Math.abs(gap) > st.largestGap) st.largestGap = Math.round(Math.abs(gap) * 1e6) / 1e6;
        if (st.gaps.length < 8) st.gaps.push({ ticker: r.kalshiTicker, kalshiMid: p, crowdProb: r.crowdProb, gap: Math.round(gap * 1e6) / 1e6 });
      }
      const pos = ctx.positions[r.kalshiTicker];
      if (pos) {
        if (Math.abs(gap) < 0.02) orders.push({ ticker: r.kalshiTicker, exit: true, conviction: 0 });
        continue;
      }
      if (Math.abs(gap) < 0.05) continue;
      orders.push({ ticker: r.kalshiTicker, side: gap > 0 ? 'YES' : 'NO', fractionOfEquity: 0.10, conviction: gap });
    }
    return bestPerTicker(orders);
  },
  metrics: (st) => ({
    controlQuestionsWithACrowdReading: st.questions,
    largestAbsGap: st.largestGap,
    gaps: st.gaps,
    note: 'Metaculus is read from its server-rendered hub (its API requires authentication, irregularity #54), so the crowd number is a captured rendering, not a modelled one. A convergence trade on a question that resolves in February 2027 is unranked until the exchange settles it.',
  }),
};

// ---------------------------------------------------------------------------
// 4. longshot-fader — the seated control for longshot-lotto
// ---------------------------------------------------------------------------
const LONGSHOT_FADE_MAX = 0.05;

const longshotFader = {
  username: 'longshot-fader',
  name: 'ExtremeLongshotFade',
  origin: 'new-2026',
  thesis: `Favourite-longshot bias says very cheap YES contracts are overpriced, so selling them should profit. This is the SEATED CONTROL for longshot-lotto: the two run the same universe from opposite sides, and only the PAIR is evidence — if longshot-lotto loses and this gains, the bias is present; if both lose, the spread is the problem. Buys NO at every YES mid <= ${LONGSHOT_FADE_MAX}, holds to settlement. Because Kalshi has no settlement fee the asymmetry is a real one, but a taker entry on a 2c contract pays a disproportionate share of its own price in fee.`,
  state: () => ({ qualifyingMarkets: 0, meanEntryPrice: 0, entries: 0 }),
  decide(ctx, st) {
    const orders = [];
    let seen = 0;
    let pxSum = 0;
    for (const [ticker, m] of Object.entries(ctx.markets)) {
      const p = m.current && m.current.hasTrade ? m.current.close : null;
      if (p === null || p > LONGSHOT_FADE_MAX) continue;
      seen += 1;
      pxSum += p;
      if (ctx.positions[ticker]) continue;
      orders.push({ ticker, side: 'NO', fractionOfEquity: 0.01, conviction: p });
    }
    if (orders.length) {
      st.entries += orders.length;
      st.meanEntryPrice = Math.round(((st.meanEntryPrice * (st.entries - orders.length) + pxSum) / st.entries) * 1e6) / 1e6;
    }
    if (ctx.i === ctx.signals.finalDayIndex) st.qualifyingMarkets = seen;
    return bestPerTicker(orders);
  },
  metrics: (st) => ({
    qualifyingMarketsOnLastDay: st.qualifyingMarkets,
    entryOrdersPlaced: st.entries,
    meanYesMidAtEntry: st.meanEntryPrice,
  }),
};

// ---------------------------------------------------------------------------
// 5. combo-coherence — the four leg basket must cost less than the dollar it pays
// ---------------------------------------------------------------------------
/**
 * The four Balance-of-Power legs are mutually exclusive and exhaustive: exactly
 * one pays $1.00 at settlement, so a basket of all four pays exactly $1.00. If
 * the basket can be BOUGHT for less than $1.00 including fees, that is a
 * riskless profit and this entrant takes it.
 *
 * The same identity gives three pair trades, because the legs' marginals must
 * equal the chamber-control markets:
 *   P(DD) + P(DR) = P(Democrats win the House)   = CONTROLH-2026-D
 *   P(DD) + P(RD) = P(Democrats win the Senate)  = CONTROLS-2026-D
 * Buying the two legs and selling the control market (or the reverse) is a
 * perfect hedge, so the trade is a pure test of whether the complex is coherent
 * by more than the round-trip taker fee.
 */
export const COMBO_LEGS = Object.freeze([
  { key: 'DD', ticker: 'KXBALANCEPOWERCOMBO-27FEB-DD', house: 'D', senate: 'D' },
  { key: 'RR', ticker: 'KXBALANCEPOWERCOMBO-27FEB-RR', house: 'R', senate: 'R' },
  { key: 'DR', ticker: 'KXBALANCEPOWERCOMBO-27FEB-DR', house: 'D', senate: 'R' },
  { key: 'RD', ticker: 'KXBALANCEPOWERCOMBO-27FEB-RD', house: 'R', senate: 'D' },
]);
export const HOUSE_CONTROL = Object.freeze({ D: 'CONTROLH-2026-D', R: 'CONTROLH-2026-R' });
export const SENATE_CONTROL = Object.freeze({ D: 'CONTROLS-2026-D', R: 'CONTROLS-2026-R' });


const comboCoherence = {
  username: 'combo-coherence',
  name: 'MutuallyExclusiveBasket',
  origin: 'new-2026',
  thesis: 'The four Balance-of-Power legs are mutually exclusive and exhaustive, so the basket pays exactly $1.00 at settlement and the two-leg marginals must equal the chamber-control markets. Buy the basket whole when its captured ask plus the quadratic taker fee costs less than $1.00; take the marginal pair trade when the combo pair and the control market diverge by more than the round-trip fee. Any trade here is riskless by construction, so a season with no fills is itself the finding: the complex is coherent to within its own spread.',
  state: () => ({ fullBasketAttempts: 0, bestObservedEdge: null, pairAttempts: 0 }),
  decide(ctx, st) {
    const orders = [];
    const legs = COMBO_LEGS.map((l) => ({ ...l, m: ctx.markets[l.ticker] }));
    if (legs.some((l) => !l.m || !l.m.current || !l.m.current.hasTrade)) return [];
    const askSum = legs.reduce((s, l) => s + l.m.current.yesAsk, 0);
    const feeSum = legs.reduce((s, l) => s + takerFee({ count: 1, price: l.m.current.yesAsk, series: l.m.series }), 0);
    const edge = 1 - (askSum + feeSum);
    if (ctx.i === ctx.signals.finalDayIndex) {
      st.fullBasketAttempts += 1;
      st.bestObservedEdge = st.bestObservedEdge === null || edge > st.bestObservedEdge.edge
        ? { date: ctx.date, askSum: Math.round(askSum * 1e6) / 1e6, feePerContract: Math.round(feeSum * 1e6) / 1e6, edge: Math.round(edge * 1e6) / 1e6 }
        : st.bestObservedEdge;
    }
    if (edge > 0.005) {
      if (!ctx.positions[legs[0].ticker]) {
        for (const l of legs) orders.push({ ticker: l.ticker, side: 'YES', fractionOfEquity: 0.04, conviction: edge });
      }
      return bestPerTicker(orders);
    }

    // Marginal pair trades: combo pair vs the chamber-control market.
    const controlPairs = [
      { comboKeys: ['DD', 'DR'], control: HOUSE_CONTROL.D, label: 'Democrats win the House' },
      { comboKeys: ['DD', 'RD'], control: SENATE_CONTROL.D, label: 'Democrats win the Senate' },
    ];
    for (const cp of controlPairs) {
      const legMs = cp.comboKeys.map((k) => ctx.markets[COMBO_LEGS.find((l) => l.key === k).ticker]);
      const ctl = ctx.markets[cp.control];
      if (legMs.some((m) => !m || !m.current || !m.current.hasTrade) || !ctl || !ctl.current || !ctl.current.hasTrade) continue;
      const comboAsk = legMs.reduce((s, m) => s + m.current.yesAsk, 0);
      const comboBid = legMs.reduce((s, m) => s + m.current.yesBid, 0);
      const buyComboSellCtl = ctl.current.yesBid - comboAsk;   // receive the control bid, pay the combo ask
      const sellComboBuyCtl = comboBid - ctl.current.yesAsk;   // receive the combo bid, pay the control ask
      const feeEstimate = 0.07 * (comboAsk + comboBid + ctl.current.yesAsk + ctl.current.yesBid) / 2 * 0.25 * 3;
      if (ctx.i === ctx.signals.finalDayIndex) st.pairAttempts += 1;
      if (buyComboSellCtl > feeEstimate) {
        orders.push({ ticker: cp.control, side: 'NO', fractionOfEquity: 0.03, conviction: buyComboSellCtl });
        for (const k of cp.comboKeys) orders.push({ ticker: COMBO_LEGS.find((l) => l.key === k).ticker, side: 'YES', fractionOfEquity: 0.02, conviction: buyComboSellCtl });
      } else if (sellComboBuyCtl > feeEstimate) {
        orders.push({ ticker: cp.control, side: 'YES', fractionOfEquity: 0.03, conviction: sellComboBuyCtl });
        for (const k of cp.comboKeys) orders.push({ ticker: COMBO_LEGS.find((l) => l.key === k).ticker, side: 'NO', fractionOfEquity: 0.02, conviction: sellComboBuyCtl });
      }
    }
    return bestPerTicker(orders);
  },
  metrics: (st) => ({
    bestObservedEdge: st.bestObservedEdge,
    daysTheFullBasketWasPriceable: st.fullBasketAttempts,
    daysThePairTradeWasPriceable: st.pairAttempts,
    note: 'edge = 1 - (sum of the four captured asks + the quadratic taker fee per contract). Reported even when negative, because "the basket never got cheap enough" is the result this thesis is testing for.',
  }),
};

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------
export const FORWARD_FIELD = Object.freeze([
  ...TRANSFERRED_FROM_2024.map(transferred),
  pollAnchor26,
  ratingsRatchet,
  crosslayerArb,
  longshotFader,
  comboCoherence,
]);

export const FORWARD_STRATEGIES = FORWARD_FIELD;

/**
 * Identity gate for a poll row: is this poll's own Democratic nominee the person
 * the Kalshi leg resolves on, and is the leg a candidate market rather than a
 * party market? An exact normalised match on both legs, no fuzzy inference — a
 * mismatch keeps the poll as historical evidence but withholds the comparison.
 */
export function identityGate(subTitle, candidateName) {
  if (!subTitle) return { ok: false, reason: 'market carries no yes_sub_title, so the resolved question cannot be verified' };
  if (!candidateName) return { ok: false, reason: 'poll records no Democratic nominee to match against the market' };
  const norm = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const market = norm(subTitle);
  const cand = norm(candidateName);
  // A leg whose whole text is a party label resolves on the party, not a person.
  if (GENERIC_SUBTITLE_TOKENS.includes(market)) return { ok: false, reason: `market resolves on a party ("${subTitle}"), not on the polled candidate` };
  if (!cand) return { ok: false, reason: 'poll candidate name is empty after normalisation' };
  if (!market.includes(cand) && !cand.includes(market)) return { ok: false, reason: `poll candidate "${candidateName}" is not the person named on the market leg "${subTitle}"` };
  return { ok: true };
}

export const GENERIC_SUBTITLE_TOKENS = Object.freeze([
  'democraticparty', 'republicanparty', 'democrat', 'republican', 'd', 'r', 'yes', 'no',
  'democrats', 'republicans', 'party',
]);

/**
 * Turn the captured layers into the signals the 2026 entrants trade.
 * =====================================================================
 * NO LOOK-AHEAD. Every signal row carries the UTC date it was captured, and the
 * runner only hands an entrant the rows captured STRICTLY BEFORE the trading day
 * it is acting on. This matters here: the poll layer was captured
 * 2026-09-21T22:53Z, hours after that day's price panel (18:16Z), so a poll
 * signal could not have been acted on at any price in this seed. poll-anchor-26
 * and ratings-ratchet therefore trade nothing until the next capture, and that
 * is reported as a season fact rather than papered over by relaxing the rule.
 *
 * The cross-layer rows are different and legitimately same-run: each snapshot was
 * captured minutes after the price panel of its own day, on the same collector
 * pass, so the previous day's snapshot is usable the next day.
 *
 * THE IDENTITY GATE. A poll row is admitted only when the poll's own Democratic
 * nominee is the person the Kalshi leg resolves on. The runner also applies the
 * repository's canonical check (src/poll-layer.js candidateMismatch) and passes
 * any refusal in through `marketIdentity`; this function's own gate is the
 * backstop for rows the canonical check cannot decide. Both are published.
 */
export function buildSignals({ pollLayer, crossLayerRows, marketIdentity = null }) {
  const pollAsOf = isoDate(pollLayer && pollLayer.capturedAt);
  const races = [];
  const pollGate = { considered: 0, admitted: 0, excluded: [], asOf: pollAsOf };
  for (const row of (pollLayer && pollLayer.stateRaces) || []) {
    pollGate.considered += 1;
    if (row.review) { pollGate.excluded.push({ id: row.id, reason: 'poll layer carries a review flag — not traded until a human clears it' }); continue; }
    if (row.comparisonBlockedReason) { pollGate.excluded.push({ id: row.id, reason: `poll layer blocked the comparison: ${row.comparisonBlockedReason}` }); continue; }
    if (!row.kalshiDemTicker) { pollGate.excluded.push({ id: row.id, reason: 'no Kalshi market recorded for this race' }); continue; }
    const canonical = marketIdentity ? marketIdentity.get(row.id) : null;
    if (canonical) { pollGate.excluded.push({ id: row.id, reason: `repository identity check: ${canonical}` }); continue; }
    const verdict = row.marketSubTitle === undefined ? { ok: true } : identityGate(row.marketSubTitle, row.candidates && row.candidates.D ? row.candidates.D.name : null);
    if (!verdict.ok) { pollGate.excluded.push({ id: row.id, reason: verdict.reason }); continue; }
    const d = row.candidates && row.candidates.D ? row.candidates.D.pct : null;
    const r = row.candidates && row.candidates.R ? row.candidates.R.pct : null;
    if (typeof d !== 'number' || typeof r !== 'number') { pollGate.excluded.push({ id: row.id, reason: 'poll does not report both a Democratic and a Republican percentage' }); continue; }
    const margin = d - r;
    races.push({ id: row.id, race: row.race, pollster: row.pollster, kalshiTicker: row.kalshiDemTicker, margin, pollProb: Math.round(marginToProb(margin) * 1e4) / 1e4, asOf: pollAsOf });
    pollGate.admitted += 1;
  }

  const bands = (pollLayer && pollLayer.raceRatings && pollLayer.raceRatings.bands) || {};
  const ratings = [];
  const ratingsGate = { considered: 0, admitted: 0, excluded: [], asOf: pollAsOf };
  for (const row of ((pollLayer && pollLayer.raceRatings && pollLayer.raceRatings.senate2026) || [])) {
    ratingsGate.considered += 1;
    const cookBand = bands[row.cook];
    const insideBand = bands[row.inside];
    if (!cookBand || !insideBand) { ratingsGate.excluded.push({ state: row.state, reason: `no heuristic band for a rating in ("${row.cook}", "${row.inside}")` }); continue; }
    if (!row.kalshiTicker) { ratingsGate.excluded.push({ state: row.state, reason: 'no Kalshi market recorded for this seat' }); continue; }
    // The bands describe whichever side is NOT the Republican. A seat whose
    // Kalshi leg resolves on an independent (Nebraska's Osborn) is a different
    // question, so the row is refused rather than silently repriced.
    if (row.kalshiSide && row.kalshiSide !== 'D') { ratingsGate.excluded.push({ state: row.state, reason: `Kalshi leg resolves on side "${row.kalshiSide}", but the bands describe the non-Republican side — different question` }); continue; }
    ratings.push({
      state: row.state,
      kalshiTicker: row.kalshiTicker,
      cook: row.cook,
      inside: row.inside,
      bandLow: Math.min(cookBand[0], insideBand[0]),
      bandHigh: Math.max(cookBand[1], insideBand[1]),
      publishersOverlap: Math.min(cookBand[1], insideBand[1]) >= Math.max(cookBand[0], insideBand[0]),
      asOf: pollAsOf,
    });
    ratingsGate.admitted += 1;
  }

  // Cross-layer: one row per snapshot, carrying the crowd reading and the
  // Kalshi leg it belongs to. The Kalshi PRICE in the snapshot is deliberately
  // NOT the traded price — the entrant prices the current captured panel, and
  // the snapshot supplies only the independent layer's number.
  const crossLayer = [];
  const seen = new Set();
  for (const snap of (crossLayerRows || [])) {
    const k = (snap.layers && snap.layers.kalshi) || null;
    const crowd = snap.layers ? (typeof snap.layers.metaculus === 'number' ? { layer: 'metaculus', prob: snap.layers.metaculus }
      : typeof snap.layers.ddhq === 'number' ? { layer: 'ddhq', prob: snap.layers.ddhq } : null) : null;
    if (!k || !k.ticker || !crowd) continue;
    const asOf = isoDate(snap.capturedAt || snap.id);
    const key = `${asOf}|${snap.question}`;
    if (seen.has(key)) continue;
    seen.add(key);
    crossLayer.push({ question: snap.question, kalshiTicker: k.ticker, kalshiSnapshotMid: typeof k.bid === 'number' && typeof k.ask === 'number' ? Math.round(((k.bid + k.ask) / 2) * 1e6) / 1e6 : null, crowdLayer: crowd.layer, crowdProb: crowd.prob, asOf, source: snap.source || null });
  }

  return {
    pollRaces: races,
    polls: { ratings },
    crossLayer,
    pollGate,
    ratingsGate,
    ratingsBandsLabel: 'The band is a heuristic interval per rating category published by this project (data/polls/poll-layer-2026.json raceRatings.bands) and is labelled as such. It is not a Cook Political Report or Inside Elections probability, and neither publisher is corrected by this entrant.',
    k: LOGISTIC_K,
    pollCount: races.length,
    crossLayerCount: crossLayer.length,
  };
}

/** UTC date part of an ISO timestamp (or of an id that starts with one). */
export function isoDate(v) {
  if (!v) return null;
  const m = String(v).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export { pollAnchor26, ratingsRatchet, crosslayerArb, longshotFader, comboCoherence };
