# ROADMAP — remaining work & limitations

Machine-readable twin: `data/roadmap.json`. Ordered by value; each item is self-contained.

## Next work

### R1 · Daily automated collection (networked runner) — P1, IN FLIGHT
Collectors are written and wired: `scripts/collect-universe.mjs` (full open politics/elections
universe + series registry + append-only daily tracker + settled-2026 candle seed →
`data/kalshi/forward/`) and the workflow pair `.github/workflows/universe-collection.yml` (daily
12:40 UTC cron, enabled by default — no variable gate) + `daily-collection.yml` (bootstrap copy with
a temporary push trigger). GitHub-hosted runners have normal network access to the official Kalshi
API, so collection runs there and commits back to the branch (`[skip ci]` on collector commits; the
bot token cannot dispatch workflows — 403 — hence the push-trigger bootstrap). **Status 2026-09-19: LANDED.** Run #5 proved the trigger path (died at the old 30-min timeout → raised
to 90); run #6 collected everything but the fatal lint correctly refused to commit (legacy `meta.json`
provenance — fixed, plus 429 pacing + artifact-on-failure); run #7 succeeded end-to-end: 24,150 open
markets / 4,199 politics series, tracker +24,150 rows, settled-2026 seed 400 with bars, collector
commit `917ee9e`. Once merged, the cron does the daily loop with no further action. Every artifact carries `capturedFrom`+`capturedAt` (lint
enforces; lint is fatal in the workflow after collection).

### R2 · 2024 per-state Senate race markets — P2, collector ready
`scripts/collect-senate-2024-races.mjs` walks all 50 `SENATE{ST}` series via
`GET /historical/markets` (close_time ∈ [2024-11-01, 2025-02-01)), captures daily candlesticks
open→2024-12-01 for every market found, is idempotent (never rewrites an existing capture unless
`--force`), exits 1 on an empty capture, and writes `data/kalshi/historical-2024/senate-races.json`.
It runs inside both workflows right after the universe step; official outcomes for the 18
Kalshi-listed races are already committed (`data/outcomes/senate-2024-official.json`), and the
senate backtest engine + site section consume the capture as soon as it lands. Awaiting the first
successful networked run (see R1).

### R3 · 2026 forward collection with a live calibration tracker — P3
As R1's data accumulates: store each open 2026 market's implied probability daily; compute Brier/
log-loss per market and per calibration bucket as markets settle (first: LA mayor, Nov 3 2026); publish
the running record on the site. **Why:** directly tests the exchange's "70% means 70%" claim on
forward data and the contest theses on 2026 markets — the user's "track expected vs actual".

### R4 · Continuous poll layer (RCP + 2026 poll releases) — P4
Add RCP's daily averages and the 2026 Quinnipiac/other verified releases (anchors already in
`data/polls/verified-polls.json`) to produce a continuous 2026 poll-vs-market spread for poll-anchor
style strategies. **Why:** the 2024 poll miss (−4.3pp) is a single-cycle observation; 2026 is the
replication.

### R5 · Standing cross-market discrepancy monitor — P5
Codify per collect run: D+R complementarity per event (#7), monotone outcome sets (#8),
Kalshi-vs-Polymarket divergence >5pp, web-% vs API-book divergence (#2) → `data/discrepancy-watch.json`.
**Why:** cheap; each catch is a published data-quality result.

### R6 · 2020 poll cycle — P6
Add a 2020 poll-only backtest row (538 2020 averages in the same archive; verified official outcome:
Biden 306 EV, 81,283,501 votes) — no Kalshi 2020 markets existed (exchange launched 2021); state that
explicitly. **Why:** multi-cycle poll error distribution.

### R7 · Strategy population + 2-cycle tournament — P7
New entrants with distinct theories (incumbent-defender on Senate series, seat-count basis arb,
volatility-scaled sizing); cumulative 2-cycle PnL ranking after 2026 settles; The Leap
min-trading-days rule (≥3 trading days to be ranked). **Why:** the competition is the user's explicit
framing; 2024 is a pilot cycle.

### R8 · Provenance hardening — P8, DONE 2026-09-19
Dated per-session sections exist (2026-09-18 base + 2026-09-19 §6 + §7). SHA-256 hashes of the
three poll CSV copies are recorded in `data/polls/PROVENANCE.md`. The IEM entry is corrected and
verified live: `iem.isu.edu` was the wrong domain entirely (Iowa State ≠ University of Iowa); the
real properties `iem.uiowa.edu/iem/` and `iemweb.biz.uiowa.edu/markets/` were fetched directly
(three 2026 congressional-control WTA markets open) — irregularity #26 opened and resolved. The
master list now has **73 entries** (second 20-entry batch verified line-by-line in §7).
**Why:** third-party auditability without network access.

## Current limitations (honest list)

1. Sandbox captures run through a proxied fetch tool (both sessions). The 2026-09-19 sessions verified
   41 additional sources (master list now 73) and corrected the IEM entry to its true University-of-Iowa
   domains (verified live; `iem.isu.edu` was simply wrong — irregularity #26). Three entries remain
   `verified-via-search` where the sandbox proxy blocked direct fetches (Suffolk SUPRC landing page,
   Morning Consult intel tracker, NCSL hub) — each flagged in its own entry. The full open-market
   universe LANDED 2026-09-19 (run #7: 24,150 open markets / 4,199 politics series, commit 917ee9e;
   daily 12:40 UTC cron takes over on main).
2. 2024 market backtest = 3 markets (presidency + both chamber controls). Directionally strong (all
   settled YES on the R side, matching official outcomes), statistically thin.
3. NO-side candle prices are derived reciprocals (1 − yesClose); the raw API publishes only the YES
   side for these series.
4. Poll data ends 2024-09-12 (538 archive cutoff); late-window comparisons reuse the anchor with age
   disclosed.
5. Web-rendered percentages are a display convenience; API books are authoritative where captured and
   divergences are flagged (#2, #7).
6. The GitHub Pages site is a snapshot of 2026-09-19 (53 Node-track sources, 25 irregularities) until the next
   build commit.
