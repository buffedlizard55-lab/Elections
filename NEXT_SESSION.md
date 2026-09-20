# NEXT_SESSION — handoff after the session-6 merge (`arena/01a0bb51-elections` → main)

Session 6 (2026-09-19, branch `arena/01a0bb51-elections`) executed the requested list end to end:
**P0 machinery** (cross-layer scorer + empty official-outcome record, scored the day a canvass lands),
**first poll-layer rows from the four new pollsters with #49 method labels** (5 rows; Muhlenberg has
no 2026 horse-race release — recorded, not fabricated), **collectors** for Metaculus (hub HTML; api2
is auth-walled, #54) and State Navigate (free forecast pages; API host 500 + Tier-3 paywall, #55),
**all 8 re-tests** (CourtListener recovered → admitted; SurveyUSA/HarrisX still fail; PEC/Split Ticket
still no current-cycle content; WI/NV/CA/MA blocks unchanged), **standing monitors** (R13
`scripts/crosscheck-renderings.mjs`; Franklin & Marshall admitted after fetching fandmpoll.org's own
release), and **20 new master entries** (registry 125 → **147**; irregularities 53 → **57**; suite
71 → **82 tests**; site gained a **Cross-layer** section). Evidence: `VERIFICATION.md` §11.

## What to do first in session 7

1. **Watch the first networked run** of the three new collectors (daily workflow, continue-on-error).
   Expect `data/crosslayer/metaculus-daily.json`, `data/statenavigate/{forecast-daily,api-probe}.json`
   and `data/kalshi/tracker/rendering-crosscheck.json` to appear. If a row says `parse:'failed'` /
   `extract:'failed'`, fix the regex against the stored `sample` — never type the number in.
2. **Extend the scoreboard to the 35 Senate races**: pair Kalshi `SENATE{ST}-26-D` with the Metaculus
   race pages (the hub says "18 of 35 races lean Democrat · 3 too close to call") so the Nov 3 scoring
   is seat-by-seat, not just chamber control. Keep the look-ahead guard.
3. **After Nov 3 (P0)**: fill `data/crosslayer/outcomes.json` from the per-state certifications
   (master ids for every 2026 Senate state now exist — SC, KS, MT, NE, NM, WY, CO, OK, TN, DE, RI, SD
   were added this session on top of the earlier ones), then `npm run pipeline` publishes per-layer
   Brier/log-loss automatically.
4. **R12 leftovers**: Saint Anselm / CIRCLE / CES rows; add `methodFamily` to the 15 pre-session-6 rows.
5. **Re-tests**: SurveyUSA (5th), HarrisX, api.courtlistener.com, data.statenavigate.com (the collector
   probes it daily), Muhlenberg poll library for a 2026 release, PEC / Split Ticket per #53.
6. **R9**: Polymarket / PredictIt collectors so EBO's other rows can be cross-checked the same way.

## Session-6 gotchas (add to the list below)

- **F&M Poll lives at fandmpoll.org, not fandm.edu.** Nebraska `/elections/election-results`,
  Oklahoma `/elections/election-results.html` and Washington's SoS data-and-maps path all 404 — the
  verified hubs are `/elections`, `/elections/elections-results/` and `results.votewa.gov` (#56).
- New Mexico's elections page still shows a 2021 election-night sidebar beside its 2026 date (#56):
  take results links from the live results host only.
- `test/site-sources.test.mjs` now asserts **115** entries dated 2026-09-19 and `>= 147` sources;
  `test/outcomes.test.mjs` accepts `needs-review` (used by Data for Progress and Civiqs).
- The render check now lists 12 sections (`crosslayer` added); the Cross-layer view degrades to
  hand-verified text when the collector files are absent, so a missing file never breaks the site.
- `src/crosslayer.js` refuses to score any outcome record without an official `url` and any snapshot
  captured on/after `electionDate` — do not relax either guard.

---

# (Preserved) handoff after the session-5 merge (`arena/01a0bb28-elections` → main)

Session 5 (2026-09-19, branch `arena/01a0bb28-elections`) executed the requested "search 20 new
entries, verify no hallucinations before adding": **22 candidates were fetched and verified, 20 were
admitted** (7 state election authorities, 2 academic, 4 pollsters, 3 ratings/forecast layers, 4 news
outlets), **2 were declined with recorded evidence and re-test criteria** (irregularity #53), and
**4 new irregularities (#50–#53)** were logged — including a near-hallucination caught in flight
(noblepi.com is a home-inspection company; the pollster is noblepredictiveinsights.com) and the
cnalysis.com → statenavigate.org rebrand. The registry is now **125 entries**; the suite is
**71 tests**. Session 4's contributions (20 sources, #40–#49, the category taxonomy, the rebuilt
Sources view, R11–R13) are all preserved beneath this layer.

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
- **Master source list**: `data/sources/master.json` = **125 entries** (base 53 + session-3 20 +
  late batch 12 unique + session-4 20 + **session-5 20**; 8 institutions verified in two 2026-09-19
  batches were merged into single entries with labelled second-batch addenda). 93 entries carry
  `verifiedOn: 2026-09-19`. Every entry carries a **`category`** (9 values, tally published in the
  file's `categories` array) — `scripts/lint-verified.mjs` fails on unknown categories, a tally
  mismatch, duplicate ids or duplicate urls, and on a missing `notes` field for any entry verified
  after 2026-09-18. `VERIFICATION.md` §6/§7/§8/§9/§10 are the audit logs. **Session 5's evidence is
  §10** — §10a the 20 entries line by line (each tying its Kalshi-relevant markets to quotes read
  from the project's own capture), §10b method/quote policy (two `verified-via-search` entries:
  `oregon-sos`, `massachusetts-elections`), §10c the declined candidates, §10d the new
  irregularities, §10e post-batch evidence + the **Metaculus-vs-Kalshi Senate gap**.
- **Irregularities**: **53 items** (`data/irregularities.json`, ids 1–12, 23–53) mirrored in
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
  **not** party). New in session 5: #50 **noblepi.com is a home-inspection company** — the pollster
  Noble Predictive Insights lives at noblepredictiveinsights.com (a wrong-domain admission would have
  been a silent hallucination), #51 Massachusetts division root 403 (deep page fetches fine) +
  C-SPAN /elections/ is a 404 path (hub is /campaign/) + SurveyUSA's third fetch failure, #52
  **cnalysis.com now redirects to statenavigate.org** (the CNalysis brand is retired; its
  self-reported accuracy stats are recorded as claims), #53 two verified-reachable candidates
  (Princeton Election Consortium, Split Ticket) DECLINED for absence of current-cycle content, with
  re-test criteria. #47's detail was extended with the session-5 SurveyUSA re-attempt.
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
  125 entries under their 9 categories, each block headed by the verified date range and a live count
  chip, with a toolbar (text search over name/type/verification text, category select,
  verified-date select, reset) and a per-row `<details>` panel carrying the full observed
  verification text plus the manual-review link. `scripts/render-check.cjs` renders every section
  headlessly (11 sections) and `test/site-sources.test.mjs` (10 tests) asserts the rendered Sources
  HTML: toolbar present, one block per category, one row per entry, per-block counts equal to the
  published tally and to each chip, bundle ⇄ `master.json` parity, #40–#53 rendered, and the
  session-5 batch checks (all 20 ids present and dated; exactly two `verified-via-search`; any Kalshi
  quote in a session-5 note must cite the 2026-09-19 capture). Suite total: **71 tests** (`npm test`),
  all green; keep the README count in sync.

## P0 — first things next session

0. **Score the session-5 cross-layer spread after Nov 3**: Metaculus Senate D 51.7% vs Kalshi Senate
   D 59–60¢ (both captured 2026-09-19; they agree on the House, 88.8% vs 89–90¢). The calibration
   tracker must score both layers' Senate numbers against the official canvass — VERIFICATION §10e
   records the spread, and no model depends on either number yet. Also ingest the new sources' first
   poll-layer rows (UMass Amherst national/MA, Muhlenberg PA, NPI AZ, Fox News Poll toplines) with
   per-row method-family labels (#49).
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
- Test count references in README (now `82 tests`) must match `npm test` output after every suite change.

## P2 — open roadmap items (see ROADMAP.md for all 13)

- **R11 (re-verify + admit)**: re-verify the hosts this fetcher still cannot reach — `surveypoll.com`
  (SurveyUSA, third failure 2026-09-19), `thehillx.com` (HarrisX), `courtlistener.com` (use its
  free REST API), plus Wisconsin `/elections-voting`, Nevada `/sos-elections`, California
  `elections.cdn.sos.ca.gov`, the Massachusetts division ROOT (403; deep pages fetch fine), and
  C-SPAN's `/elections/` path (hub is `/campaign/`); re-test the two session-5 declines
  (**election.princeton.edu**, **split-ticket.org**) per irregularity #53's criteria; and admit the
  **Franklin & Marshall College Poll** after fetching the F&M release itself (this session only found
  syndicated coverage: Shapiro 50 / Garrity 28, n=546 PA registered voters, fielded Jun 8–14 2026 —
  already corroborated by captured Kalshi rungs GOVPARTYPA-26-D 0.968/0.973 and -R 0.030/0.033).
  Also add a **State Navigate API collector** (`data.statenavigate.com`, free, documented —
  master entry `state-navigate`) for the downballot layer Kalshi does not price, and a
  **Metaculus collector** for the midterms hub's community forecasts so the third intelligence layer
  is scored continuously instead of by hand.
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
  political polling); **noblepi.com** (home inspections) ≠ **noblepredictiveinsights.com** (the
  pollster); **CNalysis** is retired — it redirects to **statenavigate.org**; **CES** now lives at
  Tufts Tisch, not Harvard; **Healthy Elections** is an archived 2020 project. Guessing deep URLs
  404s — use the homepage or a search-discovered path (Oregon's /sos/elections 404 and C-SPAN's
  /elections/ 404 both cost an extra hop this session; both recorded in #51).
- Bot commit step rebases with `-X theirs` on generated files; never hand-edit `src/data/site-data.js`,
  `docs/data/*`, `ROADMAP.md` (generated by `scripts/gen-roadmap.mjs` from `data/roadmap.json`).
- `scripts/render-check.cjs` uses a minimal DOM shim: only `main`/`nav`/`footline` exist and stub
  elements have **no `addEventListener`** — any new listener wiring in `src/site/app.js` must be
  null-guarded (see `wireSources`) or section rendering throws.
