# NEXT_SESSION — handoff after the 2026-09-19 branch merge (PR #5 ← session-3 main)

Two parallel sessions landed on 2026-09-19 and were merged into one repo state (this branch →
main via PR #5). Everything below describes the **merged** steady state.

## What is live right now (do not rebuild)

- **One daily collection pass** — `.github/workflows/daily-collection.yml`, cron **12:30 UTC**,
  opt-out via repo variable `COLLECT_DISABLED=true`; push trigger on `arena/**` for collector paths.
  Steps in order: their compact collector (`scripts/collect-kalshi.mjs` → `data/kalshi/universe/`,
  `tracker/`, settlements, calibration, consistency) → conditional 2024 Senate capture
  (`collect-senate-2024.mjs`) → **forward-loop FULL universe** (`collect-universe.mjs` →
  `data/kalshi/forward/`, continue-on-error) → **per-state Senate races with candles**
  (`collect-senate-2024-races.mjs` → `data/kalshi/historical-2024/`) → **forward analytics**
  (`run-senate-backtest.mjs`, `run-calibration.mjs`) → Python sample (`fetch_kalshi.py`) →
  cross-check → `npm run pipeline` → `sync_site_data.py` → lint + tests → artifacts (7 d) →
  commit-with-rebase-retry. The former `universe-collection.yml` (12:40 UTC) was **deleted** at
  merge — its steps run inside this workflow now. Job timeout 90 min.
- **Master source list**: `data/sources/master.json` = **85 entries** (base 53 + session-3 20 +
  late batch 12 unique; 8 institutions verified in both 2026-09-19 batches were merged into single
  entries with labelled second-batch addenda). `VERIFICATION.md` §6/§7/§8 are the audit logs
  (N-labels are batch-local; master.json ids are canonical).
- **Irregularities**: 29 items (`data/irregularities.json`, ids 1–12, 23–39) mirrored in
  `IRREGULARITIES.md`. #26 (IEM host) resolved — `iemweb.biz.uiowa.edu/markets/` fetched live,
  three 2026 congressional-control markets open. #29 (Quinnipiac mis-dated to June) resolved in
  BOTH layers — the row is `quinnipiac-2026-07` everywhere now.
- **2024 Senate backtest**: two complementary captures, both cross-checked 100% against
  `data/outcomes/senate-2024-official.json` — theirs (`historical/senate-2024.json`, 36 markets +
  1,269 bars, in `npm run backtest`) and the forward loop's (`historical-2024/senate-races.json` →
  `data/senate-2024-backtest.json`: T-7 mean Brier 0.101 over 22 scored markets; hold-official-winner
  at T-7 = +0.2755 $/contract over 11 races).
- **Calibration**: theirs (`tracker/calibration.json`) is look-ahead-guarded and empty by design
  until pre-settlement-priced markets settle (207 pre-tracker settlements deliberately unscored).
  The forward loop's (`data/calibration-2026.json`) scores the 400 settled-2026 candle-seed markets
  at T-1..T-60 (T-1 n=300) + tracks headline series daily. First live settlement wave: **Nov 3 2026**
  (LA mayor, 35 Senate races, governors).
- **Site**: one bundle (`src/data/site-data.js`, ~1.5 MB) with both data layers; sections: overview,
  2026 Markets, 2026 Polls, Tracker, **Forward Loop (full universe)**, Backtests (both Senate views),
  Contest, Sources, Irregularities, Methodology, Roadmap. `scripts/render-check.cjs` renders every
  section headlessly (11 sections) — keep it in sync with `SECTIONS` in `src/site/app.js`.

## P0 — first things next session

1. **Watch the first post-merge cron run** (12:30 UTC daily): confirm ALL steps green, both data
   layers commit, and the artifact contains `data/kalshi/forward/` + `historical-2024/`.
2. If a step fails: `tracker/daily/<date>.error.json` and/or the run log tells you which collector;
   the forward-loop steps are continue-on-error so the main pipeline is never blocked by them.

## P1 — polish (small, safe)

- **UI dedup**: Tracker/Polls (session-3 data) vs Forward Loop (forward data) show overlapping
  concepts from two capture pipelines. Consider unifying the views or cross-linking them; the
  bundle keys are already disjoint (`universe`/`calibration`/`pollLayer` vs
  `universeSummary`/`calibrationForward`/`polls2026`/`senate2024Races`).
- Test count references in README (`45 tests`) should match `npm test` output after every suite change.

## P2 — open roadmap items (see ROADMAP.md for all 10)

- R6: 2020 poll-only backtest row (no Kalshi markets existed pre-2021 — state explicitly).
- R7+: state-legislative layer via the NCSL 2026 hub (6,139 seats / 88 chambers) — entry `ncsl-elections`.
- Exit polls: confirm Edison/SSRS 2026 coverage before using any exit-poll data (still unconfirmed).
- Python track: wire `backtest/` engines to the verified datasets (they run on labeled synthetic data).
- IEM direct re-verify beyond the markets board (proxy blocked deeper pages); RCP page freshness (#15),
  AP VoteCast 2026 status (#17), Harvard Dataverse homepage (#19) re-checks.

## Gotchas learned the hard way

- Kalshi `status=finalized` markets sit INSIDE open events (207 found) — any new scorer must keep the
  look-ahead guard (a post-settlement price is not a forecast). See irregularity #37.
- `mutually_exclusive` does NOT imply an exhaustive outcome set (#32).
- Some official hosts block bots: `results.enr.clarityelections.com/GA` (403), `sos.nh.gov` results
  (403), NYT toplines (#35). The proxy also intermittently 502s (IEM earlier) — record, re-verify later.
- Bot commit step rebases with `-X theirs` on generated files; never hand-edit `src/data/site-data.js`,
  `docs/data/*`, `ROADMAP.md` (generated by `scripts/gen-roadmap.mjs` from `data/roadmap.json`).
