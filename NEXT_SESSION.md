# Next Session — Proposed Work Plan (updated 2026-09-19, late session)

Ordered by dependency. Every item keeps the project's rules: verified sources only, no hallucinations, irregularities logged, line-by-line evidence in VERIFICATION.md.

## P0 — Land the first networked collection (R1/R2) — ✅ DONE 2026-09-19

1. ✅ Pushed (credential refreshed after a ~1 h expiry window). Run #6 collected everything but the fatal lint correctly refused to commit (legacy `meta.json` lacked provenance — fixed in 77d0437, plus 429 pacing and upload-artifact-on-failure so a capture is never lost again).
2. ✅ Run #7 (id 35422611203) SUCCESS in ~36 min: universe 24,150 open markets / 4,199 politics series (registry 14,168), tracker +24,150 rows, settled-2026 seed 9,350 markets / 400 with bars, Senate-2024 capture 36 markets / 18 states / 0 errors, analytics + site rebuild + lint + collector commit `917ee9e` ([skip ci], 1,020,769 lines).
3. ✅ Pulled + inspected locally: `data/kalshi/forward/*` + `data/kalshi/historical-2024/senate-races.json` present; senate backtest cross-check 36 PASS / 0 FAIL; calibration T-1 Brier 0.0148 (mean 27.5¢ vs 28.4% outcome rate), T-60 0.0345.
4. ✅ `npm test` = 41 tests / 40 pass / 0 fail / 1 skip (the skip is the inverted guard "skips honestly while capture pending" — by design once the capture exists). Lint green on the collected state.

## P1 — Merge to main and switch to the steady-state loop — IN PROGRESS

5. ✅ TEMPORARY push trigger removed from `daily-collection.yml` (bootstrap served its purpose; noted in-file). `universe-collection.yml` (daily 12:40 UTC cron, enabled by default) is the steady-state collector.
6. Open PR → merge to main (user requirement). On main: `universe-collection.yml` becomes dispatchable AND its cron registers (schedules only fire from the default branch). The 12:40 UTC daily loop then needs no further action; collector commits (`[skip ci]`, rebase-before-push) accumulate `open-prices.csv` — the R3 calibration feed.
7. First settlements land Nov 3, 2026 (LA mayor + others): `run-calibration.mjs` scores them automatically into the live tracker; verify bucket tables + Brier on the site the day after.

## P2 — Python-track open re-checks (carried; each needs a direct fetch on a networked run)

8. IRR #15 RCP page freshness (realclearpolling.com battleground page — confirm the 2024 archive is still served).
9. IRR #17 AP VoteCast 2026 status (does the AP license exit polls to VoteCast for the midterms; methodology page).
10. IRR #19 Harvard Dataverse homepage (dataverse.harvard.edu front page + MEDSL collection DOI persistence).
11. Exit polls before use: confirm Edison/SSRS operates a 2026 midterm exit poll (SSRS page currently silent on 2026 operations — irregularity #25). NEW lead verified this session: Roper Center (master #N40) hosts state+national exit polls back to 1972 — use for historical exit-poll backtests instead of waiting on 2026.
12. IEM cross-platform price check (R5): fetch `iemweb.biz.uiowa.edu/iem_market_info/2026-u-s-{congressional,house,senate}-control-winner-takes-all-market/` and compare IEM prices vs Kalshi CONTROLS/CONTROLH implied probabilities; log divergence >5pp as a discrepancy-watch row.

## P3 — Analysis depth once the tracker has ≥2 weeks of rows

13. R3 calibration report v1: bucket reliability curve from settled-2026 seed + tracker; publish on site (section already renders pending state).
14. R4 continuous poll layer: add weekly verified releases (Marist/NPR-PBS, Siena/NYT, Quinnipiac, Emerson state polls — all now master-list entries with live 2026 data observed) to `data/polls/verified-polls.json` with per-row source URLs; compute poll-vs-market spread for the 2026 Senate/Gov markets that have both.
15. R7 strategy population: add 2-3 entrants with distinct testable theories (incumbent-defender on Senate series; poll-anchor mean-reversion; longshot-fade in >90¢ buckets — the calibration data will say whether it pays).
16. R6 2020 poll-only backtest row (538 2020 averages archive; official outcome Biden 306 EV / 81,283,501 votes; state explicitly that no Kalshi 2020 markets existed).

## P4 — Maintenance & hardening

17. Monthly `python scripts/validate_sources.py --check-live` on a networked runner (classifies network-unavailable vs http-error distinctly).
18. Re-verify the 3 `verified-via-search` entries from the second batch directly (Suffolk SUPRC landing page — HTTP 500 observed; Morning Consult intel tracker; NCSL hub) and upgrade statuses.
19. Watch irregularity #28: FollowTheMoney.org state data frozen at 2024 during the OpenSecrets integration — re-check annually or when URLs break.
20. Site polish pass with real forward data: chart density, mobile layout, and a "last collected" timestamp surfaced in the header.
