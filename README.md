# Elections — collect, analyze, project & estimate

## Latest review — September 22, 2026

[GitHub Pages dashboard](https://buffedlizard55-lab.github.io/Elections/) ·
[Source registry](data/sources/master.json) ·
[Session verification](VERIFICATION.md#18-session-12--2026-09-22-the-live-2026-contest-r16-the-canonical-market-list-and-the-control-market-rules) ·
[Next session](NEXT_SESSION.md)

**Live 2026 contest is running** — 12 entrants, unique usernames, unique theses, $100,000
each, scored every day on **open** Kalshi election markets. See
[§ The live 2026 contest](#the-live-2026-contest-r16).

**267 sources · 78 irregularities · 146 tests.** This session closed the queued
control-market question from the exchange's own rule text, published the canonical
open-market list with an arithmetic reconciliation gate, and built the forward
paper-trading engine, and rebuilt the forward contest layer around the captured panels.
Seven new irregularities (#72–#78) were filed, including one that withdraws an assumption the
previous session had queued rather than confirmed, and one that records what `close_time`
really is on this exchange.

## Two toolchains, one standard

| | Node pipeline (primary data engines) | Python toolkit (registry + collectors + validators) |
|---|---|---|
| Sources | `data/sources/master.json` — **267 verified entries** (32 on 2026-09-18 + 115 on 2026-09-19 + 42 on 2026-09-20 + 76 on 2026-09-21 + 2 on 2026-09-22: the live Kalshi market-resolution rule text and The Leap's official competition rules). The latest follow-up added 14 county election authorities plus the League of Women Voters homepage and Verified Voting, and did not duplicate Baltimore, Denver, Multnomah, or Salt Lake. Historical detail: 22 on 2026-09-20 (session 7) + 20 on 2026-09-20 (session 8: DC Board of Elections — closing the DC gap — plus six major county election offices (Maricopa AZ, King WA, Harris TX, Wayne MI, Clark NV, Cook County IL), MSU IPPSR, Stetson CPOR, Rasmussen Reports, Public Policy Polling, Echelon Insights, UNF Public Opinion Research Lab, five news desks (USA Today, LA Times, The Guardian US, AJC, Des Moines Register), Manifold Markets and the Clarity ENR official results host); session 7: 13 more state election authorities incl. New Hampshire (#35 host now reachable) and 9 pollsters incl. SurveyUSA and HarrisX admitted on their live hosts (#47 resolved); 2026-09-19: 21 + 20 + 12 unique from the late independent batch + 20 from session 4 + 20 from session 5 + 20 from session 6 + 2 re-test admissions (CourtListener, Franklin & Marshall); 8 institutions verified in two 2026-09-19 batches were merged into single entries with labelled addenda, and 2 session-5 candidates were verified-reachable but declined for absence of current-cycle content — irregularity #53). Every entry carries a manual-review link, the observed verification text, a date, a status and a category | `data/master_sources.json` + `.csv` — 20 live-only entries + `data/flagged_sources.json` (7 excluded with reasons) |
| Verification log | `VERIFICATION.md` | `data/verification_log.md` |
| Kalshi | `scripts/collect-kalshi.mjs` → `data/kalshi/universe/` + `tracker/` (daily, events feed) · `scripts/collect-senate-2024.mjs` → `historical/senate-2024.json` | `scripts/fetch_kalshi.py` → `data/kalshi/markets_politics_latest.json` (independent markets-feed sample, top 2,000) · cross-checked by `scripts/crosscheck-collectors.mjs` |
| Backtests | `src/backtest.js`, `src/poll-backtest.js` → `data/backtest-results.json` (39 settled 2024 markets) · `src/calibration.js` (live 2026 scorer) · `src/consistency.js` (standing monitor) · `src/poll-layer.js` (2026 polls/ratings vs market) | `scripts/backtest.py` + `backtest/` (Brier/log-loss/calibration + flags) |
| Contest | `src/contest/` → `data/contest-results.json` (2024, settled, real Kalshi fees) · `src/contest/forward-*.js` → `data/contest/forward-2026/` (**live 2026 season**, 12 entrants, daily scoring) | `scripts/paper_trading.py` + `contest/` (Leap-style rules, 8 strategies) |
| Site | `index.html` + `src/site/` (built by `scripts/build-site.mjs`) | `docs/` (static, synced by `scripts/sync_site_data.py`) |
| Checks | `npm test` (146 tests) + `npm run lint` (provenance, irregularities md⇄json **field-by-field** sync, poll-layer tickers) + `scripts/render-check.cjs` (headless site render **with required-content assertions**) | `python scripts/validate_sources.py` (schema + CSV + live checks) |
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
| `data/crosslayer/` + `src/crosslayer.js` | **Cross-layer scoreboard (R14)** — Kalshi vs Metaculus vs DDHQ vs EBO-rendered Kalshi on the 2026 Senate/House control questions; snapshots stay `pending` until `outcomes.json` carries an official canvass with a source url, then Brier/log-loss per layer (look-ahead guarded). Collectors: `scripts/collect-metaculus.mjs` (hub HTML; api2 is auth-walled, #54), `scripts/collect-statenavigate.mjs` (free forecast pages + API-host probe, #55), `scripts/crosscheck-renderings.mjs` (R13 standing monitor → `data/kalshi/tracker/rendering-crosscheck.json`) |
| `data/probes/` + `scripts/probe-hosts.mjs` | **Host re-test monitor (R15)** — every URL that ever refused the fetch tool (`data/probes/targets.json`, 30 targets: SurveyUSA hosts and the #28000 report page, HarrisX/The Hill, CourtListener API, PEC, Split Ticket, WI/NV/CA/MA/NH official paths, Clarity ENR for GA + WV, Metaculus, State Navigate, Muhlenberg, F&M, 270toWin, HPU, Winthrop) is re-tested from the Actions runner each run; `latest.json`/`history.json` record status, challenge type, title, a text sample and the headless-Chrome verdict for `render:true` targets (raw bodies are a workflow artifact, never committed). First live run crashed before writing (#61, fixed); the first committed verdicts landed with run 35490431271 (2026-09-20, 05:38Z) — the session-8 re-test batch is tabled in VERIFICATION.md §13c (WI/NV/CA/MA still blocked; GA + WV Clarity now 'reachable' through the runner's browser profile) |
| `data/statenavigate/` | State Navigate collector output (R14 third layer): `forecast-daily.json` (national + 34 chamber pages, one row per day with `fetchMethod` and `parse` per page) and `api-probe.json` (daily check of the documented-but-unusable API host, #55). Pages are client-rendered: rows parse only when the runner's headless Chrome renders them (#58/#62) |
| `data/contest/forward-2026/` + `src/contest/forward-*.js` | **The live 2026 contest (R16)** — `season.json` (entrants, theses, fills, skip reasons, provenance), `leaderboard.{json,csv}`, `equity.csv`, `attribution.json` (per-series and per-market P&L), `universe.json` (per-day eligibility + exclusion reasons), `signals-ledger.csv` (every admitted poll, rating and cross-layer signal against every captured day, with a `usable_that_day` column). Engine: `forward-universe.js` (offline universe from captured files), `forward-engine.js` (mark-to-market replay + accounting identity), `strategies-forward.js` (the 12-entrant field + the identity gate); tests `test/forward-contest.test.mjs` (35 — the biggest single test file in the repo). |
| `data/kalshi/universe/market-list-latest.csv` | **The full open political/election market list** — every market in the latest full capture with a contest-eligibility verdict, overwritten each run to bound repository growth (the append-only record is `forward/open-prices.csv`). Its JSON twin carries the reconciliation ladder and the arithmetic gate. |
| `data/sources/master.json` | **Master source list — 267 verified entries**, each with a manual-review link, the observed verification text, a date/status/category and a line-by-line note. The 2026-09-21 follow-up added Fairfax, Montgomery MD, Shelby, Allegheny, Cobb, Prince George's, Collin, Mecklenburg, Wake, Gwinnett, DeKalb, Bernalillo, Ramsey, and Fort Bend, plus the League of Women Voters homepage and Verified Voting, and moved Vote.org and Rock the Vote out of government (irregularity #70). Earlier batches remain in VERIFICATION.md. |
| `VERIFICATION.md` | Line-by-line audit log for the Node track's capture sessions (2026-09-18 base + 2026-09-19 §6–§11 + 2026-09-20 §12: 22 new entries, re-tests, live-run repairs, first live Metaculus seat rows; 2026-09-20 §13 (session 8): 8 poll-layer rows from HPU Poll 126 / UH Hobby / Saint Anselm SASC / Stetson CPOR / PPP, 20 new master entries, the full re-test batch, the State Navigate dual-format parser fix (#64) and the CIRCLE YESI 2026 ↔ Kalshi-volume cross-check; new entries, URL corrections, fetch failures, live-run evidence; §10 is the session-5 20-entry batch with its two declined candidates and the Metaculus-vs-Kalshi cross-check) |
| `data/master_sources.json` | **Live-only registry — 20 entries** (5 government · 5 academic · 6 pollsters · 4 analysis), independently verified 2026-09-18 |
| `data/outcomes/verified-outcomes.json` | Verified official outcomes (2020/2024 presidency, 2024 Senate & House control) with per-claim sources and Kalshi-settlement cross-checks (all PASS) |
| `data/polls/` | 538's archived national averages (verbatim GitHub copy; git-blob SHA-1 = upstream + SHA-256 in `PROVENANCE.md`), `verified-polls.json` (verification chains) and `poll-layer-2026.json` (2026 generic-ballot + state-race polls, Cook/Inside ratings, exit-poll status) |
| `data/backtest-results.json` | Market calibration over 39 settled 2024 markets (groups core/senate/all; Brier/log-loss/hold-PnL at T-1…T-60; favourite hit-rate; pooled calibration curve) + poll-vs-market-vs-outcome (generated) |
| `data/contest-results.json` | Paper-trading contest: 8 entrants, $100k each, Kalshi's real fees, The Leap's ≥3-trading-day rule, two universes (core-2024 / all-2024) (generated) |
| `data/irregularities.json` + `IRREGULARITIES.md` | 70 Node-track irregularities plus the Python-track items, with severities and actions; the lint fails if the table and the JSON drift apart |
| `src/` | Zero-dependency Node engines: fee schedule, market backtests, poll backtest, contest engine + strategies, no-fabrication lint |
| `scripts/*.py` | Python toolkit: Kalshi collector, source validator, backtester, contest engine, site-data sync |
| `test/` + `scripts/*.mjs` | 101 Node tests (incl. an offline end-to-end replay that must reproduce the live capture byte-for-byte); `run-backtests`, `run-contest`, `build-site`, `collect-kalshi`, `collect-senate-2024`, `crosscheck-collectors`, `lint-verified`, `render-check` |
| `LIMITATIONS.md` / `NEXT_SESSION.md` | Honest constraints + proposed work plan (Python toolkit track) |
| `ROADMAP.md` | R1–R10 roadmap with statuses (generated from `data/roadmap.json`) |

### Master source list: categories and status vocabulary

Every one of the 267 entries carries a `category` (the site groups and filters by it) and a `status`.
Both are fixed vocabularies, enforced by `scripts/lint-verified.mjs` and asserted by
`test/site-sources.test.mjs`:

| Category | Entries | What belongs here |
|---|---:|---|
| Government — federal | 21 | Federal agencies, Congress, the FEC/EAC/NARA, federal archives |
| Government — state & local | 107 | Secretaries of State, state boards of elections, county election offices |
| Official publishers & archives | 4 | Official document publishers (GovInfo) plus legal/transcription archives (CourtListener, OpenElections) |
| Academic & university research | 28 | University survey centres, election labs, data archives |
| Pollsters & survey research | 39 | Survey firms and their published methodology |
| News outlets & wires | 30 | Wires, broadcasters, newspapers with named election desks |
| Prediction markets & exchange data | 10 | Kalshi/Polymarket/Predictit/IEM data, rules and API docs |
| Ratings, forecasts & analysis | 25 | Race-rating services, forecasters, aggregators, and civic nonprofits that are not election authorities |
| Contest & methodology references | 1 | The Leap contest rules (methodology source, not an election source) |

| Status | Meaning |
|---|---|
| `verified` | Page or PDF fetched directly; the `verified` field quotes only what was observed that day |
| `verified-via-search` | Reached through a search-discovered official page, then fetched and recorded |
| `verified-claim` | A third party's *rendering* was verified, not the underlying data (see the entry's notes) |
| `needs-review` | Fetched, but flagged for a human before the source is relied on (first used in session 6 for Data for Progress and Civiqs — partisan-affiliated pollsters with published methodology) |
| `unverified` | Candidate only — never used as evidence |

A category says how this project files a source; it makes no claim about reliability or tier
([LIMITATIONS.md](LIMITATIONS.md) #25). Sources that could **not** be fetched were excluded and the
exclusion was logged rather than reconstructed from memory (irregularities #40–#42, #45, #47).

## Quick start

Node pipeline (no dependencies, Node ≥ 18, no network needed):

```bash
npm test          # 146 tests
npm run lint      # no-fabrication provenance lint
npm run backtest  # regenerate data/backtest-results.json
npm run contest   # regenerate data/contest-results.json (2024, in-sample)
npm run contest-forward # regenerate the live 2026 season (offline, deterministic)
npm run market-list     # rebuild the open-market list + its reconciliation gate
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
5. **Irregularities are published, never normalized** — [IRREGULARITIES.md](IRREGULARITIES.md).
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
- **Third layer vs market** (session 5, same-day captures): Metaculus's midterms hub (fetched 2026-09-19)
  reads **Senate D 51.7% / House D 88.8%** and "House median D +13 seats" while the project's Kalshi capture
  reads Senate D 59–60¢ and House D 89–90¢ — the two layers agree on the House (≤1pt) but disagree on the
  Senate by ~8 points. Published for review in VERIFICATION.md §10e, scored after Nov 3.
- **Calibration tracker**: 207 settlements on file, **0 scoreable** (all settled before the first capture; a
  post-settlement price is not a forecast) — the empty state is published as such, with the look-ahead guard
  visible in `calibration.json` (`scoreableMarkets`, `observationsExcludedAsLookAhead`).

## The live 2026 contest (R16)

The competition brief this project set itself: **reverse-engineer a trading contest such as
The Leap, and run a paper-trading simulation with unique usernames and unique strategies that
forecast election results, with PnL tracked on the open Kalshi political/election markets.**

The 2024 contest (`npm run contest`) settles against known results. The **2026 contest is
forward**: `npm run contest-forward` runs each entrant against every captured trading day of
still-open markets, marks the book to the captured bid/ask mid, and settles a position only
when the exchange has officially settled it.

| | |
|---|---|
| Season | `S1-2026`, opened 2026-09-19 (first capture), election day 2026-11-03 |
| Field | **12 entrants** — 7 carrying their 2024 `decide()` **unchanged** as an out-of-sample transfer test (asserted by test), plus 5 new 2026 entrants |
| New theses | `poll-anchor-26` (verified poll vs market), `ratings-ratchet` (Cook + Inside Elections bands vs market), `crosslayer-arb` (Metaculus vs Kalshi), `longshot-fader` (favourite–longshot bias, the control for `longshot-lotto`), `combo-coherence` (the Balance-of-Power complex must sum to 1) |
| Universe | US-election-tagged series, present in that day's captured panel, two-sided book, close after that day — **6,942 eligible on 2026-09-21, of which 1,049 traded that day** |
| Execution | Taker only, at the captured book: BUY YES pays `yes_ask`, BUY NO pays `1 − yes_bid`. A market can only fill on a day it actually traded. |
| Caps | Fill ≤ 10% of the day's volume **and** 10% of open interest; gross new deployment ≤ 20% of start-of-day equity per day, allocated **pro-rata** so the result cannot depend on iteration order (**adaptation**, not a Leap rule) |
| Fees | Kalshi's published quadratic taker fee; 4,185 captured series fee configs registered; **no settlement fee** |
| Ranking | Net equity = cash + open positions marked to the last captured book, with the look-ahead label attached until markets settle. A settlement closes at the **official captured result**, never an assumed one. |
| Identity | Both the audit trail and the arithmetic are in `VERIFICATION.md` §18 |

Every entrant's result is decomposed per series and per market
(`data/contest/forward-2026/attribution.json`), and every signal that could have placed an
order is listed one row per captured day in
`data/contest/forward-2026/signals-ledger.csv`.

### The canonical open-market list

`npm run market-list` writes `data/kalshi/universe/market-list-latest.csv` — **every open
Kalshi political/election market** (24,102 in the latest capture), one row each, with its
contest-eligibility verdict and the reason for it — and `market-list-latest.json`, which
carries a reconciliation ladder from the exchange-wide event count down to the fillable set.
The script **fails** when the ladder does not close:

```
10,981 traded + 13,120 untraded-unlisted + 200 finalized = 24,301 open political/election markets
```

### What this session verified from primary sources

| Claim | Source | Result |
|---|---|---|
| How control markets resolve | `GET /markets?series_ticker=CONTROLS\|CONTROLH` | Resolved by the party of the **President pro tempore / Speaker on 2027-02-01**, with an early media-call determination permitted. The queued "majority 51 + VP tiebreak" reading is **withdrawn** (#72). |
| Fee formula | [Kalshi fee schedule PDF](https://kalshi.com/docs/kalshi-fee-schedule.pdf) | `round up(M × 0.07 × C × P × (1−P))`, no settlement fee — matches `src/fees.js` exactly. The maker default is 0, not 1 (#76). |
| Contest mechanics | [The Leap official rules](https://www.tradingview.com/the-leap/february-2026-eurex/rules/) | "activity for at least 3 days" to qualify; ranked "based on the realized profit/loss … on closed positions"; open positions auto-closed at the end. |
| The $100,000 bankroll | [May 2026 crypto leaderboard](https://www.tradingview.com/the-leap/crypto-series-may-2026/) | Not printed on the page — **derived** from five top rows: realized $ ÷ realized % = 100,000 ± $3. Parameters are per-edition (#74). |
| Capture fidelity | Independent re-read on 2026-09-22 | `CONTROLS-2026-D/R` identical to the 2026-09-21 capture; `CONTROLH-2026-*` within the overnight move. |

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
R10 cross-host API comparison · R16 live 2026 contest **running** (12 entrants, daily scoring, per-strategy attribution). Details: [ROADMAP.md](ROADMAP.md) and [NEXT_SESSION.md](NEXT_SESSION.md).

## GitHub Pages setup

The live site deploys from the **`main` branch root** (Settings → Pages → Source: Deploy from a
branch). The toolkit site ships inside `docs/` and is served automatically as `/docs/` under the
same deployment — no extra configuration. `pages.yml` remains as a manual fallback only.
