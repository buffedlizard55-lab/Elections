# Elections — collect, analyze, project &amp; estimate

**A verification-first election intelligence project.** Free, public, official data only.
Backtests **polls and prediction markets** against **verified official outcomes**, flags every
irregularity it finds, and runs a **paper-trading forecasting contest** (reverse-engineered from
TradingView's [The Leap](https://www.tradingview.com/the-leap/crypto-series-may-2026/)) on Kalshi's
open political/election markets.

🌐 **Live site (GitHub Pages):** https://buffedlizard55-lab.github.io/Elections/

## What's here

| Path | What it is |
|---|---|
| `index.html` + `src/site/` | Static site (GitHub Pages, main branch root): overview, 2026 live markets, backtests, contest, sources, irregularities, methodology, roadmap |
| `data/kalshi/` | Captured Kalshi data: 2026-09-18 live-market snapshot; settled 2024 markets live in `src/kalshi-data.js` with per-bar provenance |
| `data/sources/master.json` | **Master source list — 32 verified entries**, each with a manual-review link and a line-by-line verification note |
| `data/outcomes/verified-outcomes.json` | Verified official outcomes (2020/2024 presidency, 2024 Senate & House control) with per-claim sources and Kalshi-settlement cross-checks (all PASS) |
| `data/polls/` | 538's archived national averages (verbatim GitHub copy + provenance) and line-by-line verified individual polls |
| `data/backtest-results.json` | Market calibration (Brier/log-loss/hold-PnL at T-1…T-60) + poll-vs-market-vs-outcome (generated) |
| `data/contest-results.json` | Paper-trading contest: 8 entrants, $100k each, Kalshi's real fees, 2024 universe (generated) |
| `data/irregularities.json` | 12 flagged irregularities/discrepancies with severities and actions |
| `src/` | Zero-dependency Node engines: fee schedule, market backtests, poll backtest, contest engine + strategies, no-fabrication lint |
| `scripts/` | `run-backtests.mjs`, `run-contest.mjs`, `build-site.mjs`, `collect-kalshi.mjs` (forward collection loop), `lint-verified.mjs` |
| `test/` | 25 tests (node --test): determinism, attribution identity, fill honesty, outcome cross-checks, provenance lint |
| `.github/workflows/daily-collection.yml` | Daily collector workflow (disabled until the collector is proven live — ROADMAP R1) |

## Quick start

```bash
npm test          # 25 tests
npm run lint      # no-fabrication provenance lint
npm run backtest  # regenerate data/backtest-results.json
npm run contest   # regenerate data/contest-results.json
npm run build-site# regenerate src/data/site-data.js (the site)
npm run pipeline  # backtest + contest + build-site
```

No dependencies. Node ≥ 18. No network needed for anything above.

## The honesty contract

1. **Every value traces to a captured URL.** Every data file carries `capturedFrom` + `capturedAt`
   (and the lint *fails* if one is missing). The 2026-09-18 capture session's line-by-line notes are in
   [VERIFICATION.md](VERIFICATION.md).
2. **No hard-coded outcomes.** Strategies are executable `decide(ctx)` functions; the engine refuses
   fills on days with no trade, caps fills at 10% of the day's volume, and charges the official
   quadratic taker fee. NO-side prices are labeled as derived reciprocals.
3. **Captured vs modeled is labeled.** The poll→probability logistic mapping (k=4.5) is an explicit
   assumption, not a published number.
4. **Attribution identity is tested:** `finalEquity = startingCapital + fee-aware realizedPnl`.
5. **Irregularities are published, never normalized** — [IRREGULARITIES.md](IRREGULARITIES.md) (12 items).

## 2024 headline results (verified, reproducible)

- **Markets vs outcome** (PRES-2024-DJT, CONTROLH-2024-R, CONTROLS-2024-R — all settled YES,
  matching official results): mean Brier at T-7 = **0.128** (chance baseline 0.25); a T-7 hold of the
  winning side earned **+0.33 $/contract**.
- **Polls vs outcome**: final 538 national average (2024-09-12) = **Harris +2.82pp**; official outcome
  = **Trump +1.45pp** (2-party popular, FEC) → **4.3pp miss, wrong direction**. The market traded
  Trump 50–63¢ through October and never crossed 50¢ the wrong way after the nomination.
- **Contest (2024 cycle, $100k each)**: @breakout-bandit **+23.1%** (late-week consensus),
  @fader-flipper **+13.9%**, @shock-surfer +0.7%, @favorite-cash +0.1%, @momentum-mule −3.1%,
  @poll-anchor **−13.3%** (the poll-information thesis failed 2024). @longshot-lotto and
  @yield-yak went unranked — no qualifying price ever appeared in the universe (reported, not hidden).

## Known limitations (summary)

The 2024 market backtest covers 3 markets (universe expansion is ROADMAP R2); the 538 poll archive
ends 2024-09-12 (late window reuses the anchor with age disclosed); the election-day (Nov 5) candle
bar was not captured; the full 2026 live universe is enumerated by the collector on networked runs.
Full list: [ROADMAP.md](ROADMAP.md).

## Roadmap (next session(s))

R1 daily collection · R2 2024 per-state Senate markets · R3 live 2026 calibration tracker ·
R4 continuous poll layer · R5 standing cross-market discrepancy monitor · R6 2020 poll cycle ·
R7 strategy population + 2-cycle tournament · R8 provenance hardening (SHA-256). Details:
[ROADMAP.md](ROADMAP.md).
