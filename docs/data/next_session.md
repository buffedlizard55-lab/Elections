# Next session (15) — handoff

Updated **2026-09-22**, session 14 pass on `arena/01a0cb4d-elections`.
**Item 1 of the old plan is already done:** the fix was confirmed on a real runner during this
session (run `35796490195`) and that run exposed three further defects, now fixed as #82/#83/#84.
Primary audit for this pass: `VERIFICATION.md` §20 (session 13) plus the run-log evidence quoted in
irregularity **#81** below. Do not interpret a passing test as independent confirmation of a source's truth.

## Delivered in session 14 (this pass)

- **Found and fixed a silent production failure (#81, high).** The daily `daily-collection`
  workflow had been **losing an entire collection phase for two days without reporting it**.
  `scripts/collect-universe.mjs` fetched the ~4,200 politics/elections series strictly serially
  (measured from the run log: 17.87 min for 4,223 series = 0.254 s/series = 3.94 req/s), which left
  too little of the 25-minute step timeout for the settled-2026 seed phase. The runner killed the
  step **before `settled-2026-seed.json` was written** on both 2026-09-21 (run `35637340481`, step 9
  ran 18:18:50Z→18:44:03Z = 25.22 min) and 2026-09-22 (run `35758788558`, 17:12:07Z→17:37:19Z =
  25.20 min). Both steps are `continue-on-error`, so the GitHub API still reports step 9 of the
  9/21 run as `conclusion: success` and the whole run was green — the failure was invisible.
  Evidence: the seed is still stamped `2026-09-19T04:56:27.917Z` with 9,350 markets / **400 bars /
  8,950 skipped**, and `meta-2026-09-19.json` is the only meta file in the repository even though the
  collector has run every day since.
  - **Fix (a) bounded concurrency.** `--concurrency` (default 6). Kalshi's documented Basic-tier read
    budget is 200 tokens/s at 10 tokens per request = **20 req/s sustained**
    (<https://docs.kalshi.com/getting_started/rate_limits.md>, read 2026-09-22); 6-way concurrency with
    the existing pacing stays at roughly a fifth of that ceiling.
  - **Fix (b) a wall-clock budget.** `--budget-minutes` (default 20) is checked by every phase before
    it enqueues more work, so **all five artifacts are always written** rather than the process being
    killed mid-phase. The workflow now allows **30 min** and passes `--budget-minutes 24`, a 6-minute
    write margin. A test asserts `budget < timeout` so the two can never be edited out of sync again.
  - **Fix (c) truncation is data, not an inference.** `meta-<date>.json` carries
    `runtime.{concurrency,budgetMinutes,elapsedMinutes,budgetExhausted,complete,phasesTruncated}`,
    `universe-open.json` carries `complete` + `seriesQueried` vs `seriesEligible`, and a new
    *Report universe capture completeness* step emits `::warning::` when `complete` is false.
  - **Fix (d) determinism under concurrency.** Workers finish in arbitrary order, so every written
    collection is now explicitly ordered (open rows sorted by ticker; seed `markets`/`bars`/
    `candleEndpoint` key-sorted; `skipped` and `errors` sorted; the candle queue sorted by
    `close_time` with a **ticker tiebreak** so the `--max-candles` cap picks the same set every run).
    Verified: two runs against a jittered-latency mock produced **byte-identical** output.
  - Verified offline against a mock API: peak concurrency never exceeded 6; a deliberately exhausted
    budget still wrote all five files and recorded both truncated phases; the next full run recovered
    the 10 missing series; a repeat run appended **0** duplicate CSV rows.
- **Confirmed #81 on a real runner, and found three more defects doing it (#82/#83/#84, all high).**
  Pushing this branch triggered `daily-collection` run `35796490195`. It **proved the #81 fix**: the
  open phase completed **4,225/4,225 series**, the step ran **34m30s** and was never killed, and every
  artifact was written. The same run's `meta-2026-09-22.json` then exposed three defects that no
  offline mock could have produced:
  - **#82 — the concurrency change exceeded Kalshi's rate limit.** The `--concurrency 6` justification
    compared the *serial* rate (3.94 req/s) against the 20 req/s ceiling; the figure that matters is
    the *aggregate*, 6 × 3.94 = **23.6 req/s**. The run logged **18 HTTP 429 errors**, each one a
    series silently dropped from the sweep. A per-worker `sleep(80)` bounds one worker, never the
    aggregate. `src/kalshi-live.js` now has a **process-wide token bucket** (default 14 req/s,
    `KALSHI_MAX_RPS`) shared by every `getJson()` caller, retries raised 2 → 4 with **jittered**
    exponential backoff, and a 429 debits the global bucket. Measured against a local counting
    server: peak in any 1-second window fell **64 → 17 req/s**, under the documented 20.
  - **#83 — a truncated phase re-walked the same prefix forever.** `mapPool` always starts at index 0,
    so discovery stopping at **738/1,890** meant series 739–1,890 were **unreachable on every future
    run**. Now the Elections list is ticker-sorted and a **rotating cursor** (`seed.discoveryCursor`)
    persists the resume point. Verified on a 120-series mock: four truncated runs covered
    36 → 72 → 108 → 120 with bars growing 5 → 10 → 15 → 20; a fifth complete run reset the cursor to 0.
  - **#84 — discovery starved the candle phase of budget entirely.** Discovery is ~41 min of work and
    absorbed the whole 24-min budget, so the candle phase got **0/400** and the bars that feed
    calibration had not grown since 2026-09-19. `mapPool` now takes a per-phase deadline and
    discovery runs against an earlier one, reserving `--candle-reserve` (default 35%). Verified: a
    budget tight enough to truncate discovery at 36/120 still fetched 5 new candle sets (was 0).
  - Workflow retuned to **45 min timeout / 38 min budget**, and the completeness reporter now also
    warns on `rateLimited429` and prints the next discovery cursor.

- **The "full list" is now actually browsable (site).** The project's stated goal is "a full list that
  follows our requirements", but the site published only *counts* — the 24,139-row list existed solely
  as a 4.5 MB CSV. New **All Markets** section: searchable by ticker/outcome/series, filterable by
  eligibility verdict and US-election tag, paged (100 rows, "Show more"), with a per-series roll-up
  computed over **all 24,139 rows** (not just the browsable slice) and a direct link to the canonical
  CSV. New artifact `data/kalshi/universe/market-list-browse.json` (top 3,000 by volume, positional
  layout). Roll-up arithmetic is checked: series totals sum to 24,139 and eligible sums to 6,384,
  both matching the canonical list exactly.
- **Checks extended.** `scripts/render-check.cjs` now renders the new section and asserts its required
  content (table shell, search control, CSV link) and forbids its empty-state fallback. Tests:
  **156 → 163**, all passing (162 pass + 1 intentional skip). Lint clean. Irregularities 80 → **84**.
- **Verified against the live exchange.** `CONTROLH-2026-D`, `CONTROLS-2026-D` and `SENATEAK-26-D`
  were re-read from `GET /markets?tickers=…` during this session: tickers, `close_time`,
  `yes_sub_title` and rules text match the captured rows field-for-field (prices had moved in the
  ~6 h since capture, as expected — the page labels prices as a capture, not a live quote).

## Remaining work (priority order)

1. **Verify #82/#83/#84 on the next real runner (P0, do this first).** Pushing this branch triggered
   [run `35796490195`](https://github.com/buffedlizard55-lab/Elections/actions/runs/35796490195),
   which **confirmed the #81 fix** (open phase 4,225/4,225 series, 34m30s, never killed, every
   artifact written) and exposed #82/#83/#84. Those three fixes are again **mock-verified only**.
   On the next run check `meta-<today>.json` for:
   `runtime.rateLimited429` → should be **0** (was 18);
   `runtime.discoveryCursorNext` → should **advance** run over run, or be 0 after a complete sweep;
   `settled2026WithBars` → must be **> 400 and rising** (frozen at 400 since 2026-09-19);
   `runtime.elapsedMinutes` → should sit under the 38-minute budget inside a 45-minute step.
   If 429s reappear, lower `KALSHI_MAX_RPS` (env, default 14) before touching `--concurrency`.
2. **Backfill the ~9,009 missing candle seeds.** With `--candle-reserve` the phase now always makes
   progress, but the cap is still `--max-candles` (400) per run, so a full backfill is ~22 complete
   runs. Consider a one-off `workflow_dispatch` with a raised `--max-candles`/`--budget-minutes`, or
   accept the gradual fill — but **decide and record it**, because the R3 calibration sample size
   depends on it. Note the discovery sweep itself needs ~41 min at the observed rate, so with the
   rotating cursor a full sweep now completes about every second run.
3. **Score the Metaculus-vs-Kalshi gap (P0 for the project).** `crosslayer-arb` has four days of
   signal and no settlement; the question stays unscored until the canvass runs.
   `controlQuestion.resolutionRule.confirmed` must stay false.
4. **First post-election canvass pass (after 2026-11-03).** Then the 2026 contest converts from
   mark-to-market to realised and the live calibration scorer gets its first `scoreableMarkets`
   (still 0 today by design). Election day remains 2026-11-03.
5. **Open the entry windows the entrants are waiting on.** `momentum-mule`, `fader-flipper` and
   `shock-surfer` need 5–7 days of history; `yield-yak` and `breakout-bandit` need to be inside
   14/7 days of the election; `poll-anchor-26` and `ratings-ratchet` need a poll capture that predates
   a price panel. All are published as unranked with a reason; verify each fires when its window
   opens rather than assuming it will.
6. **Modelling gaps that bound the current results.** Maker M defaults to 0 and the contest stays
   taker-only; there is still no order-book depth (fills are taker-only at the captured top of book).
   `logistic(k=4.5)` is still a labelled heuristic imported from the 2024 national backtest and is the
   binding assumption behind every poll gap.
7. **Poll-layer backlog:** pendingSources `echelon-2026-04-fl`, `prri-2026-ava-midterms`,
   `kff-2026-06-mifepristone-midterms`, `surveyusa-28000-mn`; candidate re-tests per #53;
   SurveyUSA/HarrisX/CourtListener re-tests; blocked official paths (WI/NV/CA/MA) re-probe;
   Bexar/Tarrant/Hennepin headless-render re-test.
8. **Audit the other `continue-on-error` steps for the same blind spot as #81.** The completeness
   reporter now covers the universe capture, but the Metaculus / State Navigate / rendering /
   host-probe steps are all `continue-on-error` too and could fail silently in the same way.
9. **Bound repository growth.** `season.json` is ~0.92 MB with four days of fills (it was ~0.78 MB at
   three days, so it grows ~0.2 MB/day and will pass 10 MB before election day); `open-prices.csv` is
   14 MB and append-only, growing ~3.6 MB/day; the new `market-list-browse.json` is 0.7 MB and
   overwritten, not appended. Decide whether to rotate the fill log and the price CSV monthly (e.g.
   `open-prices-YYYY-MM.csv`), and record the decision.

## Limitations (unchanged + new)

- Sandbox has **no general egress**: node `fetch` and `curl` fail TLS to the exchange host, so live
  collection runs only in GitHub Actions. #81 has now been confirmed on a real runner, but the
  **#82/#83/#84 fixes are mock-verified only** — item 1 above is what closes that gap. The general
  lesson from this session: an offline mock cannot reproduce rate limits, and a single run cannot
  reveal starvation that only shows up across consecutive runs. Treat "verified against a mock" as
  provisional until a real run agrees.
- **Zero settled 2026 outcomes.** All 462 settlements on file predate the first capture, so the live
  scorer is legitimately empty and the contest leaderboard is a mark-to-market snapshot. Nothing on
  the site presents it as a track record.
- **Four captured days is not a season.** Nine of the twelve entrants are unranked.
- The **settled-2026 candle seed is still 400 bars against 9,409 discovered markets** (~9,009 short)
  until item 2 lands; `data/calibration-2026.json` scores only the 400 markets that have bars. The
  cause is now fixed (#84) rather than merely described, but the backlog itself is unchanged.
- The site's **All Markets** table shows the 3,000 highest-volume rows; the complete 24,139-row list
  is the CSV, and the page says so. Per-series totals cover all rows.
- Prices on the site are a **capture**, not a live quote.
- Four hosts are fetch-blocked or bot-walled (WI/NV/CA/MA officials).
- Cygnal + Change Research remain at `needs-review`; the ratings bands remain a labelled heuristic, so
  `ratings-ratchet`'s result is evidence about the heuristic, never a correction of the publishers.
