# Limitations

Honest constraints on what this project can currently claim or do. Updated 2026-09-19 (session 4).
Machine-readable twin of the bullet list: `data/roadmap.json → limitations`.

## Live collection (R1/R3)

1. **One collection day.** The daily tracker started 2026-09-19 (four runs that day). The live calibration
   scorer is empty *by construction* until markets that were priced **before** settlement settle; the first
   large U.S. batch settles after Nov 3 2026 (LA mayor, 35 Senate races, governors). Until then the Tracker page
   shows coverage, not evidence. The 207 settlements already on file are rungs that had settled before the first
   capture (found nested in still-open events, irregularity #37); a post-settlement price is not a forecast, so
   `scoreableMarkets` is 0 and the scorer refuses any observation dated on/after a market's settlement day.
2. **Traded markets only.** The daily CSV stores markets with volume > 0 or open interest > 0 that are not yet
   settled (10,709 of 24,367 on day one; 207 more traded rungs were already finalized and went straight to
   `settlements.json`). Never-traded strike-ladder markets are counted in the day's `.meta.json` but their empty
   quotes are not kept; a market enters the tracker the first day it trades. Each row carries the exchange
   `status` (active / closed / …) so later readers can tell tradable from pending rows.
2a. **Open event ≠ every rung tradable.** Kalshi's events feed nests finalized markets inside `status=open`
   events for weeks; the fetched API pages do not document why. Any consumer of `universe/latest.json` must
   filter on the per-market status, not the event status.
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

10. **Hand-transcribed, incomplete.** 15 entries from primary releases (4 generic-ballot series, 11 state-race
    rows); not a poll average; nothing auto-ingested. The four NYT/Siena July rows carry `review: true` because
    n / MoE / field dates live on nytimes.com pages that return 403 to the fetcher — the toplines themselves come
    from the Siena Research Institute release. Known-but-not-yet-transcribed: UNH NH releases, Marquette Wisconsin.
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
18. **Sources drift.** 125 entries verified across five sessions (six batches; session 5 added 20 on 2026-09-19 and declined two candidates with reasons — irregularity #53); re-verify on a schedule (the daily
    workflow does not re-fetch source pages, so a URL that changes later is caught only by a later session).
19. **Kalshi API host.** The project uses `api.elections.kalshi.com`; the docs default to
    `external-api.kalshi.com`. Whether the stale-last-price behaviour (irregularity #2) is host-specific is
    untested (R10).

## Contest

20. **Pilot, not tournament.** Eight project-designed entrants on one cycle. Results are evidence about the theses
    (e.g. poll-anchor failed 2024), not proof. Under The Leap's ≥3-trading-day rule several entrants are unranked
    on the small core universe; the wide universe ranks 7 of 8.
21. **Fills are taker-at-close with a 10% volume cap and no order-book depth**; NO fills are derived reciprocals.

## Site

22. **Static bundle.** GitHub Pages serves the committed `src/data/site-data.js` (~1.6 MB); it changes only when
    the daily workflow commits on the default branch or a PR merges. The bundle shows a 600-event U.S.-election
    watchlist, not all 4,094 events (the full files are in `data/kalshi/universe/`).
23. **Python toolkit demos** (`paper_trading.py --demo`, `backtest.py --demo-synthetic`) run on labelled synthetic
    data and are engine tests, not findings.

## Source registry additions (session 4, 2026-09-19)

24. **Point-in-time verification.** The 20 entries added in session 4 were each fetched directly on 2026-09-19 and their
    `verified` fields quote only what was observed that day. Nothing re-checks them automatically; a page that changes
    later is not detected until a session re-verifies it (see #18).
25. **Categories are labels, not tiers.** Every master-list entry now carries a `category` so the site can group 125
    entries; the assignment is a fixed per-id map reviewed entry-by-entry (`VERIFICATION.md` §9b). A category says how
    this project *files* a source — it makes no claim about reliability, accuracy or tier.
26. **Fetch-tool reach limits coverage.** Four primary hosts refused this session's proxied fetcher
    (`healthyelections.org`, `surveypoll.com`, `thehillx.com`, `courtlistener.com`) and three official paths returned
    access-denied / 404 / S3 AccessDenied (WI `/elections-voting`, NV `/sos-elections`, CA
    `elections.cdn.sos.ca.gov`). Those candidates were **excluded or annotated**, never reconstructed from memory
    (irregularities #40–#42, #45, #47). SurveyUSA and HarrisX remain outside the registry (re-tested and still unreachable in session 6);
    CourtListener and the Franklin & Marshall College Poll were fetched in session 6 and admitted (R11 done).
27. **Third-party market renderings are corroboration only.** 270toWin and DDHQ Votes both republish Kalshi prices; the
    one comparison run so far agreed with this project's captures within 1¢ but was manual, single-point, and the
    aggregator's own disclaimer says its figures "may not total 100%" (irregularity #46). No model, backtest or contest
    fill uses a rendered percentage — only captured `yes_bid`/`yes_ask`. Session 6 automated it (`scripts/crosscheck-renderings.mjs`, R13), but the first live run on the Actions
    runner has not happened yet — until it does the file `data/kalshi/tracker/rendering-crosscheck.json` does not exist.

## Cross-layer scoreboard, third-layer collectors, session-6 registry (2026-09-19)

28. **Nothing is scored yet.** `data/crosslayer/outcomes.json` is empty by design; every snapshot is `pending` until an
    official canvass with a source url is recorded after November 3. The Senate spread (Kalshi 59–60¢ vs Metaculus
    51.7% vs DDHQ 52%) is an observation (#57), not a finding about who is right.
29. **Two questions only.** The scoreboard covers Senate and House control. Metaculus's '18 of 35 races lean Democrat'
    and Kalshi's 35 per-state Senate markets are not yet paired seat by seat (R14 remaining work).
30. **Metaculus is parsed from HTML.** api2 is authentication-walled (#54). If the hub markup changes the daily row
    reads `parse:'failed'` and the section shows the last good capture; no number is estimated.
31. **State Navigate's API is not used.** `data.statenavigate.com` answered HTTP 500 and the data downloads are paid
    (Tier 3, #55); the collector reads the free forecast pages, whose per-state titles still say "2025". It probes the
    API host each run so a recovery is noticed automatically.
32. **Collectors are proven offline only.** `collect-metaculus.mjs`, `collect-statenavigate.mjs` and
    `crosscheck-renderings.mjs` pass fixture tests transcribed from the pages fetched on 2026-09-19, but their first
    networked run happens in the daily workflow after this PR merges (continue-on-error, so a failure cannot block the
    Kalshi loop). Until then `data/crosslayer/metaculus-daily.json`, `data/statenavigate/` and the rendering file are absent.
33. **Two `needs-review` pollsters.** Data for Progress (self-described progressive) and Civiqs (Daily Kos-affiliated)
    were admitted with `needs-review` because each publishes a methodology page; their rows, if ever ingested, must carry
    the sponsor label and are not averaged with nonpartisan pollsters.
34. **Method labels exist only on the new rows.** The five session-6 poll rows carry #49 `methodFamily`; the fifteen
    earlier rows do not yet, so any cross-row aggregate still mixes designs (R12 remaining work).
35. **Muhlenberg has no 2026 horse-race release** on its own site as of 2026-09-19 — recorded under `pendingSources`
    rather than filled from syndication.
