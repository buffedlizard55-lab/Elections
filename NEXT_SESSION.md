# Next session (13) — handoff

Updated **2026-09-22**, end of session 12 on `arena/01a0c732-elections`.
Primary audit for this session: `VERIFICATION.md` §18–§19. Do not interpret a passing test as
independent confirmation of a source's truth.

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

## Remaining work (priority order)

1. **Persist the computed candidate-mismatch flag onto the poll-layer rows** (irregularity
   #77). It is computed at read time by `src/poll-layer.js`, so a consumer that reads
   `data/polls/poll-layer-2026.json` directly can pair a poll with a market that resolves on a
   different person — five rows are refused by the canonical check today
   (`uh-hobby-2026-01-tx-governor`, `uh-hobby-2026-01-tx-senate`, `saint-anselm-2026-06-nh-senate`,
   `stetson-2026-04-fl-senate`, `rasmussen-2026-09-ak-senate`). Apply in one pass with the site
   bundle so the JSON, the site and the contest cannot disagree.
2. **Correct the maker default in `src/fees.js`** (irregularity #76): the schedule gives the
   maker multiplier default as 0, the comment says 1. No published number is affected.
3. **Reconcile the `crosslayer-arb` fills against the captured snapshot set.** The entrant
   traded two days on signals from a 27-row snapshot file; the exact question-to-ticker mapping
   is not yet published row by row. Either publish it or widen the refusal.
4. **Score the Metaculus-vs-Kalshi gap (P0 for the project).** `crosslayer-arb` has three days
   of signal and no settlement; the question stays unscored until the canvass runs.
   `controlQuestion.resolutionRule.confirmed` must stay false — the confirmed rule is the one
   captured in §18c, not the withdrawn assumption.
5. **First post-election canvass pass (after 2026-11-03).** Then the 2026 contest converts from
   mark-to-market to realised, and the live calibration scorer gets its first `scoreableMarkets`
   (still 0 today by design).
6. **Open the entry windows the entrants are waiting on.** `momentum-mule`, `fader-flipper` and
   `shock-surfer` need 5–7 days of history; `yield-yak` and `breakout-bandit` need to be inside
   14/7 days of the election; `poll-anchor-26` and `ratings-ratchet` need a poll capture that
   predates a price panel. All are published as unranked with a reason; verify each fires when
   its window opens rather than assuming it will.
7. **`combo-coherence` has no trade and no published edge.** Its `bestObservedEdge` was
   **negative** at the only capture where all four legs quoted together (2026-09-20:
   cost 0.986 + fees 0.0377 → −0.0237). Either find the row where the basket clears fee-aware
   cost or record that the complex was not arbitrageable in this window.
8. **Modelling gaps that bound the current results.** No maker modelling and no order-book
   depth (fills are taker-only at the captured top of book); `logistic(k=4.5)` is still a
   labelled heuristic imported from the 2024 national backtest and is the binding assumption
   behind every poll "gap".
9. **Poll-layer backlog:** pendingSources `echelon-2026-04-fl`, `prri-2026-ava-midterms`,
   `kff-2026-06-mifepristone-midterms`, `surveyusa-28000-mn`; candidate re-tests per #53;
   SurveyUSA/HarrisX/CourtListener re-tests; blocked official paths (WI/NV/CA/MA) re-probe;
   Bexar/Tarrant/Hennepin headless-render re-test.
10. **Third-party corroboration of the contest's own numbers.** The 2026-09-21 capture of
    `CONTROLH-2026-D/R` and `CONTROLS-2026-D/R` has been re-read once (§18d) and matches.
    Extend that to a standing daily re-read so a capture-pipeline regression is caught the day
    it happens.
11. **Bound repository growth.** `season.json` is ~0.78 MB with three days of fills;
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
