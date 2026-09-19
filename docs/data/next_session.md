# Next Session — start here

State at the end of session 3 (2026-09-19): R1 live (three live runs, hardened: per-market status, shrink guard,
run history), R2 done (39-market backtest), R3 running (207 pre-tracker settlements on file, 0 scoreable — the
look-ahead guard is deliberate), R4 started (15 verified poll entries, 4 flagged review), R5 live, R8 done.
Master list 73 sources, 37 irregularities, 45 tests. Full status: `ROADMAP.md` / `data/roadmap.json`.

Every item keeps the project's rules: free official/trusted sources only, fetch before you write, no hallucinations,
irregularities logged with an action, nothing imputed.

## P0 — Confirm the loop is alive (10 minutes)

1. `gh run list --workflow daily-collection.yml` — the 12:30 UTC cron must have run on `main` after the merge and
   committed `collect: kalshi YYYY-MM-DD`. If not: check Actions → the job log; the opt-out variable
   `COLLECT_DISABLED` must be unset.
2. `git log --stat -1 -- data/kalshi/tracker/daily/` — each day should add ≈ 1 MB (one CSV) and small diffs to
   `index.json` / `latest.json` / `series.json`. If a day's commit is > 5 MB, something regressed (irregularity #30).
3. Open the live site → **Tracker**: days collected should equal the number of bot commits; the Node-vs-Python
   agreement share should stay ≥ 99%.

## P1 — Poll layer (R4) — the highest-value manual work

4. Done this session: Suffolk Iowa (press-release PDF) and NYT/Siena Jul-1 AK/IA/NC/OH toplines (Siena release page).
   Still to transcribe (fetch the release first, then write): the NYT toplines n / MoE / field dates for those four
   rows (nytimes.com returns 403 to the fetcher — do it by hand and clear `review: true`), UNH Survey Center NH Senate,
   Marquette Wisconsin, any new CNN/SSRS or Quinnipiac state polls. Add to `data/polls/poll-layer-2026.json`
   (`stateRaces`) with `kalshiEvent` / `kalshiDemTicker`; `npm run lint` fails if the ticker is not in the tracker index.
5. Iowa now has three polls (Emerson R+5, Suffolk R+4, NYT/Siena R+2) around the market's 39.5% (irregularity #34
   updated). Next: a simple per-race poll average (window, n, pollsters disclosed) in `poll-layer.js`, shown next to
   the market; Texas is the race where two polls disagree most (Emerson D+1 vs ReconMR-Siena D+6).
6. Add a weekly "poll release check" script that fetches the pollster index pages (Emerson, Marquette, Siena,
   Quinnipiac, UNH, Suffolk, SSRS news) and diffs headlines into a review list — never auto-admit numbers.
7. After Nov 3 2026: The Voter Poll by SSRS data will exist — verify the release page before using any of it.

## P2 — Backtest & calibration

8. `tracker/settlements.json` already holds 207 results, all for rungs that settled BEFORE the first capture, so
   `calibration.json → scoreableMarkets` is 0 by design. The first real numbers appear when a market that has
   pre-settlement rows in `tracker/daily/` settles (watch `history.json → settledMarketsScored`); then review
   `byLead/pooled` and put the first numbers in README/Tracker prose. Check after the 2026-09-20 run whether
   the 207 finalized rungs still come back nested in open events (irregularity #37, API semantics question).
9. Extend `collect-senate-2024.mjs` to 2024 governor/House series if they exist on Kalshi (same pattern:
   `/historical/markets?series_ticker=…`), and add the 2020 poll-only cycle (R6).
10. Run the two-collector cross-check once against `external-api.kalshi.com` (R10, irregularity #31).

## P3 — Sources (same bar: fetch, describe what you saw, link)

11. Candidates not yet admitted: New Hampshire SoS (find a fetchable URL — 403 on the results page), Minnesota SoS,
    Nebraska SoS, Georgia results host `results.sos.ga.gov` as its own entry, Suffolk Iowa release page,
    NYT/Siena state toplines PDFs, Polymarket Gamma API docs (for R9), Kalshi `/events` docs page.
12. Re-verify entries older than 60 days (the `verifiedOn` column) — sources drift (538, Monmouth, Gallup did).

## P4 — Contest & site

13. Add entrants that only make sense on the wide universe (incumbent-defender, seat-count basis, volatility
    scaling) — executable `decide()` rules only, thesis stated up front (R7).
14. Site: when `tracker.days > 1`, the Tracker page draws price-history charts automatically; check they render.
    Consider a per-state race page once the poll layer has ≥ 3 polls per race.

## Python track (kept in sync)

15. `fetch_kalshi.py` now writes a 2,000-market sample; `docs/data/kalshi_latest.json` mirrors its log. If the
    toolkit site should show prices, extend `sync_site_data.py` to read `data/kalshi/universe/latest.json`.
16. Open re-checks: RCP freshness (#15) — resolved 2026-09-19 (page current); AP VoteCast 2026 (#17) — resolved
    (superseded by The Voter Poll); Harvard Dataverse homepage (#19) — still to re-fetch.
