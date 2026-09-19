# ROADMAP — remaining work & limitations

Machine-readable twin: `data/roadmap.json`. Ordered by value; each item is self-contained.

## Next work

### R1 · Daily automated collection (needs a networked runner) — P1
`scripts/collect-kalshi.mjs` is written and paginates the live + historical tiers, but the 2026-09-18
sandbox had no general internet, so it has **not** been exercised live. The committed workflow
(`.github/workflows/daily-collection.yml`) is disabled by default (`vars.COLLECT_ENABLED`) until a
proven dry-run passes. Once enabled it accumulates, daily: the full open-market universe, order books,
candlestick history for new markets, and settled markets into the historical tier — every artifact
carrying `capturedFrom`+`capturedAt` (the lint enforces it). **Why:** forward collection is an explicit
project requirement, and the 2026 evidence base grows daily.

### R2 · 2024 per-state Senate race markets — P2
This session verified the `PRES`, `CONTROLH`, `CONTROLS` series (2024 settled + 2026/2028 live). The
per-state 2024 Senate tickers were **not** found by guessing and the API has no public search endpoint.
Next: enumerate `GET /historical/markets` by event-ticker pattern, or mine kalshi.com slugs for 2024
Senate pages; capture candlesticks; extend the multi-market backtest from 3 to ~40 markets.
**Why:** the single biggest backtest-power upgrade (state-level structure: incumbency, partisans,
toss-up buckets).

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

### R8 · Provenance hardening — P8 (partially done 2026-09-19)
Dated per-session sections now exist (2026-09-18 base + 2026-09-19 §6, including the 21-entry
expansion, URL corrections, and fetch-failure records). **Remaining:** add SHA-256 hashes of the
CSV copies in `data/polls/PROVENANCE.md`; re-verify `iem.isu.edu` directly (the 2026-09-19 fetch
failed via the sandbox proxy — the entry is marked `verified-via-search`).
**Why:** third-party auditability without network access.

## Current limitations (honest list)

1. Sandbox captures run through a proxied fetch tool (both sessions). The 2026-09-19 session verified
   21 additional sources directly (master list now 53), but `iem.isu.edu` and the IEM 2026 prospectus
   PDF could not be fetched directly (proxy errors) — that entry is verified-via-search and needs a
   networked re-check. The full open-market universe still awaits R1.
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
