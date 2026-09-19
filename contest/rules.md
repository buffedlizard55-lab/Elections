# Paper-Trading Contest — Rules (Season 1)

A Leap-style paper-trading competition on Kalshi politics/election markets.
No real money. Virtual funds only.

## 1. Model

Mechanics are adapted from TradingView's **The Leap** paper-trading competition:

| The Leap (verified mechanic) | Our adaptation |
|---|---|
| Fixed, equal virtual starting balance; no resets | $100,000.00 virtual USD per contestant; no resets |
| Simulated execution at real market prices | Paper fills at observed Kalshi snapshot prices (YES/NO binaries, $1 payout) |
| Public leaderboard | `contest/leaderboard_*.csv/json` + site leaderboard page |
| Season of about a month | Season 1: 2026-10-01 → 2026-10-31 (proposed) |
| Minimum active-trading days to qualify | 5 active days (a day counts if ≥1 fill) |
| Positions auto-closed at end; realized P&L counts | Settle at official outcomes where known, else mark to last snapshot |

Sources for The Leap mechanics: [TradingView support: What is The Leap](https://www.tradingview.com/support/solutions/43000771594-what-is-the-leap/), [edition reporting](https://www.newtrading.io/the-leap-tradingview-competition/), [edition page](https://in.tradingview.com/the-leap/february-2026-eurex/). Min-days and prizes vary by Leap edition; our choices above are this project's own rules.

## 2. Instruments

- Kalshi binary (YES/NO) event contracts in politics/elections, as collected by `scripts/fetch_kalshi.py` into `data/kalshi/markets_politics_*.json`.
- One contract pays $1.00 if its side wins, $0.00 otherwise.
- Orders: market buys of YES or NO, integer quantities. No shorting, no margin in Season 1.

## 3. Execution & pricing

- Fills execute at the snapshot's YES price (`last_price_dollars`, falling back to ask then bid). NO fills cost `1 − YES price`.
- Orders that exceed cash or reference unknown tickers are rejected and logged.
- Fees are NOT modeled in Season 1 (see `LIMITATIONS.md`).

## 4. Ranking

1. Total equity (cash + marked positions), descending.
2. Tie-break: realized P&L, then fewer trades.
3. `qualified = active_days ≥ 5`. Unqualified contestants are ranked but flagged.

## 5. Settlement

- Where an official outcome is recorded (`settlements` CSV: `ticker,outcome`), positions settle at $1/$0.
- Otherwise positions are marked to the last snapshot price at season end.
- Settlement outcomes must cite official sources (see backtest methodology).

## 6. Strategies

Contestants are project-designed strategy profiles (`contest/contestants.json`).
Each strategy's exact rules live in `scripts/paper_trading.py` (`decide()`),
so every paper trade is reproducible from the seed + snapshots.

## 7. Integrity

- All demo/simulated outputs are labeled `simulated: true`. Simulated data is never presented as market data.
- Every leaderboard links the snapshot files and settlement sources it used.
- Discrepancies (missing snapshots, ambiguous settlements) are logged in `IRREGULARITIES.md`, never silently patched.
