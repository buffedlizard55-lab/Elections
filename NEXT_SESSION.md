# Next Session — Proposed Work Plan (updated 2026-09-19, late session)

Ordered by dependency. Every item keeps the project's rules: verified sources only, no hallucinations, irregularities logged, line-by-line evidence in VERIFICATION.md.

## P0 — Land the first networked collection (R1/R2, unblocks the forward loop)

1. **Push the two pending local commits** (timeout 30→90 min fix; docs sync). The sandbox GH_TOKEN expired mid-session on 2026-09-19 (`gh auth status` → "token no longer valid"; git push → "Invalid username or token"). Once credentials are restored (or the user reconnects GitHub in Arena), `git push origin arena/01a0b728-elections`. The push itself re-triggers `daily-collection.yml` (temporary push trigger, paths-matched on the workflow file) — that is the intended bootstrap.
2. Watch the run (`gh run watch <id>`): expect universe sweep ~25-40 min (rate-limited), Senate 2024 capture (34 tickers, idempotent), analytics, site rebuild, fatal lint, collector commit `[skip ci]`. Run #5 proved tests-on-runner + trigger wiring before dying at the 30-min timeout.
3. `git pull --rebase` the collector commit; inspect `data/kalshi/forward/` (universe-open.json, series-registry.json, open-prices.csv, settled-2026-seed.json, meta-*.json) and `data/kalshi/historical-2024/senate-races.json`. Sanity checks: politics series count > 30; open markets in the hundreds; senate capture ≈ 40 markets across 18 states (official-outcome cross-check already committed: 18 of 35 contests, R flips MT/OH/PA/WV → 53-47); 2 skipped tests flip to passing.
4. Re-run `npm test` + `node scripts/build-site.mjs` + `node scripts/lint-verified.mjs` locally on the collected state; open the site preview; verify the Forward (R1/R3) + Senate-2024 (R2) sections render real data instead of pending placeholders.

## P1 — Merge to main and switch to the steady-state loop

5. Remove the TEMPORARY push trigger from `daily-collection.yml` (comment in the file says so) before opening the PR; keep `universe-collection.yml` (daily 12:40 UTC cron, enabled by default) as the steady-state collector.
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
