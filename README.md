# Elections — collect, analyze, project & estimate

**A verification-first election intelligence project.** Free, public, official data only.
Backtests **polls and prediction markets** against **verified official outcomes**, flags every
irregularity it finds, and runs a **paper-trading forecasting contest** (reverse-engineered from
TradingView's [The Leap](https://www.tradingview.com/the-leap/crypto-series-may-2026/))
on Kalshi's open political/election markets.

🌐 **Live site (GitHub Pages, branch root):** https://buffedlizard55-lab.github.io/Elections/
📚 **Toolkit site (same deployment, subdirectory):** https://buffedlizard55-lab.github.io/Elections/docs/

## Two toolchains, one standard

| | Node pipeline (primary data engines) | Python toolkit (registry + collectors + validators) |
|---|---|---|
| Sources | `data/sources/master.json` — **105 verified entries** (32 on 2026-09-18 + 73 on 2026-09-19: 21 + 20 + 12 unique from the late independent batch + 20 from session 4; 8 institutions verified in two 2026-09-19 batches were merged into single entries with labelled addenda). Every entry carries a manual-review link, the observed verification text, a date, a status and a category | `data/master_sources.json` + `.csv` — 20 live-only entries + `data/flagged_sources.json` (7 excluded with reasons) |
| Verification log | `VERIFICATION.md` | `data/verification_log.md` |
| Kalshi | `scripts/collect-kalshi.mjs` → `data/kalshi/universe/` + `tracker/` (daily, events feed) · `scripts/collect-senate-2024.mjs` → `historical/senate-2024.json` | `scripts/fetch_kalshi.py` → `data/kalshi/markets_politics_latest.json` (independent markets-feed sample, top 2,000) · cross-checked by `scripts/crosscheck-collectors.mjs` |
| Backtests | `src/backtest.js`, `src/poll-backtest.js` → `data/backtest-results.json` (39 settled 2024 markets) · `src/calibration.js` (live 2026 scorer) · `src/consistency.js` (standing monitor) · `src/poll-layer.js` (2026 polls/ratings vs market) | `scripts/backtest.py` + `backtest/` (Brier/log-loss/calibration + flags) |
| Contest | `src/contest/` → `data/contest-results.json` (real Kalshi fees) | `scripts/paper_trading.py` + `contest/` (Leap-style rules, 8 strategies) |
| Site | `index.html` + `src/site/` (built by `scripts/build-site.mjs`) | `docs/` (static, synced by `scripts/sync_site_data.py`) |
| Checks | `npm test` (70 tests) + `npm run lint` (provenance, irregularities md⇄json sync, poll-layer tickers) + `scripts/render-check.cjs` (headless site render) | `python scripts/validate_sources.py` (schema + CSV + live checks) |
| Automation | `daily-collection.yml` — **live**: cron 12:30 UTC + push trigger; runs both collectors, the cross-check, `npm run pipeline`, lint, tests, then commits `data/` + the site bundle (opt-out: repo variable `COLLECT_DISABLED=true`) | `validate.yml` (CI) · `pages.yml` (manual deploy fallback) |

Both stacks obey the same honesty contract (§ below). The 2024 headline results come from the
Node pipeline's verified data; the Python engines reproduce the same methodology and run on
labeled synthetic data until wired to the verified datasets (see `NEXT_SESSION.md`).

## What's here

| Path | What it is |
|---|---|
| `index.html` + `src/site/` | Main static site (GitHub Pages, main branch root): overview, **2026 Markets** (from the daily capture), **2026 Polls** (poll layer vs market vs ratings), **Tracker** (forward loop + calibration + collector cross-check), backtests, contest, sources, irregularities, methodology, roadmap |
| `docs/` | Toolkit site (served as `/docs/`): 20-source registry browser, Kalshi layer, contest leaderboard, methodology, verification evidence |
| `data/kalshi/` | `universe/series.json` + `universe/latest.json` (today's registry + open events; per-market `status` when not active), `tracker/daily/YYYY-MM-DD.csv` (traded, not-yet-settled markets, one row per day, with the exchange `status`), `tracker/{index,settlements,calibration,discrepancy-watch,collector-crosscheck,history}.json` (descriptors · official results · look-ahead-guarded scorer · consistency findings · two-collector agreement · one record per run day), `historical/senate-2024.json` (36 settled 2024 Senate markets + 1,269 daily bars), `forward/` (**FULL open-universe capture**: `universe-open.json` 24,150 markets, `tracker.csv` daily bid/ask appends, `settled-2026-candles.json` 400-market candle seed), `historical-2024/senate-races.json` (same 36 Senate markets with candle series for the T-1..T-60 backtest), the 2026-09-18 hand snapshot; core 2024 markets in `src/kalshi-data.js` |
| `data/sources/master.json` | **Master source list — 105 verified entries**, each with a manual-review link, the observed verification text, a date/status/category and a line-by-line note (session 3 added 8 state election authorities, LA County, Emerson, Marquette, Siena, UNH, Suffolk, SSRS Voter Poll, Cook, Inside Elections, NCSL, Kalshi API docs; the late batch added Sabato's Crystal Ball, Marist, Texas Politics Project, YouGov, Ipsos, Morning Consult, OpenSecrets, NIMSP, NASS, DOJ Civil Rights, Roper Center, CRS; **session 4 added 20 more** — FVAP, Wisconsin WEC, Nevada SoS, California SoS, Pennsylvania vote.pa.gov, Virginia Elections, GAO, CES (Tufts), Healthy Elections (MIT archive), VoteView, CIRCLE, Brennan Center, Bipartisan Policy Center, Decision Desk HQ, 270toWin, AtlasIntel, Harris Poll (with the HarrisX distinction), NPR Elections, PBS NewsHour Politics, Saint Anselm SASC) |
| `VERIFICATION.md` | Line-by-line audit log for the Node track's capture sessions (2026-09-18 base + 2026-09-19 §6, §7 and §8: new entries, URL corrections, fetch failures, live-run evidence) |
| `data/master_sources.json` | **Live-only registry — 20 entries** (5 government · 5 academic · 6 pollsters · 4 analysis), independently verified 2026-09-18 |
| `data/outcomes/verified-outcomes.json` | Verified official outcomes (2020/2024 presidency, 2024 Senate & House control) with per-claim sources and Kalshi-settlement cross-checks (all PASS) |
| `data/polls/` | 538's archived national averages (verbatim GitHub copy; git-blob SHA-1 = upstream + SHA-256 in `PROVENANCE.md`), `verified-polls.json` (verification chains) and `poll-layer-2026.json` (2026 generic-ballot + state-race polls, Cook/Inside ratings, exit-poll status) |
| `data/backtest-results.json` | Market calibration over 39 settled 2024 markets (groups core/senate/all; Brier/log-loss/hold-PnL at T-1…T-60; favourite hit-rate; pooled calibration curve) + poll-vs-market-vs-outcome (generated) |
| `data/contest-results.json` | Paper-trading contest: 8 entrants, $100k each, Kalshi's real fees, The Leap's ≥3-trading-day rule, two universes (core-2024 / all-2024) (generated) |
| `data/irregularities.json` + `IRREGULARITIES.md` | 49 flagged irregularities/discrepancies with severities and actions (Node items 1–12 + 23–49; Python-track items 13–22); the lint fails if the table and the JSON drift apart |
| `src/` | Zero-dependency Node engines: fee schedule, market backtests, poll backtest, contest engine + strategies, no-fabrication lint |
| `scripts/*.py` | Python toolkit: Kalshi collector, source validator, backtester, contest engine, site-data sync |
| `test/` + `scripts/*.mjs` | 45 Node tests (incl. an offline end-to-end replay that must reproduce the live capture byte-for-byte); `run-backtests`, `run-contest`, `build-site`, `collect-kalshi`, `collect-senate-2024`, `crosscheck-collectors`, `lint-verified`, `render-check` |
| `LIMITATIONS.md` / `NEXT_SESSION.md` | Honest constraints + proposed work plan (Python toolkit track) |
| `ROADMAP.md` | R1–R10 roadmap with statuses (generated from `data/roadmap.json`) |

### Master source list: categories and status vocabulary

Every one of the 105 entries carries a `category` (the site groups and filters by it) and a `status`.
Both are fixed vocabularies, enforced by `scripts/lint-verified.mjs` and asserted by
`test/site-sources.test.mjs`:

| Category | Entries | What belongs here |
|---|---:|---|
| Government — federal | 20 | Federal agencies, Congress, the FEC/EAC/NARA, federal archives |
| Government — state & local | 17 | Secretaries of State, state boards of elections, county election offices |
| Official publishers & archives | 1 | Official document publishers (GovInfo) |
| Academic & university research | 10 | University survey centres, election labs, data archives |
| Pollsters & survey research | 20 | Survey firms and their published methodology |
| News outlets & wires | 13 | Wires, broadcasters, newspapers with named election desks |
| Prediction markets & exchange data | 8 | Kalshi/Polymarket/Predictit/IEM data, rules and API docs |
| Ratings, forecasts & analysis | 15 | Race-rating services, forecasters, aggregators |
| Contest & methodology references | 1 | The Leap contest rules (methodology source, not an election source) |

| Status | Meaning |
|---|---|
| `verified` | Page or PDF fetched directly; the `verified` field quotes only what was observed that day |
| `verified-via-search` | Reached through a search-discovered official page, then fetched and recorded |
| `verified-claim` | A third party's *rendering* was verified, not the underlying data (see the entry's notes) |
| `needs-review` | Fetched, but flagged for a human before the source is relied on |
| `unverified` | Candidate only — never used as evidence |

A category says how this project files a source; it makes no claim about reliability or tier
([LIMITATIONS.md](LIMITATIONS.md) #25). Sources that could **not** be fetched were excluded and the
exclusion was logged rather than reconstructed from memory (irregularities #40–#42, #45, #47).

## Quick start

Node pipeline (no dependencies, Node ≥ 18, no network needed):

```bash
npm test          # 70 tests
npm run lint      # no-fabrication provenance lint
npm run backtest  # regenerate data/backtest-results.json
npm run contest   # regenerate data/contest-results.json
npm run build-site# regenerate src/data/site-data.js (the site)
npm run pipeline  # backtest + contest + build-site + headless render check
node scripts/collect-kalshi.mjs --replay   # rebuild today's tracker outputs offline from the saved universe (no network)
```

Networked (what the daily workflow runs):

```bash
node scripts/collect-kalshi.mjs            # registry + open universe + tracker + settlements + calibration + consistency
node scripts/collect-senate-2024.mjs       # one-off: 2024 per-state Senate markets (re-run with workflow input senate2024=true)
python scripts/fetch_kalshi.py --no-raw --compact --compact-max 2000 --series-file data/kalshi/universe/series.json
node scripts/crosscheck-collectors.mjs     # agreement report between the two captures
```

Python toolkit (stdlib only, Python 3.10+):

```bash
python scripts/validate_sources.py            # schema + CSV-consistency check (add --check-live on normal network)
python scripts/fetch_kalshi.py                # collect open markets (needs normal network)
python scripts/paper_trading.py --demo        # SIMULATED contest season (engine test)
python scripts/backtest.py --demo-synthetic   # SYNTHETIC backtest (pipeline test)
python scripts/sync_site_data.py              # refresh docs/data for the toolkit site
```

## The honesty contract

1. **Every value traces to a captured URL.** Node data files carry `capturedFrom` + `capturedAt`
   (the lint *fails* if one is missing); Python registry entries carry checked URLs + evidence.
   Line-by-line notes: [VERIFICATION.md](VERIFICATION.md) and [data/verification_log.md](data/verification_log.md).
2. **No hard-coded outcomes.** Strategies are executable rules; engines refuse dishonest fills
   (no-trade days, volume caps, official fees in the Node engine; labeled simulation in Python demos).
3. **Captured vs modeled is labeled.** The poll→probability mapping and all synthetic/demo data
   are explicitly marked wherever they appear. Simulated outputs are never presented as findings.
4. **Attribution is tested:** `finalEquity = startingCapital + fee-aware realizedPnl` (Node);
   paper-engine equity math is covered end-to-end (Python).
5. **Irregularities are published, never normalized** — [IRREGULARITIES.md](IRREGULARITIES.md) (49 items).
6. **Two independent collectors, one truth.** The Node events feed and the Python markets feed are captured
   minutes apart and compared every run (`tracker/collector-crosscheck.json`); 2026-09-19: last price within
   2¢ on 99.9–100% of the 1,852 overlapping tickers across the day's four runs, lifetime volume never decreased.

## Headline results (verified, reproducible)

### 2024 — 39 settled Kalshi markets vs official outcomes
- **Day-before price** (T-1, 37 markets priced): mean Brier **0.077**, mean log-loss 0.271; the market
  favourite won **34 of 37 (91.9%)**. At T-7 (25 markets): Brier **0.104**, favourite right 23/25 (92%).
- **Core 3** (PRES-2024-DJT, CONTROLH-2024-R, CONTROLS-2024-R — all settled YES): Brier at T-7 = 0.128, a
  T-7 hold of the winning side earned +0.33 $/contract. **Per-state Senate (36 markets, 18 states)**: Brier
  at T-1 = 0.068; a naive "hold every YES" earned ≈ 0 $/contract (the D and R legs cancel — as they should).
- **Polls vs outcome**: final 538 national average (2024-09-12) = **Harris +2.82pp**; official outcome
  = **Trump +1.45pp** (2-party popular, FEC) → **4.3pp miss, wrong direction**. The market traded Trump
  50–63¢ through October and never crossed 50¢ the wrong way after the nomination.
- **Contest, all-2024 universe (39 markets, ≥3 trading days to rank)**: @breakout-bandit **+30.0%**,
  @momentum-mule +10.3%, @longshot-lotto +3.5%, @yield-yak +3.1%, @favorite-cash −2.8%, @fader-flipper −3.3%,
  @shock-surfer −4.6%; @poll-anchor unranked (1 trading day; would be −13.3% — the poll-information thesis
  failed 2024). On the original **core-2024** universe only @fader-flipper (+13.9%) and @momentum-mule
  (−3.1%) qualify under the ≥3-day rule.

### 2026 — live (first collection day 2026-09-19)
- **Universe**: 4,166 Elections|Politics series, 4,094 open events (3,210 tagged U.S. election), 24,367
  markets of which 10,711 are traded and still open (day's last run, 01:48 UTC); **207 traded rungs nested in
  open events were already settled** (finalized Jul 13–Sep 18; 174 no / 33 yes) — recorded as settlements, kept out of the daily rows
  and out of the scorer (irregularity #37). Chamber control: Senate D 59–60¢, House D 89–90¢.
- **Polls vs market** (poll layer, logistic k=4.5 labelled): Maine CNN/SSRS D+3 ⇒ 66% vs Kalshi 67.5%;
  Michigan CNN/SSRS D+3 ⇒ 66% vs 64.5%; Texas Emerson D+1 ⇒ 56% vs 57.5% but ReconMR-Siena D+6 ⇒ 79%
  (the largest single-poll gap, −21.6pp); Iowa: Emerson R+5 ⇒ 25%, Suffolk R+4 ⇒ 29%, NYT/Siena (Jul) R+2 ⇒ 39%
  vs market 39.5% — the market sits inside the poll spread (irregularity #34 updated). NYT/Siena July toplines
  for AK/IA/NC/OH are carried with a *review* flag (n/MoE pages blocked).
- **Ratings vs market**: Kalshi prices **7 of 13** rated-competitive Senate seats outside the bands implied by
  *both* Cook (Sep 15) and Inside Elections (Sep 17) ratings, all toward Democrats (AK, ME, NH, GA, NC, KS,
  NE-Osborn) — published for review (irregularity #33), scored after Nov 3.
- **Exit polls**: the 2026 product is *The Voter Poll by SSRS* (Edison/NEP exit poll + AP VoteCast merged);
  no 2026 data exists yet, so none is used.
- **Calibration tracker**: 207 settlements on file, **0 scoreable** (all settled before the first capture; a
  post-settlement price is not a forecast) — the empty state is published as such, with the look-ahead guard
  visible in `calibration.json` (`scoreableMarkets`, `observationsExcludedAsLookAhead`).

## Known limitations (summary)

One collection day; the live scorer stays empty until markets that were priced *before* settlement settle
(first big batch after Nov 3 2026). The 2024 backtest is one cycle (39 markets, most Senate markets opened
only in October 2024); the hand-captured core-2024 markets in `src/kalshi-data.js` lack the Nov 5
election-day candle bar (the automated Senate captures include it); the 538 poll archive ends 2024-09-12.
The poll layer is hand-transcribed (15 entries, 4 flagged *review*) and not a poll average; the poll→probability
mapping and the rating bands are labelled heuristics. Some official results hosts and the NYT toplines pages
block automated fetchers. Full lists: [ROADMAP.md](ROADMAP.md) and [LIMITATIONS.md](LIMITATIONS.md).

## Roadmap (next session(s))

R1 daily collection **live** · R2 2024 Senate markets **done** (39-market backtest) · R3 live calibration
**running, look-ahead-guarded, empty until pre-settlement prices settle** · R4 poll layer **started** (15
verified entries; next: per-race poll averages, weekly release check, NYT toplines n/MoE by hand) · R5 consistency monitor **live** · R6 2020 poll cycle ·
R7 more entrants + 2-cycle tournament · R8 provenance hashes **done** · R9 Polymarket collector ·
R10 cross-host API comparison. Details: [ROADMAP.md](ROADMAP.md) and [NEXT_SESSION.md](NEXT_SESSION.md).

## GitHub Pages setup

The live site deploys from the **`main` branch root** (Settings → Pages → Source: Deploy from a
branch). The toolkit site ships inside `docs/` and is served automatically as `/docs/` under the
same deployment — no extra configuration. `pages.yml` remains as a manual fallback only.
