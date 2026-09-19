/**
 * Elections — Paper-trading contest engine (The Leap model, election markets)
 * =====================================================================
 * Reverse-engineered from TradingView's "The Leap" contest
 * (see data/sources/master.json #the-leap):
 *   - $100,000 paper capital per entrant (ONE bankroll across markets)
 *   - ranked by REALIZED P&L at the end (market settlement)
 *   - open positions force-closed at the end (here: settlement values)
 * Adapted to Kalshi election markets with the exchange's real fee
 * schedule (src/fees.js) and captured daily bars (src/kalshi-data.js).
 *
 * HONESTY RULES (enforced in code, tested):
 *   1. No invented fills: a market order fills ONLY on a date where the
 *      market has a trade (volume > 0 and non-null close), at that day's
 *      trade close. No-trade days are reported as skips.
 *   2. Partial fills only: a fill is capped at min(order size,
 *      10% of that day's bar volume).
 *   3. NO-side execution is DERIVED (reciprocal price 1 - yesClose) and
 *      labeled per fill; the raw API only published the YES side of the
 *      captured candles.
 *   4. Deterministic: pure functions of (bars, strategy, pollSignal).
 *      Same input -> byte-identical output (tested in test/).
 *   5. Attribution identity (fee-aware):
 *        finalEquity = startingCapital + realizedPnl
 *      where realizedPnl is NET of every taker fee (entry fee is carried
 *      on the position and charged at close; exit/settlement PnL deducts
 *      the exit fee). Tests recompute the identity; a breach fails the
 *      suite. feesPaid is reported separately for disclosure.
 */

import { takerFee } from '../fees.js';
import { parseBar } from '../kalshi-data.js';

export const STARTING_CAPITAL = 100000; // The Leap paper bankroll (verified)
export const FILL_CAP_OF_BAR_VOLUME = 0.10; // honesty rule #2
// The Leap requires a minimum number of active trading days to be ranked
// (verified 2026-09-18: 3 for the crypto series, 5 for futures). The crypto-
// series rule (3) is adopted here; a day counts when >= 1 entry fill happened.
export const MIN_TRADING_DAYS_TO_RANK = 3;
export const ELECTION_DAY_TS = 1730851200; // 2024-11-05T00:00:00Z

const round6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * Build the unified daily timeline for a set of markets.
 * @param {object} candlesticks CANDLESTICKS_2024 subset {ticker: {bars}}
 */
export function buildTimeline(candlesticks) {
  const byDate = new Map();
  for (const [ticker, { bars }] of Object.entries(candlesticks)) {
    for (const raw of bars) {
      const bar = parseBar(raw);
      if (!byDate.has(bar.date)) byDate.set(bar.date, {});
      byDate.get(bar.date)[ticker] = bar;
    }
  }
  return [...byDate.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([date, markets]) => ({ date, markets }));
}

/**
 * Run one strategy (one entrant) over its markets.
 * @param {object} args
 * @param {Array}  args.strategies the single strategy object
 * @param {object} args.markets    {ticker: {series, result}} subset of MARKETS_2024
 * @param {object} args.candlesticks {ticker: {bars}} subset of CANDLESTICKS_2024
 * @param {object} [args.pollSignal] {anchorDate, trumpProb, margin}
 */
export function runStrategy({ strategy, markets, candlesticks, pollSignal = null }) {
  const timeline = buildTimeline(candlesticks);
  const tickers = Object.keys(candlesticks);

  let cash = STARTING_CAPITAL;
  const positions = {}; // ticker -> { side, shares, avgCost }
  const fills = [];
  const skips = [];
  const equityCurve = [];
  const st = strategy.state ? strategy.state() : {};
  let realizedPnl = 0;
  let feesPaid = 0;

  const positionValue = (pos, yesPrice) => {
    if (!pos || pos.shares === 0) return 0;
    const px = pos.side === 'YES' ? yesPrice : 1 - yesPrice;
    return pos.shares * px;
  };
  const totalEquity = (date) => {
    let v = cash;
    for (const t of tickers) {
      const bar = date && timeline.find((d) => d.date === date)?.markets[t];
      const mark = bar && bar.price.close !== null ? bar.price.close : (positions[t] ? positions[t].avgCost : 0);
      v += positionValue(positions[t], mark);
    }
    return v;
  };

  for (let i = 0; i < timeline.length; i++) {
    const { date, markets: dayBars } = timeline[i];

    const ctx = {
      date,
      i,
      daysToSettlement: Math.round((ELECTION_DAY_TS - Math.floor(new Date(date + 'T00:00:00Z').getTime() / 1000)) / 86400),
      cash,
      equity: null, // set below
      positions,
      markets: {},
      pollSignal,
    };
    for (const t of tickers) {
      const bar = dayBars[t];
      const hist = [];
      for (let j = 0; j < i; j++) {
        const hb = timeline[j].markets[t];
        if (hb) hist.push({ date: hb.date, close: hb.price.close, volume: hb.volume, yesBidClose: hb.yesBid.close, yesAskClose: hb.yesAsk.close });
      }
      ctx.markets[t] = {
        current: bar ? { date, close: bar.price.close, volume: bar.volume, yesBid: bar.yesBid.close, yesAsk: bar.yesAsk.close, hasTrade: bar.volume > 0 && bar.price.close !== null } : null,
        history: hist,
      };
    }
    ctx.equity = totalEquity(date);

    let orders = [];
    try {
      orders = strategy.decide(ctx, st) || [];
    } catch (e) {
      throw new Error(`strategy ${strategy.name} threw on ${date}: ${e.message}`);
    }
    if (!Array.isArray(orders)) orders = [orders].filter(Boolean);

    for (const order of orders) {
      const { ticker, side, fractionOfEquity } = order;
      const bar = dayBars[ticker];
      if (!bar || bar.price.close === null || bar.volume === 0) {
        skips.push({ date, ticker, reason: 'no-trade bar — fill refused (honesty rule #1)' });
        continue;
      }
      // Pure exit: close the held position at the taker price, no re-entry.
      if (order.exit) {
        const pos = positions[ticker];
        if (pos) {
          const yesClose = bar.price.close;
          const exitPx = pos.side === 'YES' ? yesClose : 1 - yesClose;
          const exitFee = takerFee({ count: pos.shares, price: exitPx, series: markets[ticker].series });
          const proceeds = pos.shares * exitPx - exitFee;
          cash += proceeds;
          feesPaid += exitFee;
          const pnl = proceeds - pos.shares * pos.avgCost - pos.entryFee;
          realizedPnl += pnl;
          fills.push({ date, ticker, action: 'exit', side: pos.side, shares: pos.shares, price: round6(exitPx), fee: round6(exitFee), pnl: round6(pnl), executedAt: pos.side === 'YES' ? 'yesClose' : 'derived(1-yesClose)', fillCapApplied: false });
          delete positions[ticker];
        }
        continue;
      }
      const equity = totalEquity(date);
      const yesClose = bar.price.close;
      const price = side === 'YES' ? yesClose : 1 - yesClose;

      // 1) if we hold the opposite side, close it first (taker exit)
      const existing = positions[ticker];
      if (existing && existing.side !== side) {
        const exitPx = existing.side === 'YES' ? yesClose : 1 - yesClose;
        const exitFee = takerFee({ count: existing.shares, price: exitPx, series: markets[ticker].series });
        const proceeds = existing.shares * exitPx - exitFee;
        cash += proceeds;
        feesPaid += exitFee;
        const pnl = proceeds - existing.shares * existing.avgCost - existing.entryFee;
        realizedPnl += pnl;
        fills.push({ date, ticker, action: 'exit', side: existing.side, shares: existing.shares, price: round6(exitPx), fee: round6(exitFee), pnl: round6(pnl), executedAt: existing.side === 'YES' ? 'yesClose' : 'derived(1-yesClose)', fillCapApplied: false });
        delete positions[ticker];
      }

      // 2) enter / add
      const wanted = totalEquity(date) * fractionOfEquity;
      let shares = Math.floor((wanted / price) * 100) / 100;
      const cap = Math.floor(bar.volume * FILL_CAP_OF_BAR_VOLUME * 100) / 100;
      let capped = false;
      if (shares > cap) { shares = cap; capped = true; }
      if (shares * price > cash) shares = Math.floor((cash / price) * 100) / 100;
      if (shares <= 0) {
        skips.push({ date, ticker, reason: 'size rounded to zero / insufficient bankroll' });
        continue;
      }
      const fee = takerFee({ count: shares, price, series: markets[ticker].series });
      const cost = shares * price + fee;
      if (cost > cash) {
        shares = Math.floor(((cash - fee) / price) * 100) / 100;
        if (shares <= 0) { skips.push({ date, ticker, reason: 'insufficient bankroll after fee' }); continue; }
      }
      cash -= shares * price + fee;
      feesPaid += fee;
      const prev = positions[ticker];
      positions[ticker] = prev
        ? { side, shares: prev.shares + shares, avgCost: (prev.shares * prev.avgCost + shares * price) / (prev.shares + shares), entryFee: (prev.entryFee || 0) + fee }
        : { side, shares, avgCost: price, entryFee: fee };
      fills.push({ date, ticker, action: 'enter', side, shares, price: round6(price), fee: round6(fee), executedAt: side === 'YES' ? 'yesClose' : 'derived(1-yesClose)', fillCapApplied: capped, equityAfter: round6(totalEquity(date)) });
    }

    equityCurve.push({ date, equity: round6(totalEquity(date)) });
  }

  // Settlement: force-close everything at official values (The Leap: positions closed at end).
  for (const t of tickers) {
    const pos = positions[t];
    if (!pos) continue;
    const outcomeIsYes = markets[t].result === 'yes';
    const settlementPx = pos.side === 'YES' ? (outcomeIsYes ? 1 : 0) : outcomeIsYes ? 0 : 1;
    const proceeds = pos.shares * settlementPx; // no settlement fee (official schedule)
    const pnl = proceeds - pos.shares * pos.avgCost - (pos.entryFee || 0);
    cash += proceeds;
    realizedPnl += pnl;
    fills.push({ date: 'settlement', ticker: t, action: 'settlement', side: pos.side, shares: pos.shares, price: settlementPx, fee: 0, pnl: round6(pnl), executedAt: 'official result (' + markets[t].result + ')' });
    delete positions[t];
  }

  const finalEquity = round6(cash);
  const identity = round6(STARTING_CAPITAL + realizedPnl);
  const entryFills = fills.filter((f) => f.action === 'enter');
  const tradingDays = new Set(entryFills.map((f) => f.date)).size;
  const marketsTraded = new Set(entryFills.map((f) => f.ticker)).size;
  const unrankedReason = entryFills.length === 0
    ? 'no qualifying entry ever appeared in the universe (0 trades)'
    : tradingDays < MIN_TRADING_DAYS_TO_RANK ? `only ${tradingDays} active trading day(s); The Leap minimum is ${MIN_TRADING_DAYS_TO_RANK}` : null;
  return {
    username: strategy.username,
    name: strategy.name,
    thesis: strategy.thesis,
    markets: tickers,
    outcomes: Object.fromEntries(tickers.map((t) => [t, markets[t].result])),
    startingCapital: STARTING_CAPITAL,
    finalEquity,
    realizedPnl: round6(realizedPnl),
    realizedPnlPct: round6((realizedPnl / STARTING_CAPITAL) * 100),
    feesPaid: round6(feesPaid),
    attributionIdentityHolds: identity === finalEquity,
    trades: entryFills.length,
    tradingDays,
    marketsTraded,
    skips: skips.length,
    skipLog: skips,
    fillLog: fills,
    equityCurve,
    ranked: unrankedReason === null,
    unrankedReason,
  };
}
