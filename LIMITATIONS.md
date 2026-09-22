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

## Session 7 — live-run repairs, new pollsters, host monitor (2026-09-20)

36. **Metaculus behind Cloudflare is best-effort from the runner.** Plain fetches are 403 on both profiles and headless
    Chrome passed the check on 3 of 7 pages in the first live run (#62). `renderDom` now keeps one Chrome profile per
    run and retries with a longer budget, and the collector makes a second pass once any page has rendered — but whether
    the interstitial keeps clearing is outside this project's control. Every row carries `fetchMethod`/`fetchLog`, so a
    rendered number and a missing one are never confused.
37. **State Navigate's numbers are still not collected automatically.** The second live run fetched all 35 pages, but a
    navigation keyword ('close seats') satisfied the render trigger, so Chrome was never used (#62). The trigger is now
    the parser itself; the next committed `forecast-daily.json` is the proof. Until then the Cross-layer section keeps the
    hand-verified 2026-09-19 figures, labelled as such.
38. **The host re-test monitor (R15) has no committed verdicts yet.** Its first live run crashed with ENOENT before
    writing `data/probes/latest.json`, and the continue-on-error step stayed green (#61). Fixed and verified locally with a
    stand-in Chrome; the first real `latest.json` arrives with the next push/cron run. Rule from #58/#61: judge a
    continue-on-error step by the file it should have committed, never by its badge.
39. **Three poll rows only this session** (Elon and HPU Poll 120 NC Senate, HarrisX generic). HarrisX publishes no margin of error for its
    opt-in panel (`moe: null`, not estimated); UMass Lowell's Maine test names a non-nominee and SurveyUSA's Minnesota
    report is client-rendered — both sit in `pendingSources` with reasons, not in `stateRaces` (#60, #47).
40. **Kalshi tickers do not always encode the state** (`SENATELA-26` is Kentucky, #59). The Metaculus pairing now checks
    the event title, but other places that build a ticker from a state code (contest strategies, the poll layer's
    `kalshiDemTicker`) still assume `SENATE{ST}-26` — audit those paths before any per-seat scoring after Nov 3.
41. **Actions logs and artifacts cannot be read from the sandbox** — only committed files. Every collector now writes a
    row even on failure and the probe writes a verdict per target, but a crash before the first write is still invisible
    until someone looks for the file.
42. **The hub parser has been wrong once in production** (#63: the rendered Metaculus DOM was read as Senate = House
    88.8 and reached the scoreboard before the fix). The quadrant cross-check now blocks any chamber that contradicts
    the page's own control quadrants, and both workflows are serialised so runs cannot overwrite each other — but the
    rendered DOM is never committed (7-day artifacts, unreachable from the sandbox), so a future layout change is
    diagnosed from the row's `sample` and `consistencyFlags`, not from the page itself.

## Session 9 update (2026-09-21)

- `backtest/crosslayer-outcomes.md` specifies the stricter certification gate. It is
  a metadata/origin gate, **not** a semantic verifier or an automated jurisdiction
  canvass scraper. 2026 outcomes stay empty. Election night is not certification.
- State Navigate API root is still unavailable (session fetch HTTP 500; local Node
  ECONNRESET). Existing free-page collector is not an API implementation; paid-tier
  districts were not accessed. Examine parsed output, not a green workflow badge.
- Source admission is scoped to the observed page. This session added 20 official
  local pages, not 20 datasets or statewide certified canvasses, and did not
  independently re-fetch all 209 historical registry entries.
- New MSU LV sample n=779 is distinct from adult n=1,000. MoE/recruitment remain
  unknown. Governor modeling withheld until full multi-candidate wording is verified.
  SurveyUSA and Muhlenberg pending requirements were not filled with guessed numbers.
- Conservative nominee matching can withhold legitimate aliases; resolve them only
  with evidence, not fuzzy matching. Historical scenario polls remain visible.
- Session evidence consists of URL-linked observations/excerpts, not retained complete
  byte-identical responses. Long-term public-data evidence storage and licensing
  review remain necessary; current workflow artifacts expire after seven days.
- Existing contest results are historical simulations, not a full persistent
  execution/PnL ledger for today's open markets. See the next-session worklist.
- Follow-up on 2026-09-21 added 14 county election-authority pages plus the
  League of Women Voters homepage and Verified Voting. Those pages are not
  certified canvasses. Baltimore City, Denver, Multnomah, and Salt Lake were
  already in the registry and were not duplicated. Ten other candidate URLs were
  shells, a wrong path, a 404, or a failed fetch and were not admitted
  (irregularity #71). Vote.org and Rock the Vote were recategorized out of
  government (irregularity #70). No turnout or vote totals were invented.

## Session 12 (2026-09-22) — the live 2026 contest, the open-market list, and the control rules

- **The 2026 contest is forward, not settled.** `data/contest/forward-2026/` scores 12 entrants against still-open markets, marked to the captured bid/ask mid. Zero 2026 markets have settled, so the leaderboard is a snapshot and the page says so on every row. Do not read it as a track record. (`model.ranking`, `leaderboard.rankedAsOfNote`)
- **A $100,000 bankroll is derived, not printed.** The Leap's leaderboard shows realized profit in dollars and in percent; 271,783.86 / 2.7178 = 100,001.42, and four further top rows agree to within $3. The rules page independently confirms the 3-day minimum and the realized-P&L ranking. Nothing here claims the rules page prints a balance (irregularity #74).
- **Edition parameters move.** The Leap's minimum trading days and starting balance differ between editions (3 days / $100,000 in the May 2026 crypto and July 2026 rules; 5 days / $250,000 in the September 2026 edition). The season states the configuration it copies. Re-read the current rules before reusing a constant.
- **'Control of Congress' is not a seat count.** CONTROLS-2026 / CONTROLH-2026 resolve on the party of the President pro tempore of the Senate / Speaker of the House on 2027-02-01, with an early media-call determination permitted. The queued majority-51 reading is withdrawn (irregularity #72).
- **No model here may trade an unverified candidate pairing.** The poll layer's exact-name check (`src/poll-layer.js candidateMismatch`) is called by the contest rather than re-derived; 12 of 31 state-race rows are refused with published reasons, including two rows where the poll's candidate is a different person from the market's. The flag is now stored on every stateRaces row, with the universe capturedAt as document provenance (irregularity #77, resolved 2026-09-22). review and comparisonBlockedReason were not flipped. The contest still calls the live function.
- **The site's contest numbers come from an artifact, never from a re-typed total.** `scripts/render-check.cjs` executes every section of the page and fails on undefined/NaN leakage before a build is accepted.
- **The market list is overwritten, not appended,** to bound repository growth. The append-only record of what was captured is `data/kalshi/forward/open-prices.csv` and the daily panels; the list artifact is a view of the latest capture.
- **Session-12 source verification used the page-fetch channel** because the sandbox cannot open TLS to the exchange host (#22). The collectors' own path runs on Actions; the two captures were cross-read against the committed 2026-09-21 panel (identical on CONTROLS, within the overnight move on CONTROLH).
- **Two more sessions' worth of pendingSources remain uncollected** (`echelon-2026-04-fl`, `prri-2026-ava-midterms`, `kff-2026-06-mifepristone-midterms`, `surveyusa-28000-mn`) — they are listed with reasons, never estimated.
- **The poll identity gate can be disarmed by an upstream refactor, so it fails loudly instead.** A capture-loader change in this session dropped the universe document that supplies each market's `yes_sub_title`; the gate then admitted 24 poll rows instead of 19, quietly readmitting a party market and a candidate mismatch. `scripts/run-forward-contest.mjs` now throws when the universe carries no sub-titles, and `test/forward-contest.test.mjs` asserts the five canonical refusals by id. A silent pass here would trade a poll against a market that resolves on a different person.
- **`close_time` is not a resolution date** (irregularity #78). It is the exchange's listing-expiry / cycle timestamp — SENATEAK-26-D, a 2026 race, carries 2027-11-03 — while the control markets carry their real determination date (2027-02-01). The season therefore scopes with a cycle bound and settles only from `data/kalshi/tracker/settlements.json`; the market list publishes the exclusion as its own reason (`closes-after-season-window`, 177 rows on 2026-09-21).
- **`attribution.json` is deliberately bounded.** Per-entrant `byMarket` is capped at the top 100 rows by absolute P&L with explicit `byMarketCount` / `bySeriesCount` / `byMarketTruncated` fields; the unbounded record stays in `season.json`'s fill log. Read the counts, never assume the list is exhaustive.

- **Maker M defaults to 0 and the contest stays taker-only** (irregularity #76, resolved 2026-09-22). The captured `fee_multiplier` is the taker multiplier and is not copied onto maker M. Fee registration now publishes the registration return: 4,185 series with a numeric multiplier, 0 using the documented default (#79). The previous run had counted 4,185 as captured while registering none.
- **The 2026 season's numbers are mark-to-market on 3 captured days, with 9 of 12 entrants unranked.** `crosslayer-arb` shows 3 fills and no rank; `combo-coherence` found no fee-clearing basket on any of the 3 captured days the four legs were priceable (best edge 2026-09-21, ask sum 1.002, fee 0.0375, edge -0.0395; 2026-09-20 recomputed edge -0.0409). None of this is evidence against the theses — it is evidence that the window is short.
