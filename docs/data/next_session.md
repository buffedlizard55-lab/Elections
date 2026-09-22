# Next session (13) — handoff

Updated **2026-09-22**, session 13 pass on `arena/01a0c7eb-elections`.
Primary audit for this pass: `VERIFICATION.md` §20. Session 12 remains `VERIFICATION.md` §18–§19. Do not interpret a passing test as
independent confirmation of a source's truth.

## Delivered in session 13 (this pass)

- **Two failing tests repaired.** `test/forward-contest.test.mjs` — "the signals ledger is one row per published signal per captured day" — hard-coded the 3-day horizon (`days.size === 3`, `kinds.poll === admitted * 3`, poll/rating must be unusable on ANY captured day, `pollLayer.asOf === lastCapturedDay`). Now that the daily workflow has produced a fourth captured day, three of those assertions no longer match the data. The test is rewritten to use the actual `days.size` and to assert the **real** look-ahead invariant — that a poll/rating row is usable only on a trading day **strictly after** the poll layer's capture date. 19 admitted poll rows × 4 days = 76 poll rows in the ledger, of which 19 (the day-after capture) are usable; no look-ahead leak. `test/verification-gates.test.mjs` — "wrong nominees are retained as history but never compared as the current matchup" — asserted `poll-layer-2026.json::candidateMismatchProvenance.universeCapturedAt === universe/latest.json::capturedAt`. The provenance was stale because the universe was re-captured (2026-09-22) after the session-11 patch (2026-09-21). New `scripts/refresh-poll-layer-provenance.mjs` re-anchors the field to whatever the universe currently carries and is idempotent; the field now reads `2026-09-22T17:09:13.388Z`. Both fixes preserve the original invariants the tests were meant to enforce.
- **Package.json script name fixed.** `package.json` `pipeline` referenced `npm run gen-roadmap` but the script key was `roadmap`; the pipeline crashed at the roadmap step. Renamed the reference; the full pipeline (`backtest + contest + contest-forward + crosslayer + build-site + market-list + roadmap + render-check`) now runs end-to-end without manual steps.
- **Tests green again.** 155 pass, 0 fail, 1 skipped (intentional). Lint clean. Site bundle rebuilt and verified (`scripts/render-check.cjs`; no template leaks across all 13 sections).
- **Site + bundle regenerated.** `src/data/site-data.js` rebuilt from the current data files (2026-09-22 capture, 4-day signals ledger, refreshed poll-layer provenance). GitHub Pages deploys from the `main` branch root, so the bundle will land at https://buffedlizard55-lab.github.io/Elections/ as soon as this branch is merged.
- **Counts unchanged this pass.** Master list 267 sources (no new entries); irregularities 79; tests 156; the 24,150-market open universe and the 12-entrant live 2026 contest were not regenerated for content.

## Delivered in session 12

- **Live 2026 contest (R16) — new.** `src/contest/forward-universe.js` (offline contest
  universe + the shared capture loaders, so the season and the market list read byte-identical
  inputs), `src/contest/forward-engine.js` (mark-to-market replay, exact accounting identity
  that **throws** rather than warns, per-entry fee accounting, participation cap, pro-rata
  daily deployment ceiling, `sideMark` so a NO position is marked `1 − yesMid`),
  `src/contest/strategies-forward.js` (12 entrants: 7 carried over unchanged from 2024 — the
  test asserts object identity of their `decide()` functions — plus 5 new 2026 theses),
  `scripts/run-forward-contest.mjs` (8 artifacts under `data/contest/forward-2026/`),
  `test/forward-contest.test.mjs` (**35 tests**), and the site section `Live 2026 Contest`.
- **Canonical open-market list — new.** `scripts/build-market-list.mjs` writes
  `data/kalshi/universe/market-list-latest.{csv,json}`: every open political/election market
  (24,102) with an eligibility verdict and reason, plus a reconciliation ladder that must close
  arithmetically (10,981 + 13,120 + 200 = 24,301) or the script exits non-zero. Every row lands
  in a reason the universe builder actually applies — an `unclassified` row is now a build
  failure, not a bucket.
- **Irregularity #78 filed** — `close_time` is the exchange's listing-expiry / cycle field, not
  a resolution date (SENATEAK-26-D, a 2026 race, carries 2027-11-03). The season scopes with
  `SEASON.closesBy` and settles only from a captured official result.
- **Silent-failure guard.** The poll identity gate is asserted non-empty at runtime and pinned
  by tests: if the captured universe document ever drops out of the loaders, the run fails
  instead of quietly admitting markets that resolve on another person.
- **Control-market rules captured (closes the old item 1).** The queued "majority 51 + VP
  tiebreak" reading is **withdrawn** (irregularity #72).
- **Counts.** Master 265 → 267 sources; irregularities → **#78**; tests 110 → **146**.


## Delivered this pass

- **Identity flags stored (#77 resolved).** `candidateMismatch()` is written onto every `stateRaces` row in `data/polls/poll-layer-2026.json`, with `candidateMismatchProvenance.universeCapturedAt` equal to the universe capture `2026-09-21T18:16:44.622Z`. `review` and `comparisonBlockedReason` were not flipped. The contest still calls the live function. Six rows store a refusal string (the five previously unflagged identity rows, plus `nyt-siena-2026-07-ak-senate`, which already had `review: true`). The site shows an `identity` chip whose title is that string, and a `stored/live disagree` chip if the stored flag and a fresh recompute ever diverge.
- **Fee registration no longer counts a silent skip (#79).** The runner passes `fee_type` and `fee_multiplier`, uses the registration return, and throws if that return is not the count of series with a numeric multiplier. This run registered **4185** and used the documented default for **0**. Maker M defaults to 0 (`makerFee`, coefficient 0.0175) and is not copied from the captured taker multiplier (#76 resolved). The contest remains taker-only. Published PnL did not move: no fill used one of the 10 series whose captured multiplier is 0, and every traded series has multiplier 1.
- **Cross-layer fills reconciled.** `data/contest/forward-2026/crosslayer-fills.json` ties all three `crosslayer-arb` entries to a prior snapshot. `2026-09-20` `CONTROLS-2026-D` NO binds to `2026-09-19-senate` (crowd 0.517, snapshot mid 0.595, panel mid 0.595). `2026-09-21` `GOVPARTYMI-26-D` binds to `2026-09-20-governor-mi-2026` (crowd 0.85, snapshot mid 0.915, panel mid 0.9165). `2026-09-21` `SENATEAK-26-D` binds to `2026-09-20-senate-ak-2026` (crowd 0.54, snapshot mid 0.695, panel mid 0.705). Each fill price is the taker cross and each fee equals `takerFee` on the fill's series. Nothing was auto-filed.
- **Basket edges recorded for every priceable day.** All three captured days had the four legs eligible and traded. Best edge remains **2026-09-21** (ask sum 1.002, fee 0.0375, edge −0.0395). **2026-09-20** recomputed from the panel is ask sum 1.002, fee 0.0389, edge −0.0409 — not the earlier hand figure. **2026-09-19** is ask sum 1.012, fee 0.0395, edge −0.0515. Pair attempts 6. Trades 0. The independent scan agrees with `combo-coherence`.
- **Look-ahead guard is inside `decide()`.** `signalsForTradingDay` is what the runner uses. `poll-anchor-26` and `ratings-ratchet` also refuse a row whose `asOf` is not strictly before the trading day. Published orders did not change: 19 of 31 poll rows admitted, 12 refused, poll and rating signals still unusable on every captured day.

## Remaining work (priority order)

1. **Score the Metaculus-vs-Kalshi gap (P0 for the project).** `crosslayer-arb` has three days
   of signal and no settlement; the question stays unscored until the canvass runs.
   `controlQuestion.resolutionRule.confirmed` must stay false — the confirmed rule is the one
   captured in §18c, not the withdrawn assumption. Do not score Metaculus from this handoff.
2. **First post-election canvass pass (after 2026-11-03).** Then the 2026 contest converts from
   mark-to-market to realised, and the live calibration scorer gets its first `scoreableMarkets`
   (still 0 today by design). Election day remains 2026-11-03.
3. **Open the entry windows the entrants are waiting on.** `momentum-mule`, `fader-flipper` and
   `shock-surfer` need 5–7 days of history; `yield-yak` and `breakout-bandit` need to be inside
   14/7 days of the election; `poll-anchor-26` and `ratings-ratchet` need a poll capture that
   predates a price panel. All are published as unranked with a reason; verify each fires when
   its window opens rather than assuming it will.
4. **Modelling gaps that bound the current results.** Maker M now defaults to 0 and the contest
   stays taker-only; there is still no order-book depth (fills are taker-only at the captured
   top of book). `logistic(k=4.5)` is still a labelled heuristic imported from the 2024 national
   backtest and is the binding assumption behind every poll gap.
5. **Poll-layer backlog:** pendingSources `echelon-2026-04-fl`, `prri-2026-ava-midterms`,
   `kff-2026-06-mifepristone-midterms`, `surveyusa-28000-mn`; candidate re-tests per #53;
   SurveyUSA/HarrisX/CourtListener re-tests; blocked official paths (WI/NV/CA/MA) re-probe;
   Bexar/Tarrant/Hennepin headless-render re-test.
6. **Third-party corroboration of the contest's own numbers.** The 2026-09-21 capture of
   `CONTROLH-2026-D/R` and `CONTROLS-2026-D/R` has been re-read once (§18d) and matches.
   Extend that to a standing daily re-read so a capture-pipeline regression is caught the day
   it happens.
7. **Bound repository growth.** `season.json` is about 0.78 MB with three days of fills;
   `attribution.json` is bounded by design (top 100 markets per entrant + counts). Decide
   whether to rotate the fill log monthly, and record the decision.

## Limitations (unchanged + new)

- Sandbox has **no general egress**: node `fetch` and `curl` fail TLS to the exchange host, so
  live collection runs only in GitHub Actions. Session-12 verification used the page-fetch
  channel (listed in `VERIFICATION.md` §18a).
- **Zero settled 2026 outcomes.** All 356 settlements on file predate the first capture, so the
  live scorer is legitimately empty and the contest leaderboard is a mark-to-market snapshot.
  Nothing on the site presents it as a track record.
- **Three captured days is not a season.** Nine of the twelve entrants are unranked — eight
  with no trade at all, one short of the 3-day minimum.
- Four hosts are fetch-blocked or bot-walled (WI/NV/CA/MA officials).
- `market-list-latest.csv` is overwritten each run, not appended, to bound growth; the
  append-only record remains `data/kalshi/forward/open-prices.csv` and the daily panels.
- Cygnal + Change Research remain at `needs-review`; the ratings bands remain a labelled
  heuristic, so `ratings-ratchet`'s result is evidence about the heuristic, never a correction
  of the publishers.
