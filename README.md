# Elections — Collect · Verify · Forecast

An open project to **collect, analyze, project, and estimate election results**
using **only free, publicly available data from official, verified, trusted sources** —
then backtest every prediction against certified outcomes, flag discrepancies,
and run a Leap-style paper-trading contest on Kalshi politics/election markets.

🌐 **Website:** GitHub Pages site in [`docs/`](docs/) (live once Pages is enabled — see below).

## What lives here

| Path | Purpose |
|---|---|
| `data/master_sources.json` / `.csv` | **20 verified trusted sources** (batch 1), line-by-line verified 2026-09-18 |
| `data/verification_log.md` | Per-line verification evidence with links for manual review |
| `data/flagged_sources.json` | Researched-but-excluded candidates (defunct, paywalled, unverified) with reasons |
| `data/kalshi_api.json` | Verified Kalshi API/docs map + politics-filter strategy |
| `scripts/fetch_kalshi.py` | Collector: all open Kalshi markets → politics/elections filter (public endpoints, no key) |
| `scripts/validate_sources.py` | Schema + optional live URL validation of the master list |
| `scripts/backtest.py` | Forecast-vs-outcome scoring (Brier, log-loss, calibration, flags) |
| `scripts/paper_trading.py` | Leap-style contest engine: paper fills, settlement, leaderboard |
| `contest/` | Contest rules, 8 strategy contestants, leaderboards |
| `backtest/` | Methodology + CSV templates for predictions/actuals |
| `docs/` | GitHub Pages site (static, no build step) |
| `IRREGULARITIES.md` | Discrepancy log — nothing questionable is silently patched |
| `LIMITATIONS.md` / `NEXT_SESSION.md` | Honest constraints + proposed work plan |

## Rules of the project

1. **Verified sources only.** Nothing enters the master list without a checked URL + evidence.
2. **No hallucinations.** No invented prices, polls, or results. Simulated/test data is always labeled `simulated`.
3. **Official outcomes win.** Backtests score against certified results (FEC, House Clerk, NARA).
4. **Flag, don't patch.** Anomalies go in `IRREGULARITIES.md` with evidence.

## Quickstart (no dependencies — Python 3.10+ stdlib only)

```bash
# 1. Validate the master sources list (offline schema check)
python scripts/validate_sources.py
# 1b. With live HTTP checks (needs normal network; sandbox blocks most hosts)
python scripts/validate_sources.py --check-live

# 2. Collect Kalshi markets (needs normal network)
python scripts/fetch_kalshi.py --out-dir data/kalshi

# 3. Run the contest engine on SIMULATED data (engine test)
python scripts/paper_trading.py --demo --season S1-2026-10

# 4. Run the backtester on SYNTHETIC data (pipeline test)
python scripts/backtest.py --demo-synthetic --report-name backtest_demo

# 5. Sync data to the website
python scripts/sync_site_data.py
```

Real-mode contest scoring:

```bash
python scripts/paper_trading.py --season S1-2026-10 \
  --markets data/kalshi/markets_politics_<stamp>.json \
  --orders contest/orders_S1-2026-10.jsonl \
  --settlements contest/settlements_S1-2026-10.csv
```

## The 20 verified sources (batch 1)

Government-official: FEC · EAC · NARA Electoral College · Census Voting & Registration · House Clerk Election Information.
Academic: MIT Election Lab · ANES · Cooperative Election Study · Harvard Dataverse · AP-NORC.
Pollsters: Pew · Gallup · Quinnipiac · Marist · YouGov · Ipsos.
Analysis/aggregation: RealClearPolitics · Sabato's Crystal Ball · Split Ticket · OpenSecrets.

Full URLs, evidence, and caveats: [`data/verification_log.md`](data/verification_log.md) and the site's Sources page.

## Enabling GitHub Pages

This repo publishes `docs/` via the `Deploy GitHub Pages` workflow (`.github/workflows/pages.yml`).
After merge to `main`: **Settings → Pages → Source: GitHub Actions**. The site is static (HTML/CSS/vanilla JS, no external dependencies).

## Status

Batch-1 registry complete; Kalshi collector ready (a daily `collect.yml` workflow pulls snapshots on GitHub Actions, where network is available); contest engine + backtester implemented and exercised on labeled synthetic data. See `LIMITATIONS.md` and `NEXT_SESSION.md`.

## Automation

- `validate.yml` — schema validation + engine smoke tests on every push/PR.
- `collect.yml` — daily Kalshi snapshot (12:20 UTC), committed only on success.
- `pages.yml` — deploys `docs/` to GitHub Pages on `main` pushes + daily rebuild.
