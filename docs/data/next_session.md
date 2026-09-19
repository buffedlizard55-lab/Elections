# Next Session — Proposed Work Plan

Ordered by dependency. Every item keeps the project's rules: verified sources only, no hallucinations, irregularities logged.

## P0 — Go live with Kalshi data (unblocks everything)

1. Confirm the `collect.yml` workflow produced the first `data/kalshi/markets_politics_*.json` snapshot after merge (manual fallback: run `python scripts/fetch_kalshi.py` from a normal network and commit it).
2. Inspect live response fields; confirm `category`/`series` taxonomy; populate `data/kalshi_series_allowlist.json`; tighten the politics filter with evidence.
3. Verify `/events` docs page; upgrade collector from best-effort if confirmed.
4. Re-run `python scripts/validate_sources.py --check-live` and resolve IRR-003, IRR-007.

## P1 — First real backtest

5. Pull 2024 certified results (FEC + House Clerk statistics + NARA) into `backtest/actuals_2024.csv` with per-row official source URLs.
6. Collect final 2024 forecasts (Crystal Ball closing ratings, Split Ticket model, selected poll averages with archived URLs) into `backtest/predictions_2024.csv`.
7. Run `scripts/backtest.py`, publish report, file any `extreme-miss` findings in `IRREGULARITIES.md`.

## P2 — Contest Season 1 (real prices)

8. Finalize Season 1 window; snapshot Kalshi politics markets daily (scheduled workflow).
9. Implement the 8 strategies against REAL snapshots (poll-average inputs from Quinnipiac/Marist/YouGov/Ipsos releases).
10. Add Kalshi fee schedule (verify from official fee page first) + basic slippage; re-run leaderboard.

## P3 — Batch 2 sources (20 more, same bar)

11. Verify and admit: Ballotpedia polling indexes, Cook (free boundary), NYT/Siena (access terms), The Argument URL, KFF polling, CNN/SSRS, ABC/WaPo, NBC/WSJ, Fox News polls, Suffolk/USA Today, Emerson, EAC EAVS deep links, FEC API (`api.open.fec.gov` — verify), state SOS results portals (shortlist), ICPSR direct entry, CCES cumulative DOIs, Economist model page, Decision Desk HQ (verify), 270toWin (verify — aggregator fit), Polymarket (out-of-scope? decide + document).
12. Monthly re-verification cron (`validate_sources.py --check-live` + freshness heuristics).

## P4 — Site & automation

13. Scheduled GitHub Action: daily Kalshi snapshot → contest re-mark → `sync_site_data.py` → Pages deploy.
14. Backtest report pages + calibration charts (static SVG, no external deps).
15. Theories page: publish testable hypotheses with pre-registered evaluation criteria (no post-hoc story-telling).
