/**
 * Elections — Live 2026 contest engine (ROADMAP R16)
 * =====================================================================
 * A forward paper-trading season on Kalshi's OPEN political/election markets.
 * Where src/contest/engine.js replays 2024 markets whose outcomes are already
 * known, this engine replays captured days of markets that have NOT settled and
 * marks the book to the captured quote. That is the difference between a
 * backtest and a competition, and it is why every published figure here is
 * labelled mark-to-market until the exchange settles the market.
 *
 * HONESTY RULES — each one is enforced in code and asserted by test:
 *   1. NO INVENTED FILLS. A fill only happens on a date where the market
 *      actually traded (volume_24h > 0) AND the day's book was two-sided.
 *      Every refusal is counted with a reason; nothing is filled at a price
 *      that was not captured.
 *   2. TAKER EXECUTION AT THE CAPTURED BOOK. A BUY YES pays `yes_ask`; a BUY NO
 *      pays `1 - yes_bid`. Exits cross the other way. The 2024 engine filled at
 *      the trade close, which quietly earned half the spread on every entry;
 *      this engine does not.
 *   3. PARTICIPATION CAP. A fill is capped at 10% of the day's volume and 10%
 *      of open interest (when it is known). `fillCapApplied` records whether the
 *      cap bound, and the cap reason is kept separately from the order reason.
 *   4. NO PHANTOM PRICES. Marking uses the captured midpoint. A one-sided or
 *      crossed book gets NO midpoint — the position is marked at its last
 *      known mark and the carry is recorded (`carriedMark: true`).
 *   5. SETTLEMENT FROM THE EXCHANGE ONLY. A position leaves the book when the
 *      captured settlements file says the exchange settled it, and it leaves at
 *      the official value. A missing settlement leaves the position open
 *      forever rather than guessing an outcome.
 *   6. FEE-AWARE ATTRIBUTION IDENTITY:
 *        netEquity = STARTING_CAPITAL + realizedPnl + unrealizedPnl
 *      An entry fee is a realized expense on the day it is paid; the closed
 *      lot's P&L is proceeds minus cost, with no second fee deduction; and
 *      unrealized P&L is mark value minus the cash paid for the position. Get
 *      any of those three wrong and the identity fails by exactly the fees —
 *      there is a test for it, and this run asserts it for every entrant.
 *   7. DETERMINISTIC. Same captures in, byte-identical artifacts out. The
 *      season is recomputed from scratch every run, so re-running a day cannot
 *      double-count a fill.
 *   8. ORDER-INDEPENDENT DEPLOYMENT. When an entrant's orders for one day
 *      exceed the day's deployment budget, every order is scaled pro-rata, so
 *      the result cannot depend on the order the markets happen to be iterated
 *      in (tested by running the same requests forwards and reversed).
 */

import { takerFee } from '../fees.js';
import { SEASON } from './forward-universe.js';

export const STARTING_CAPITAL = 100000; // $100k — The Leap's paper bankroll, derived from its official leaderboard (irregularity #74)
export const MIN_TRADING_DAYS_TO_RANK = 3; // The Leap official rules, February 2026 edition: "trading activity for at least 3 days"
export const FILL_CAP_OF_DAY_VOLUME = 0.10; // honesty rule #3
export const FILL_CAP_OF_OPEN_INTEREST = 0.10; // honesty rule #3
export const DAILY_DEPLOYMENT_OF_EQUITY = 0.20; // ADAPTATION — see the note in the season artifact

const round6 = (x) => Math.round(x * 1e6) / 1e6;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/**
 * Mark one position at a captured quote.
 * A YES position is worth the YES mid; a NO position is worth 1 - YES mid.
 * This is the single place the side conversion happens — getting it wrong here
 * silently inverts every NO mark in the season.
 */
export function sideMark(side, yesMid) {
  if (yesMid === null || yesMid === undefined) return null;
  return round6(side === 'NO' ? 1 - yesMid : yesMid);
}

/**
 * The price an entrant actually pays or receives, crossing the captured spread.
 * taker=true models every fill as a marketable order — the contest never claims
 * a maker fill, because the captured data cannot show queue position.
 */
export function executionPrice(side, row, action, taker = true) {
  if (!row || !row.twoSided) return null;
  if (action === 'enter') {
    // Buying YES crosses to the ask; buying NO crosses to (1 - bid).
    return side === 'YES' ? row.yesAsk : round6(1 - row.yesBid);
  }
  // Closing: selling YES hits the bid; selling NO hits (1 - ask).
  return side === 'YES' ? row.yesBid : round6(1 - row.yesAsk);
}

/** Participation ceiling in contracts for one market on one day. */
export function participationCap(row) {
  const byVolume = (row.volume24h || 0) * FILL_CAP_OF_DAY_VOLUME;
  const byOi = row.openInterest && row.openInterest > 0 ? row.openInterest * FILL_CAP_OF_OPEN_INTEREST : Infinity;
  return Math.min(byVolume, byOi);
}

/**
 * Per-series and per-market attribution for one entrant.
 * Entry fees are charged into realizedPnl on the day they are paid, so an
 * attribution that counted only the closed lot's P&L would double-count the
 * expense away. Both sides are applied here (regression: this once summed to
 * 25.88 against an entrant net of 23.01).
 */
export function attributeStrategy(result) {
  const buckets = new Map();
  const bucket = (key, kind) => {
    if (!buckets.has(key)) buckets.set(key, { key, kind, fills: 0, entries: 0, exits: 0, settlements: 0, openPositions: 0, realizedPnl: 0, unrealizedPnl: 0, fees: 0, notional: 0, markets: new Set() });
    return buckets.get(key);
  };
  for (const f of result.fillLog) {
    const series = result.seriesOf[f.ticker] || 'unknown';
    for (const [key, kind] of [[series, 'series'], [f.ticker, 'market']]) {
      const b = bucket(key, kind);
      b.fills += 1;
      b.fees += f.fee || 0;
      b.notional += (f.shares || 0) * (f.price || 0);
      b.markets.add(f.ticker);
      if (f.action === 'enter') { b.entries += 1; b.realizedPnl -= f.fee || 0; }
      if (f.action === 'exit') { b.exits += 1; b.realizedPnl += f.pnl || 0; }
      if (f.action === 'settlement') { b.settlements += 1; b.realizedPnl += f.pnl || 0; }
    }
  }
  // Open positions carry unrealized P&L = mark value minus the cash paid for
  // them, excluding the entry fee, which was expensed into realizedPnl on the
  // day it was paid. Subtracting it on both sides is the double-count this test
  // guards against.
  for (const pos of result.positionsFull || []) {
    for (const [key, kind] of [[pos.series, 'series'], [pos.ticker, 'market']]) {
      const b = bucket(key, kind);
      b.openPositions += 1;
      b.markets.add(pos.ticker);
      b.unrealizedPnl += pos.shares * pos.mark - pos.shares * pos.avgCost; // entry fee already in realizedPnl
    }
  }
  const finish = (list) => list
    .map((b) => ({
      key: b.key, kind: b.kind, fills: b.fills, entries: b.entries, exits: b.exits, settlements: b.settlements,
      openPositions: b.openPositions, markets: b.markets.size, fees: round6(b.fees), notional: round6(b.notional),
      realizedPnl: round6(b.realizedPnl), unrealizedPnl: round6(b.unrealizedPnl),
      net: round6(b.realizedPnl + b.unrealizedPnl),
    }))
    .sort((a, b) => (a.net - b.net) || (a.key < b.key ? -1 : 1));
  const all = [...buckets.values()];
  return { bySeries: finish(all.filter((b) => b.kind === 'series')), byMarket: finish(all.filter((b) => b.kind === 'market')) };
}

/** Provenance for the fee schedule actually applied to this season. */
export function feeProvenance(seriesConfigs) {
  const total = seriesConfigs.total || 0;
  return {
    formula: 'taker fee per order = roundUp(multiplier x 0.07 x contracts x price x (1 - price)), rounded up to the cent at whole-contract granularity',
    schedule: 'https://kalshi.com/docs/kalshi-fee-schedule.pdf',
    scheduleReadOn: '2026-09-22',
    settlementFee: 'none — the official schedule lists no settlement fee',
    seriesWithCapturedConfig: seriesConfigs.captured || 0,
    seriesUsingDocumentedDefault: seriesConfigs.assumed || 0,
    totalSeriesRegistered: total,
  };
}

/**
 * Run one entrant across the whole captured season.
 *
 * @param {object} args
 * @param {object} args.strategy  { username, name, thesis, state?, decide(ctx, st), metrics?(st) }
 * @param {object} args.universe  result of buildContestUniverse()
 * @param {object} args.settlements { ticker: { result: 'yes'|'no', settledAt, title } }
 * @param {object} args.feeConfig  per-series fee configuration (registerSeriesFees output shape)
 * @param {string} args.origin    'transferred-2024' | 'new-2026'
 */
export function runForwardStrategy({ strategy, universe, settlements, origin = 'new-2026', signalsByDate = {}, pollGate = null, ratingsGate = null }) {
  const { dates, panel, eligible } = universe;

  let cash = STARTING_CAPITAL;
  const positions = {}; // ticker -> { side, shares, avgCost, entryFee, series, lastMark, carriedMark }
  const fills = [];
  const skips = [];
  const equityCurve = [];
  const seriesOf = {};
  const st = strategy.state ? strategy.state() : {};
  let realizedPnl = 0;
  let feesPaid = 0;
  const skipReasons = {};
  let participationBound = 0;
  const note_skip = (date, ticker, reason) => {
    skips.push({ date, ticker, reason });
    skipReasons[reason] = (skipReasons[reason] || 0) + 1;
  };

  /** Value the open book. A position with no usable mark carries its last mark. */
  const openValue = (date, { mark = true } = {}) => {
    let v = 0;
    for (const [ticker, pos] of Object.entries(positions)) {
      if (!mark) { v += pos.shares * pos.lastMark; continue; }
      const row = eligible[date] && eligible[date].get(ticker) ? eligible[date].get(ticker).row : null;
      const mid = row ? row.mid : null;
      if (mid !== null) {
        pos.lastMark = sideMark(pos.side, mid);
        pos.carriedMark = false;
      } else {
        pos.carriedMark = true; // honesty rule #4: no invented midpoint
      }
      v += pos.shares * pos.lastMark;
    }
    return v;
  };

  /** Close a position at the captured book; returns the realized P&L or null when unpriceable. */
  const closePosition = ({ date, ticker, pos, reason }) => {
    const entry = eligible[date] && eligible[date].get(ticker);
    const row = entry ? entry.row : null;
    if (!row || !row.tradedToday) { note_skip(date, ticker, `exit-blocked-no-trade (${reason})`); return null; }
    const exitPx = executionPrice(pos.side, row, 'exit');
    if (exitPx === null || exitPx <= 0) { note_skip(date, ticker, `exit-blocked-no-usable-price (${reason})`); return null; }
    const exitFee = takerFee({ count: pos.shares, price: exitPx, series: pos.series });
    const proceeds = pos.shares * exitPx - exitFee;
    cash += proceeds;
    feesPaid += exitFee;
    // The ENTRY fee was already expensed into realizedPnl on the day it was
    // paid (see the entry branch), so the closed lot's P&L is proceeds minus
    // cost only. Subtracting pos.entryFee here as well charges every fee twice
    // and breaks the accounting identity — the regression test covers it.
    const pnl = proceeds - pos.shares * pos.avgCost;
    realizedPnl += pnl;
    fills.push({
      date, ticker, action: 'exit', side: pos.side, shares: pos.shares, price: round6(exitPx), fee: round6(exitFee),
      pnl: round6(pnl), reason, executedAt: pos.side === 'YES' ? 'yes_bid' : 'derived(1 - yes_ask)', series: pos.series,
    });
    delete positions[ticker];
    return pnl;
  };

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dayEligible = eligible[date];
    const daysToElection = daysBetween(date, SEASON.electionDay);
    const startEquity = round6(cash + openValue(date));

    // ---- context handed to the strategy (same shape as the 2024 engine) ----
    const markets = {};
    for (const [ticker, entry] of dayEligible.entries()) {
      const row = entry.row;
      const history = [];
      for (let j = 0; j < i; j++) {
        const hist = eligible[dates[j]].get(ticker);
        if (hist) history.push({ date: dates[j], close: hist.row.mid, volume: hist.row.volume24h, yesBidClose: hist.row.yesBid, yesAskClose: hist.row.yesAsk });
      }
      markets[ticker] = {
        series: entry.series,
        current: { date, close: row.mid, volume: row.volume24h, yesBid: row.yesBid, yesAsk: row.yesAsk, hasTrade: row.tradedToday, daysToClose: row.closeTime ? daysBetween(date, row.closeTime.slice(0, 10)) : null, openInterest: row.openInterest },
        history,
      };
    }
    // NO LOOK-AHEAD: the runner hands each day only the signal rows captured
    // strictly before it. A day with no eligible signal rows gets an empty set,
    // never yesterday's prices reused as if they were today's.
    const daySignals = signalsByDate[date] || { pollRaces: [], polls: { ratings: [] }, crossLayer: [] };
    const ctx = {
      date, i, daysToElection, daysToSettlement: daysToElection, cash, equity: startEquity, positions, markets, pollSignal: null,
      signals: { ...daySignals, lastDate: date, finalDayIndex: dates.length - 1, pollGate, ratingsGate },
    };

    let orders = [];
    try { orders = strategy.decide(ctx, st) || []; } catch (e) { throw new Error(`strategy ${strategy.username} threw on ${date}: ${e.message}`); }
    if (!Array.isArray(orders)) orders = [orders].filter(Boolean);

    // ---- pass 1: pure exits settle first (they free cash and never add risk) ----
    const entries = [];
    for (const order of orders) {
      const ticker = order.ticker;
      if (!ticker) continue;
      if (order.exit) {
        const pos = positions[ticker];
        if (pos) closePosition({ date, ticker, pos, reason: 'strategy-exit' });
        continue;
      }
      const entry = dayEligible.get(ticker);
      if (!entry) { note_skip(date, ticker, 'not-in-that-days-eligible-universe'); continue; }
      if (!positions[ticker] && !entry.row.tradedToday) { note_skip(date, ticker, 'no-trade-day-fill-refused'); continue; }
      entries.push(order);
    }

    // ---- pass 2: dedupe, size, cap ----
    // Honesty rule #8: a strategy that emits the same ticker and side twice in a
    // day is collapsed, so a strategy bug cannot manufacture a double fill.
    const byKey = new Map();
    for (const o of entries) {
      const key = `${o.ticker}|${o.side}`;
      const prev = byKey.get(key);
      if (!prev || (o.fractionOfEquity || 0) > (prev.fractionOfEquity || 0)) byKey.set(key, o);
      else note_skip(date, o.ticker, 'duplicate-order-collapsed');
    }
    const requests = [];
    for (const o of byKey.values()) {
      const entry = dayEligible.get(o.ticker);
      const row = entry.row;
      const series = entry.series; // the parsed row has no series field — it lives on the universe entry
      // A flip (opposite side of a held position) closes the old leg first.
      // Dropping it instead would silently destroy the cost basis and with it
      // the accounting identity — there is a regression test for this.
      const held = positions[o.ticker];
      if (held && held.side !== o.side) closePosition({ date, ticker: o.ticker, pos: held, reason: 'flip-closes-old-leg' });
      const price = executionPrice(o.side, row, 'enter');
      if (price === null || price <= 0 || price >= 1) { note_skip(date, o.ticker, 'no-usable-entry-price'); continue; }
      // Two strategies can legitimately emit the same ticker on the same side
      // through different signal rows; only the first order becomes a fill.
      const wanted = startEquity * (o.fractionOfEquity || 0);
      let shares = Math.floor((wanted / price) * 100) / 100;
      const cap = participationCap(row);
      let capped = false;
      if (shares > cap) { shares = Math.floor(cap * 100) / 100; capped = true; }
      if (capped) participationBound += 1;
      if (shares <= 0) { note_skip(date, o.ticker, 'size-below-participation-floor'); continue; }
      requests.push({ ...o, row, series, price, shares, capped });
    }

    // Honesty rule #8 (deployment budget): the entrant may put at most
    // DAILY_DEPLOYMENT_OF_EQUITY of start-of-day equity into NEW positions in
    // one day. Without this, the first markets in iteration order would absorb
    // the whole bankroll and the result would be an artifact of ticker sorting.
    const budget = Math.min(startEquity * DAILY_DEPLOYMENT_OF_EQUITY, Math.max(0, cash));
    const desired = requests.reduce((s, r) => s + r.shares * r.price, 0);
    const scale = desired > budget && desired > 0 ? budget / desired : 1;
    if (scale < 1) {
      for (const r of requests) {
        const scaled = Math.floor(r.shares * scale * 100) / 100;
        if (scaled < r.shares) r.capped = true;
        r.shares = scaled;
      }
    }

    // Execute in a stable order (by ticker) so two runs of the same captures
    // produce the same fills regardless of how the strategy emitted them.
    for (const r of requests.sort((a, b) => (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0))) {
      if (r.shares <= 0) { note_skip(date, r.ticker, 'size-below-participation-floor'); continue; }
      const fee = takerFee({ count: r.shares, price: r.price, series: r.series });
      let cost = r.shares * r.price + fee;
      if (cost > cash) {
        // Only the bankroll can bind here (the deployment budget is checked
        // first and is the smaller of the two by construction), so treat this
        // as a cash guard rather than a policy signal.
        const affordable = Math.floor(((cash - fee) / r.price) * 100) / 100;
        if (affordable <= 0) { note_skip(date, r.ticker, 'insufficient-bankroll-after-fee'); continue; }
        r.shares = affordable; r.capped = true;
        cost = r.shares * r.price + fee;
      }
      cash -= cost;
      feesPaid += fee;
      realizedPnl -= fee; // entry fee is expensed on the day it is paid (keeps every identity exact)
      const prev = positions[r.ticker];
      seriesOf[r.ticker] = r.series;
      positions[r.ticker] = prev && prev.side === r.side
        ? { ...prev, shares: prev.shares + r.shares, avgCost: (prev.shares * prev.avgCost + r.shares * r.price) / (prev.shares + r.shares), entryFee: (prev.entryFee || 0) + fee }
        : { side: r.side, shares: r.shares, avgCost: r.price, entryFee: fee, series: r.series, lastMark: sideMark(r.side, r.row.mid), carriedMark: r.row.mid === null };
      fills.push({
        date, ticker: r.ticker, action: 'enter', side: r.side, shares: r.shares, price: round6(r.price), fee: round6(fee),
        executedAt: r.side === 'YES' ? 'yes_ask' : 'derived(1 - yes_bid)', series: r.series, fillCapApplied: r.capped,
      });
    }

    // ---- settlement (honesty rule #5): only from the captured exchange result ----
    for (const ticker of Object.keys(positions)) {
      const s = settlements[ticker];
      if (!s || !s.result) continue;
      const pos = positions[ticker];
      const yesWon = s.result === 'yes';
      const settlementPx = pos.side === 'YES' ? (yesWon ? 1 : 0) : yesWon ? 0 : 1;
      const proceeds = pos.shares * settlementPx; // no settlement fee (official schedule)
      const pnl = proceeds - pos.shares * pos.avgCost; // entry fee already expensed at entry
      cash += proceeds;
      realizedPnl += pnl;
      fills.push({ date: 'settlement', ticker, action: 'settlement', side: pos.side, shares: pos.shares, price: settlementPx, fee: 0, pnl: round6(pnl), series: pos.series, executedAt: `official result (${s.result}) captured ${s.settledAt || 'date not recorded'}` });
      delete positions[ticker];
    }

    const marked = round6(cash + openValue(date));
    equityCurve.push({ date, cash: round6(cash), openValue: round6(marked - cash), netEquity: marked, openPositions: Object.keys(positions).length, entriesToday: fills.filter((f) => f.date === date && f.action === 'enter').length });
  }

  // Unrealized P&L is the mark minus what was paid, net of entry fees already expensed.
  let unrealizedPnl = 0;
  for (const [ticker, pos] of Object.entries(positions)) {
    const row = eligible[dates[dates.length - 1]] && eligible[dates[dates.length - 1]].get(ticker) ? eligible[dates[dates.length - 1]].get(ticker).row : null;
    const mark = row && row.mid !== null ? sideMark(pos.side, row.mid) : pos.lastMark;
    pos.lastMark = mark;
    unrealizedPnl += pos.shares * mark - pos.shares * pos.avgCost;
    seriesOf[ticker] = pos.series;
  }

  const entryFills = fills.filter((f) => f.action === 'enter');
  const tradingDays = new Set(entryFills.map((f) => f.date)).size;
  const netEquity = round6(cash + Object.entries(positions).reduce((s, [, p]) => s + p.shares * p.lastMark, 0));
  const identity = round6(STARTING_CAPITAL + realizedPnl + unrealizedPnl);
  if (identity !== round6(cash + Object.entries(positions).reduce((s, [, p]) => s + p.shares * p.lastMark, 0))) {
    throw new Error(`accounting identity broke for ${strategy.username}: capital+realized+unrealized=${identity} but cash+marks=${round6(cash + Object.entries(positions).reduce((s, [, p]) => s + p.shares * p.lastMark, 0))}. Refusing to publish a season whose own books do not balance.`);
  }
  const lastDate = dates[dates.length - 1] || null;
  const unrankedReason = dates.length < MIN_TRADING_DAYS_TO_RANK
    ? `the season has captured only ${dates.length} day(s); The Leap minimum is ${MIN_TRADING_DAYS_TO_RANK}`
    : entryFills.length === 0
      ? 'no qualifying entry appeared in the contest universe on any captured day (0 trades)'
      : tradingDays < MIN_TRADING_DAYS_TO_RANK
        ? `only ${tradingDays} active trading day(s); The Leap minimum is ${MIN_TRADING_DAYS_TO_RANK}`
        : null;

  const result = {
    username: strategy.username,
    name: strategy.name,
    thesis: strategy.thesis,
    origin,
    adapts: strategy.adapts || null,
    seriesOf,
    startDate: dates[0] || null,
    lastDate,
    capturedTradingDays: dates.length,
    startingCapital: STARTING_CAPITAL,
    cash: round6(cash),
    netEquity,
    netReturnPct: round6(((netEquity - STARTING_CAPITAL) / STARTING_CAPITAL) * 100),
    realizedPnl: round6(realizedPnl),
    unrealizedPnl: round6(unrealizedPnl),
    feesPaid: round6(feesPaid),
    accountingIdentityHolds: identity === netEquity,
    identityLegs: { startingCapital: STARTING_CAPITAL, realizedPnl: round6(realizedPnl), unrealizedPnl: round6(unrealizedPnl), sum: round6(STARTING_CAPITAL + realizedPnl + unrealizedPnl), netEquity },
    trades: entryFills.length,
    tradingDays,
    marketsTraded: new Set(entryFills.map((f) => f.ticker)).size,
    openPositions: Object.keys(positions).length,
    openPositionSample: Object.entries(positions).slice(0, 25).map(([ticker, p]) => ({ ticker, side: p.side, shares: p.shares, avgCost: round6(p.avgCost), mark: round6(p.lastMark), carriedMark: !!p.carriedMark, series: p.series })),
    // The full open book is needed to attribute unrealized P&L per series. It is
    // stripped from the published slash artifact (the sample stays) but kept here
    // so attribution reconciles to the entrant's total on every run.
    positionsFull: Object.entries(positions).map(([ticker, p]) => ({ ticker, side: p.side, shares: p.shares, avgCost: p.avgCost, mark: p.lastMark, series: p.series, carriedMark: !!p.carriedMark })),
    skips: skips.length,
    skipReasons,
    fillCount: fills.length,
    fillsCappedByParticipation: participationBound,
    fillLog: fills,
    equityCurve,
    ranked: unrankedReason === null,
    unrankedReason,
    strategyMetrics: typeof strategy.metrics === 'function'
      ? (() => { try { return strategy.metrics(st); } catch (e) { return { metricsError: e.message }; } })()
      : null,
  };
  const attr = attributeStrategy(result);
  // The attribution must explain the entrant's entire P&L, not just the closed
  // part of it, or a reader cannot trace the leaderboard to the fills.
  result.attributionReconciles = attr.bySeries.reduce((acc, b) => round6(acc + b.net), 0) === round6(netEquity - STARTING_CAPITAL);
  return { result, attribution: { attributionReconciles: result.attributionReconciles, bySeries: attr.bySeries, byMarket: attr.byMarket } };
}

export { round6 };
