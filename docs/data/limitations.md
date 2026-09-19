# Limitations

Honest constraints on what this project can currently claim or do. Updated 2026-09-19 (session 3).
Machine-readable twin of the bullet list: `data/roadmap.json → limitations`.

## Live collection (R1/R3)

1. **One collection day.** The daily tracker started 2026-09-19 (two runs that day). The live calibration
   tracker is empty *by construction* until tracked markets settle; the first large U.S. batch settles after
   Nov 3 2026 (LA mayor, 35 Senate races, governors). Until then the Tracker page shows coverage, not evidence.
2. **Traded markets only.** The daily CSV stores markets with volume > 0 or open interest > 0 (10,914 of
   24,367 on day one). Never-traded strike-ladder markets are counted in the day's `.meta.json` but their empty
   quotes are not kept; a market enters the tracker the first day it trades.
3. **Settlement scan covers tickers the tracker has seen.** Markets that opened and settled between two daily
   runs (e.g. same-day specials) are missed; the historical tier could back-fill them (not built).
4. **One scheduled run per day (12:30 UTC).** Intraday moves are invisible; the day's row is the last capture of
   that date (a push-triggered run later the same day overwrites it).
5. **The scheduled cron only runs on the default branch.** Until the PR merges, collection happens on the
   session branch only via push triggers.

## 2024 backtest (R2)

6. **One cycle, 39 markets.** 3 core + 36 per-state Senate markets (18 states). Most Senate markets opened in
   October 2024, so T-30/T-60 lead times cover few markets; the pooled calibration curve is indicative only.
   2024 was a Republican Senate year — group results are not exchangeable across cycles.
7. **Election-day bar.** Core-market series stop at the 2024-11-04 bar (irregularity #11); the Senate capture
   includes bars through settlement (flag `electionDayBarCaptured` per market).
8. **NO-side prices** in 2024 candles are derived reciprocals (1 − yesClose); the API publishes YES series only.
9. **Poll archive ends 2024-09-12** (538 GitHub archive); the poll-vs-market comparison after that date reuses
   the anchor with its age disclosed.

## 2026 poll layer (R4)

10. **Hand-transcribed, incomplete.** 12 entries from primary releases; not a poll average; nothing auto-ingested.
    Known-but-not-yet-transcribed: Suffolk Iowa (Aug 26), NYT/Siena Jul-1 AK/IA/NC/OH toplines, UNH NH releases.
11. **Modelled mappings are labelled, not validated.** Poll margin → probability uses logistic k = 4.5 (chosen in
    the 2024 poll backtest). Rating "bands" used to flag market-vs-rating gaps are a project heuristic
    (documented in `poll-layer-2026.json → raceRatings.bands`). Flags are for review, not findings.
12. **One partner-hosted poll.** The Texas Poll released via Siena Research Institute is ReconMR fieldwork; it is
    admitted with that attribution and a `tier` note.
13. **No exit-poll data.** The 2026 product (The Voter Poll by SSRS) exists but produces data only on Nov 3 2026.

## Consistency & cross-checks (R5)

14. **Kalshi's `mutually_exclusive` flag does not mean exhaustive.** Under-sum findings are coverage notes; only
    over-sums are treated as inconsistencies (irregularity #32).
15. **Two collectors run minutes apart.** The cross-check tolerates 2¢ moves and reports agreement shares; it does
    not prove either capture complete. The Python sample is the 2,000 highest-volume markets, not the universe.
16. **Cross-platform prices are hand snapshots** (Polymarket 2026-09-18, PredictIt 2026-09-19); there is no
    Polymarket collector yet (R9).

## Sources & verification

17. **Fetch-tool provenance.** Captures ran through a proxied fetch tool; some official hosts block it
    (Georgia Clarity results host, NH SoS — irregularity #35). Alternative official URLs are used where found.
18. **Sources drift.** 73 entries verified across three sessions; re-verify on a schedule (the daily workflow does
    not re-fetch source pages).
19. **Kalshi API host.** The project uses `api.elections.kalshi.com`; the docs default to
    `external-api.kalshi.com`. Whether the stale-last-price behaviour (irregularity #2) is host-specific is
    untested (R10).

## Contest

20. **Pilot, not tournament.** Eight project-designed entrants on one cycle. Results are evidence about the theses
    (e.g. poll-anchor failed 2024), not proof. Under The Leap's ≥3-trading-day rule several entrants are unranked
    on the small core universe; the wide universe ranks 7 of 8.
21. **Fills are taker-at-close with a 10% volume cap and no order-book depth**; NO fills are derived reciprocals.

## Site

22. **Static bundle.** GitHub Pages serves the committed `src/data/site-data.js` (~1.2 MB); it changes only when
    the daily workflow commits on the default branch or a PR merges. The bundle shows a 600-event U.S.-election
    watchlist, not all 4,094 events (the full files are in `data/kalshi/universe/`).
23. **Python toolkit demos** (`paper_trading.py --demo`, `backtest.py --demo-synthetic`) run on labelled synthetic
    data and are engine tests, not findings.
