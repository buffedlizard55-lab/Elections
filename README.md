# Elections — collect, analyze, project & estimate

**A verification-first election intelligence project.** Free, public, official data only.
Backtests **polls and prediction markets** against **verified official outcomes**, flags every
irregularity it finds, and runs a **paper-trading forecasting contest** (reverse-engineered from
TradingView's [The Leap](https://www.tradingview.com/the-leap/crypto-series-may-2026/))
on Kalshi's open political/election markets.

🌐 **Live site (GitHub Pages, branch root):** https://buffedlizard55-lab.github.io/Elections/
📚 **Toolkit site (same deployment, subdirectory):** https://buffedlizard55-lab.github.io/Elections/docs/

## Two toolchains, one standard

| | Node pipeline (primary data engines) | Python toolkit (registry + collectors + validators) |
|---|---|---|
| Sources | `data/sources/master.json` — 53 verified entries (32 from 2026-09-18 + 21 from 2026-09-19) | `data/master_sources.json` + `.csv` — 20 live-only entries + `data/flagged_sources.json` (7 excluded with reasons) |
| Verification log | `VERIFICATION.md` | `data/verification_log.md` |
| Kalshi | `scripts/collect-kalshi.mjs` → `data/kalshi/live/…` (series-targeted + candles) | `scripts/fetch_kalshi.py` → `data/kalshi/markets_*.json` (full-universe + keyword filter) |
| Backtests | `src/backtest.js`, `src/poll-backtest.js` → `data/backtest-results.json` | `scripts/backtest.py` + `backtest/` (Brier/log-loss/calibration + flags) |
| Contest | `src/contest/` → `data/contest-results.json` (real Kalshi fees) | `scripts/paper_trading.py` + `contest/` (Leap-style rules, 8 strategies) |
| Site | `index.html` + `src/site/` (built by `scripts/build-site.mjs`) | `docs/` (static, synced by `scripts/sync_site_data.py`) |
| Checks | `npm test` (25 tests) + `npm run lint` (provenance) | `python scripts/validate_sources.py` (schema + CSV + live checks) |
| Automation | `daily-collection.yml` (gated; enable via `vars.COLLECT_ENABLED`) | `collect.yml` (daily snapshot) · `validate.yml` (CI) · `pages.yml` (manual deploy fallback) |

Both stacks obey the same honesty contract (§ below). The 2024 headline results come from the
Node pipeline's verified data; the Python engines reproduce the same methodology and run on
labeled synthetic data until wired to the verified datasets (see `NEXT_SESSION.md`).

## What's here

| Path | What it is |
|---|---|
| `index.html` + `src/site/` | Main static site (GitHub Pages, main branch root): overview, 2026 live markets, backtests, contest, sources, irregularities, methodology, roadmap |
| `docs/` | Toolkit site (served as `/docs/`): 20-source registry browser, Kalshi layer, contest leaderboard, methodology, verification evidence |
| `data/kalshi/` | Captured Kalshi data: 2026-09-18 live-market snapshot; settled 2024 markets live in `src/kalshi-data.js` with per-bar provenance |
| `data/sources/master.json` | **Master source list — 53 verified entries** (32 from 2026-09-18 + 21 from 2026-09-19), each with a manual-review link and a line-by-line verification note |
| `VERIFICATION.md` | Line-by-line audit log for the Node track's capture sessions (2026-09-18 base + 2026-09-19 §6: the 21 new entries, URL corrections, and fetch failures) |
| `data/master_sources.json` | **Live-only registry — 20 entries** (5 government · 5 academic · 6 pollsters · 4 analysis), independently verified 2026-09-18 |
| `data/outcomes/verified-outcomes.json` | Verified official outcomes (2020/2024 presidency, 2024 Senate & House control) with per-claim sources and Kalshi-settlement cross-checks (all PASS) |
| `data/polls/` | 538's archived national averages (verbatim GitHub copy + provenance) and line-by-line verified individual polls |
| `data/backtest-results.json` | Market calibration (Brier/log-loss/hold-PnL at T-1…T-60) + poll-vs-market-vs-outcome (generated) |
| `data/contest-results.json` | Paper-trading contest: 8 entrants, $100k each, Kalshi's real fees, 2024 universe (generated) |
| `data/irregularities.json` + `IRREGULARITIES.md` | 25 flagged irregularities/discrepancies with severities and actions (Node items 1–12 + 23–25; Python-track items 13–22) |
| `src/` | Zero-dependency Node engines: fee schedule, market backtests, poll backtest, contest engine + strategies, no-fabrication lint |
| `scripts/*.py` | Python toolkit: Kalshi collector, source validator, backtester, contest engine, site-data sync |
| `test/` + `scripts/*.mjs` | 25 Node tests; `run-backtests`, `run-contest`, `build-site`, `collect-kalshi`, `lint-verified` |
| `LIMITATIONS.md` / `NEXT_SESSION.md` | Honest constraints + proposed work plan (Python toolkit track) |
| `ROADMAP.md` | R1–R8 roadmap (Node pipeline track) |

## Quick start

Node pipeline (no dependencies, Node ≥ 18, no network needed):

```bash
npm test          # 25 tests
npm run lint      # no-fabrication provenance lint
npm run backtest  # regenerate data/backtest-results.json
npm run contest   # regenerate data/contest-results.json
npm run build-site# regenerate src/data/site-data.js (the site)
npm run pipeline  # backtest + contest + build-site
```

Python toolkit (stdlib only, Python 3.10+):

```bash
python scripts/validate_sources.py            # schema + CSV-consistency check (add --check-live on normal network)
python scripts/fetch_kalshi.py                # collect open markets (needs normal network)
python scripts/paper_trading.py --demo        # SIMULATED contest season (engine test)
python scripts/backtest.py --demo-synthetic   # SYNTHETIC backtest (pipeline test)
python scripts/sync_site_data.py              # refresh docs/data for the toolkit site
```

## The honesty contract

1. **Every value traces to a captured URL.** Node data files carry `capturedFrom` + `capturedAt`
   (the lint *fails* if one is missing); Python registry entries carry checked URLs + evidence.
   Line-by-line notes: [VERIFICATION.md](VERIFICATION.md) and [data/verification_log.md](data/verification_log.md).
2. **No hard-coded outcomes.** Strategies are executable rules; engines refuse dishonest fills
   (no-trade days, volume caps, official fees in the Node engine; labeled simulation in Python demos).
3. **Captured vs modeled is labeled.** The poll→probability mapping and all synthetic/demo data
   are explicitly marked wherever they appear. Simulated outputs are never presented as findings.
4. **Attribution is tested:** `finalEquity = startingCapital + fee-aware realizedPnl` (Node);
   paper-engine equity math is covered end-to-end (Python).
5. **Irregularities are published, never normalized** — [IRREGULARITIES.md](IRREGULARITIES.md) (25 items).

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
bar was not captured; the full 2026 live universe is enumerated by the collectors on networked runs;
the Iowa Electronic Markets entry (master-list #53) was verified via live search because
`iem.isu.edu` could not be fetched directly in the sandbox (marked `verified-via-search`, re-check
on a networked run). Python track: no live Kalshi snapshot yet (daily `collect.yml` starts after
merge), fees/slippage not modeled in the paper engine. Full lists: [ROADMAP.md](ROADMAP.md) and
[LIMITATIONS.md](LIMITATIONS.md).

## Roadmap (next session(s))

R1 daily collection · R2 2024 per-state Senate markets · R3 live 2026 calibration tracker ·
R4 continuous poll layer · R5 standing cross-market discrepancy monitor · R6 2020 poll cycle ·
R7 strategy population + 2-cycle tournament · R8 provenance hardening (SHA-256). Details:
[ROADMAP.md](ROADMAP.md) and [NEXT_SESSION.md](NEXT_SESSION.md).

## GitHub Pages setup

The live site deploys from the **`main` branch root** (Settings → Pages → Source: Deploy from a
branch). The toolkit site ships inside `docs/` and is served automatically as `/docs/` under the
same deployment — no extra configuration. `pages.yml` remains as a manual fallback only.
