/**
 * Elections — Contest strategies (unique usernames + unique theses)
 * =====================================================================
 * Each strategy is an executable, deterministic decide(ctx, st) that
 * forecasts election results and trades open-market Kalshi political
 * prediction contracts on paper. The theses are TESTABLE COMPETITION
 * THEORIES: every number in data/contest-results.json is evidence for
 * or against the stated thesis. No strategy hard-codes an outcome;
 * every decision is a function of past bars (+ the labeled poll anchor).
 *
 * decide() returns an array of orders: { ticker, side: 'YES'|'NO',
 * fractionOfEquity: f } — spend f of current equity. The engine caps
 * fills at 10% of the bar's volume (honesty rule) and refuses
 * no-trade bars. An order on the opposite side of a held position
 * closes that position first (taker exit + fee).
 */

function lastClose(h) {
  for (let i = h.length - 1; i >= 0; i--) if (h[i].close !== null) return h[i].close;
  return null;
}
function closeNbarsAgo(h, n) {
  const nonNull = h.filter((x) => x.close !== null);
  if (nonNull.length <= n) return null;
  return nonNull[nonNull.length - 1 - n].close;
}
function delta(h, n) {
  const a = lastClose(h);
  const b = closeNbarsAgo(h, n);
  if (a === null || b === null) return null;
  return a - b;
}
function ma(h, n) {
  const nonNull = h.filter((x) => x.close !== null).slice(-n);
  if (nonNull.length < n) return null;
  return nonNull.reduce((s, x) => s + x.close, 0) / n;
}
function cur(ctx, ticker) {
  const m = ctx.markets[ticker];
  return m && m.current && m.current.hasTrade ? m.current.close : null;
}

export const STRATEGIES = Object.freeze([
  {
    username: 'favorite-cash',
    name: 'FavoriteHold',
    thesis: 'In the final ~75 days, heavy favorites (p>=0.65) are underpriced: the exchange\u2019s "70% means 70%" calibration claim implies fair pricing, but late news risk should command a premium markets undercharge. Buy the favorite, hold to settlement.',
    decide(ctx, st) {
      const orders = [];
      for (const [ticker, m] of Object.entries(ctx.markets)) {
        if (ctx.positions[ticker]) continue;
        const p = cur(ctx, ticker);
        if (p === null || p < 0.65) continue;
        if (ctx.daysToSettlement > 75) continue;
        orders.push({ ticker, side: 'YES', fractionOfEquity: 0.25 });
      }
      return orders;
    },
  },
  {
    username: 'longshot-lotto',
    name: 'LongshotDCA',
    thesis: 'CONTROL: longshot bias says cheap sides (0.05<=p<=0.20) are OVERpriced, so daily dollar-cost averaging them should LOSE money. If this entrant ends positive, the longshot-bias theory is wrong for these markets.',
    decide(ctx, st) {
      const orders = [];
      for (const ticker of Object.keys(ctx.markets)) {
        if (ctx.positions[ticker]) continue;
        const p = cur(ctx, ticker);
        if (p === null || p < 0.05 || p > 0.20) continue;
        orders.push({ ticker, side: 'YES', fractionOfEquity: 0.015 });
      }
      return orders;
    },
  },
  {
    username: 'momentum-mule',
    name: 'MomentumChase',
    thesis: 'In the final months, >=4pp five-day price moves are news-driven and informative: momentum continues. Enter with the move, exit on a 3pp adverse drift from the entry price.',
    state: () => ({ entries: {} }),
    decide(ctx, st) {
      const orders = [];
      for (const [ticker, m] of Object.entries(ctx.markets)) {
        const p = cur(ctx, ticker);
        if (p === null) continue;
        const entry = st.entries[ticker];
        if (!entry) {
          if (ctx.positions[ticker]) continue;
          const d5 = delta(m.history, 5);
          if (d5 === null) continue;
          if (d5 >= 0.04 && p >= 0.5) {
            st.entries[ticker] = { price: p };
            orders.push({ ticker, side: 'YES', fractionOfEquity: 0.2 });
          } else if (d5 <= -0.04 && p <= 0.5) {
            st.entries[ticker] = { price: p };
            orders.push({ ticker, side: 'NO', fractionOfEquity: 0.2 });
          }
        } else {
          const pos = ctx.positions[ticker];
          if (!pos) { delete st.entries[ticker]; continue; }
          const adverse = pos.side === 'YES' ? entry.price - p : p - entry.price;
          if (adverse >= 0.03) {
            delete st.entries[ticker];
            orders.push({ ticker, exit: true });
          }
        }
      }
      return orders;
    },
  },
  {
    username: 'fader-flipper',
    name: 'OverreactionFade',
    thesis: 'Counter to momentum: >=4pp five-day drops OVERreact to bad news and revert toward the 14-day mean. Fade the drop (buy YES), exit at the 14-day mean or hold to settlement.',
    state: () => ({ entries: {} }),
    decide(ctx, st) {
      const orders = [];
      for (const [ticker, m] of Object.entries(ctx.markets)) {
        const p = cur(ctx, ticker);
        if (p === null || p <= 0.05) continue;
        const entry = st.entries[ticker];
        if (!entry) {
          if (ctx.positions[ticker]) continue;
          const d5 = delta(m.history, 5);
          const m14 = ma(m.history, 14);
          if (d5 !== null && d5 <= -0.04 && m14 !== null && p < m14) {
            st.entries[ticker] = { mean: m14 };
            orders.push({ ticker, side: 'YES', fractionOfEquity: 0.15 });
          }
        } else {
          const pos = ctx.positions[ticker];
          if (!pos) { delete st.entries[ticker]; continue; }
          const m14 = ma(m.history, 14);
          if (m14 !== null && (p >= m14 || (entry.mean !== null && p >= entry.mean))) {
            delete st.entries[ticker];
            orders.push({ ticker, exit: true });
          }
        }
      }
      return orders;
    },
  },
  {
    username: 'poll-anchor',
    name: 'PollVsMarket',
    thesis: 'The last verified 538 national average (2024-09-12: Harris +2.82pp, i.e. Trump -2.82) implies ~35% for Trump via the logistic mapping (k=4.5, labeled assumption), while Kalshi traded Trump 50-57c. If polls still carry information the market ignores, buy the side cheap relative to the poll until the gap closes to <5pp.',
    decide(ctx, st) {
      const anchor = ctx.pollSignal;
      if (!anchor) return [];
      const ticker = 'PRES-2024-DJT';
      if (!ctx.markets[ticker]) return [];
      const p = cur(ctx, ticker);
      if (p === null) return [];
      const gap = anchor.trumpProb - p;
      const pos = ctx.positions[ticker];
      if (pos) {
        if (Math.abs(gap) < 0.05) return [{ ticker, exit: true }];
        return [];
      }
      if (gap <= -0.05) return [{ ticker, side: 'NO', fractionOfEquity: 0.3 }];
      if (gap >= 0.05) return [{ ticker, side: 'YES', fractionOfEquity: 0.3 }];
      return [];
    },
  },
  {
    username: 'yield-yak',
    name: 'LateFavoriteYield',
    thesis: 'Buy favorites at >=0.90 only in the final 14 days and collect the carry to settlement: last-minute upsets are rare, and a 90c favorite over 14 days has a strong effective annualized return relative to its risk.',
    decide(ctx, st) {
      const orders = [];
      for (const ticker of Object.keys(ctx.markets)) {
        if (ctx.positions[ticker]) continue;
        const p = cur(ctx, ticker);
        if (p === null) continue;
        if (ctx.daysToSettlement <= 14 && p >= 0.90) orders.push({ ticker, side: 'YES', fractionOfEquity: 0.35 });
      }
      return orders;
    },
  },
  {
    username: 'shock-surfer',
    name: 'VolumeShock',
    thesis: 'Days where volume is >=3x the 7-day average AND price moves >=4pp contain genuine informed flow. Enter with the shock, hold to settlement (or exit on a 3pp reversal).',
    state: () => ({ entries: {} }),
    decide(ctx, st) {
      const orders = [];
      for (const [ticker, m] of Object.entries(ctx.markets)) {
        const p = cur(ctx, ticker);
        if (p === null || !m.current) continue;
        const entry = st.entries[ticker];
        if (!entry) {
          if (ctx.positions[ticker]) continue;
          const vols = m.history.slice(-7).map((x) => x.volume);
          if (vols.length < 7) continue;
          const vol7 = vols.reduce((s, v) => s + v, 0) / 7;
          if (vol7 <= 0) continue;
          const d = p - lastClose(m.history);
          if (d === null) continue;
          if (m.current.volume >= 3 * vol7 && Math.abs(d) >= 0.04) {
            st.entries[ticker] = { price: p, side: d > 0 ? 'YES' : 'NO' };
            orders.push({ ticker, side: d > 0 ? 'YES' : 'NO', fractionOfEquity: 0.2 });
          }
        } else {
          const pos = ctx.positions[ticker];
          if (!pos) { delete st.entries[ticker]; continue; }
          const adverse = pos.side === 'YES' ? entry.price - p : p - entry.price;
          if (adverse >= 0.03) {
            delete st.entries[ticker];
            orders.push({ ticker, exit: true });
          }
        }
      }
      return orders;
    },
  },
  {
    username: 'breakout-bandit',
    name: 'FinalWeekConsensus',
    thesis: 'In the last 7 days, the side trading above 0.50 with a 7-day average above 0.52 has a stable edge: the remaining window is too short for shocks. Buy consensus, hold to settlement.',
    decide(ctx, st) {
      const orders = [];
      for (const [ticker, m] of Object.entries(ctx.markets)) {
        if (ctx.positions[ticker]) continue;
        const p = cur(ctx, ticker);
        if (p === null) continue;
        const m7 = ma(m.history, 7);
        if (ctx.daysToSettlement <= 7 && p > 0.50 && m7 !== null && m7 > 0.52) {
          orders.push({ ticker, side: 'YES', fractionOfEquity: 0.3 });
        }
      }
      return orders;
    },
  },
]);
