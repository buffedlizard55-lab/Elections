# NEXT_SESSION — handoff after the session-4 merge (PR #6, `arena/01a0bada-elections` → main)

Session 4 (2026-09-19) added **20 newly verified master-list sources**, **10 new irregularities
(#40–#49)**, a **category taxonomy over the whole registry**, a **rebuilt Sources view on the site**,
and **3 roadmap items (R11–R13)**. Everything below describes the merged steady state.

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
  merge — its steps run inside this workflow now. Job timeout 90 min. Cron only fires on the
  **default branch**, so work must reach `main` to keep the loop running.
- **Master source list**: `data/sources/master.json` = **105 entries** (base 53 + session-3 20 +
  late batch 12 unique + **session-4 20**; 8 institutions verified in two 2026-09-19 batches were
  merged into single entries with labelled second-batch addenda). 73 entries carry
  `verifiedOn: 2026-09-19`. Every entry now also carries a **`category`** (9 values, tally published
  in the file's `categories` array) — `scripts/lint-verified.mjs` fails on unknown categories, a
  tally mismatch, duplicate ids or duplicate urls, and on a missing `notes` field for any entry
  verified after 2026-09-18. `VERIFICATION.md` §6/§7/§8/§9 are the audit logs (N-labels are
  batch-local; master.json ids are canonical). **Session 4's evidence is §9 (N42–N61) with §9a
  cross-checks, §9b the taxonomy, §9c what was NOT added and why, §9d reversals of §8 deferrals.**
- **Irregularities**: **49 items** (`data/irregularities.json`, ids 1–12, 23–49) mirrored in
  `IRREGULARITIES.md` — the lint compares the md table and the JSON id-for-id. #26 (IEM host) and
  #29 (Quinnipiac mis-dated) stay resolved in both layers. New in session 4: #40 Wisconsin
  `/elections-voting` "Access denied" (root fetches fine), #41 Nevada `/sos-elections` 404 (canonical
  is `/elections`), #42 California `elections.cdn.sos.ca.gov` S3 AccessDenied (www.sos.ca.gov works),
  #43 **Harris Poll ≠ HarrisX** (harrispoll.com is consumer/market research; the political brand is
  thehillx.com, unfetchable this session), #44 CES moved Harvard → Tufts Tisch (cces.gov.harvard.edu
  is a stale 2024 shell pointing at the new site), #45 healthyelections.org 500 → the archived
  Stanford–MIT project lives at `web.mit.edu/healthyelections/www/home.html`, #46 270toWin renders a
  **last-trade** Kalshi price, not the order book (compared within 1¢; its own disclaimer says the
  figures "may not total 100%"), #47 three candidates excluded because the fetcher could not reach
  them (SurveyUSA, HarrisX, CourtListener), #48 selzerco.com is an empty JS shell, #49 method-mixing
  risk when combining differently-weighted polls (Saint Anselm weights by age/gender/geo/education,
  **not** party).
- **2024 Senate backtest**: two complementary captures, both cross-checked 100% against
  `data/outcomes/senate-2024-official.json` — theirs (`historical/senate-2024.json`, 36 markets +
  1,269 bars, in `npm run backtest`) and the forward loop's (`historical-2024/senate-races.json` →
  `data/senate-2024-backtest.json`: T-7 mean Brier 0.101 over 22 scored markets; hold-official-winner
  at T-7 = +0.2755 $/contract over 11 races).
- **Calibration**: theirs (`tracker/calibration.json`) is look-ahead-guarded and empty by design
  until pre-settlement-priced markets settle (207 pre-tracker settlements deliberately unscored).
  The forward loop's (`data/calibration-2026.json`) scores the 400 settled-2026 candle-seed markets
  at T-1..T-60 (T-1 n=300) + tracks headline series daily. First live settlement wave: **Nov 3 2026**
  (LA mayor, 35 Senate races, governors) — the date was triangulated four independent ways in
  session 4 (FVAP's 45-day countdown, the Wisconsin/California calendars, Virginia early voting,
  and Kalshi `close_time` values).
- **Site**: one bundle (`src/data/site-data.js`, ~1.6 MB) with both data layers; sections: overview,
  2026 Markets, 2026 Polls, Tracker, **Forward Loop (full universe)**, Backtests (both Senate views),
  Contest, **Sources (rebuilt)**, Irregularities, Methodology, Roadmap. The Sources view groups all
  105 entries under their 9 categories, each block headed by the verified date range and a live count
  chip, with a toolbar (text search over name/type/verification text, category select,
  verified-date select, reset) and a per-row `<details>` panel carrying the full observed
  verification text plus the manual-review link. `scripts/render-check.cjs` renders every section
  headlessly (11 sections) and `test/site-sources.test.mjs` (9 tests) asserts the rendered Sources
  HTML: toolbar present, one block per category, one row per entry, per-block counts equal to the
  published tally and to each chip, bundle ⇄ `master.json` parity, and #40–#49 rendered. Suite total:
  **70 tests** (`npm test`), all green; keep the README count in sync.

## P0 — first things next session

1. **Watch the first post-merge cron run** (12:30 UTC daily): confirm ALL steps green, both data
   layers commit, and the artifact contains `data/kalshi/forward/` + `historical-2024/`. Note the bot
   regenerates `src/data/site-data.js`; the Sources view is data-driven, so new master.json entries
   appear automatically **as long as they carry a `category`** (lint enforces it).
2. If a step fails: `tracker/daily/<date>.error.json` and/or the run log tells you which collector;
   the forward-loop steps are continue-on-error so the main pipeline is never blocked by them.

## P1 — polish (small, safe)

- **UI dedup**: Tracker/Polls (session-3 data) vs Forward Loop (forward data) show overlapping
  concepts from two capture pipelines. Consider unifying the views or cross-linking them; the
  bundle keys are already disjoint (`universe`/`calibration`/`pollLayer` vs
  `universeSummary`/`calibrationForward`/`polls2026`/`senate2024Races`).
- Sources toolbar filters are per-section and reset on navigation (by design, no persisted state).
  If a deep link such as `#/sources?cat=Pollsters…` is wanted, add it to the hash router, not to
  `wireSources`.
- Test count references in README (`70 tests`) must match `npm test` output after every suite change.

## P2 — open roadmap items (see ROADMAP.md for all 13)

- **R11 (new)**: re-verify the hosts this session's fetcher could not reach — `surveypoll.com`
  (SurveyUSA publishes full questionnaires), `thehillx.com` (HarrisX), `courtlistener.com` (use its
  free REST API), plus Wisconsin `/elections-voting`, Nevada `/sos-elections`, California
  `elections.cdn.sos.ca.gov`; and admit the **Franklin & Marshall College Poll** after fetching the
  F&M release itself (this session only found syndicated coverage: Shapiro 50 / Garrity 28, n=546 PA
  registered voters, fielded Jun 8–14 2026 — already corroborated by captured Kalshi rungs
  GOVPARTYPA-26-D 0.968/0.973 and -R 0.030/0.033).
- **R12 (new)**: ingest the session-4 survey material into the poll layer — Saint Anselm SASC June
  2026 (n=1,614 NH registered voters, ±2.4%, maps to `SENATENH-26`), CIRCLE's 2026 Youth Poll
  (5,000+ ages 18–29, Jan 26–Feb 12 2026) and YESI Senate/Governor rankings, and CES Dataverse DOIs.
- **R13 (new)**: automate the third-party-rendering cross-check (270toWin's Kalshi widget, DDHQ
  Votes' odds integration) against captured `yes_bid`/`yes_ask`, so irregularity #46 becomes a
  standing monitor rather than a one-off manual comparison.
- R6: 2020 poll-only backtest row (no Kalshi markets existed pre-2021 — state explicitly).
- R7+: state-legislative layer via the NCSL 2026 hub (6,139 seats / 88 chambers) — entry `ncsl-elections`.
- Exit polls: confirm Edison/SSRS 2026 coverage before using any exit-poll data (still unconfirmed).
- Python track: wire `backtest/` engines to the verified datasets (they run on labeled synthetic data).
- IEM direct re-verify beyond the markets board (proxy blocked deeper pages); RCP page freshness (#15),
  AP VoteCast 2026 status (#17), Harvard Dataverse homepage (#19) re-checks.

## Gotchas learned the hard way

- Kalshi `status=finalized` markets sit INSIDE open events (207 found) — any new scorer must keep the
  look-ahead guard (a post-settlement price is not a forecast). See irregularity #37.
- `mutually_exclusive` does NOT imply an exhaustive outcome set (#32). No VA-26 **governor** market
  exists in the 24,084-market open universe; the Virginia Senate market (`SENATEVA-26`) does.
- Some official hosts block bots: `results.enr.clarityelections.com/GA` (403), `sos.nh.gov` results
  (403), NYT toplines (#35), and in session 4 `elections.wi.gov/elections-voting`,
  `nvsos.gov/sos-elections`, `elections.cdn.sos.ca.gov`, `healthyelections.org` (500),
  `surveypoll.com`, `thehillx.com`, `courtlistener.com` (500). The proxy also intermittently 502s —
  record, re-verify later; **never reconstruct a source from memory**.
- Brand traps: **Harris Poll** (harrispoll.com, consumer research) ≠ **HarrisX** (thehillx.com,
  political polling); **CES** now lives at Tufts Tisch, not Harvard; **Healthy Elections** is an
  archived 2020 project. Guessing deep URLs 404s — use the homepage or a search-discovered path.
- Bot commit step rebases with `-X theirs` on generated files; never hand-edit `src/data/site-data.js`,
  `docs/data/*`, `ROADMAP.md` (generated by `scripts/gen-roadmap.mjs` from `data/roadmap.json`).
- `scripts/render-check.cjs` uses a minimal DOM shim: only `main`/`nav`/`footline` exist and stub
  elements have **no `addEventListener`** — any new listener wiring in `src/site/app.js` must be
  null-guarded (see `wireSources`) or section rendering throws.
