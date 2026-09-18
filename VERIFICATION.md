# VERIFICATION — line-by-line audit log

**Session:** 2026-09-18 (single capture + verification session; all times UTC).
**Standard:** every fact that entered `data/`, `src/`, or the site was fetched from the named URL in
this session and checked line by line. Nothing was carried in from memory. Machine-checked half of the
standard: `npm run lint` (provenance) and `npm test` (outcome cross-checks, transcription integrity).

## 1 · Kalshi (exchange layer)

| # | Fact | Source fetched this session | Note |
|---|---|---|---|
| K1 | Historical tier cutoff: settled markets older than 2026-07-20T00:00:00Z only via `/historical/*` | `https://api.elections.kalshi.com/trade-api/v2/historical/cutoff` + `https://docs.kalshi.com` historical-data page | Explains why 2024 markets need the historical endpoints |
| K2 | `PRES-2024-DJT` result=**yes**, settled 2025-01-20T18:04:06Z, volume 262,334,207 contracts | `GET /historical/markets?series_ticker=PRES&limit=3` | Rule text + settlement source (Office of the Presidency) captured from `GET /series/PRES` |
| K3 | `CONTROLH-2024-R` result=**yes** / `CONTROLH-2024-D` result=**no**, settled 2025-02-01T16:00:09Z; volumes 1,537,259 / 1,472,438 | `GET /historical/markets?series_ticker=CONTROLH&limit=5` | Settlement rule: Speaker party on Feb 1, 2025 |
| K4 | `CONTROLS-2024-R` result=**yes** / `CONTROLS-2024-D` result=**no**, settled 2025-02-01T16:00:09Z; volumes 908,243 / 875,027 | `GET /historical/markets?series_ticker=CONTROLS&limit=10` | Settlement rule: President pro tempore party on Feb 1, 2025; settlement source = Library of Congress (congress.gov) |
| K5 | Daily candlesticks for K2/K3/K4 (32/28/31 bars, 2024-09-12 → 2024-11-04 trading days) | `GET /historical/markets/{t}/candlesticks?start_ts=…&end_ts=…&period_interval=1440` | Transcribed field-for-field into `src/kalshi-data.js`; OHLC integrity + 17-field layout tested (`npm test`) |
| K6 | Fee configs: PRES, CONTROLH, CONTROLS all `fee_multiplier=1`, `fee_type=quadratic` | `GET /series/PRES`, `GET /series/CONTROLH`, `GET /series/CONTROLS` | Formula per the official fee schedule PDF (see K8) |
| K7 | Live 2026 books: CONTROLS-2026 D 59/60¢ (vol $4.08M) R 40/41¢ (vol $5.09M); CONTROLH-2026-R 10/11¢ (vol $20.93M, OI $13.39M); 2028 series live | `GET /markets?series_ticker=CONTROLS&limit=4`, `GET /markets?series_ticker=CONTROLH&limit=3` | API `last_price_dollars`/`updated_time` were stale (2026-07-14) on the shared host → IRREGULARITIES #2; order book used |
| K8 | Fee schedule formula (taker 0.07·M·C·P·(1−P), maker 0.0175, round up to centicent, no settlement/membership fees) | `https://kalshi.com/docs/kalshi-fee-schedule.pdf` via the sibling repo's VERIFICATION.md capture (same PDF, effective 2026-07-07); M values re-verified live (K6) | Re-implemented in `src/fees.js` and unit-tested |
| K9 | Midterms Hub board (35 Senate races w/ ratings, seat-count events, 10 combo/novelty markets, 20+ other Nov-3 markets, LA mayor $94.9M vol) | `https://kalshi.com/category/elections/midterms` (4-chunk full fetch) | Stored in `data/kalshi/snapshot-2026-09-18.json` with per-section source lines |
| K10 | Senate control page: D 59 / R 41, $13,823,193 vol, begins Nov 3 8:00am ET | `https://kalshi.com/markets/controls/senate-winner/controls-2026` | Matches K7 bid side |
| K11 | Hub launch + calibration claims ("favored candidate wins ~9/10", "70% → 70%") | `https://news.kalshi.com/p/kalshi-midterms-hub-launch-2026`, CNBC 2026-07-22 | Claims re-tested, not assumed (Backtests §2) |

## 2 · Official outcomes (cross-check targets)

| # | Fact | Source fetched this session | Note |
|---|---|---|---|
| O1 | 2024 presidency: Trump 312 EV / Harris 226; popular 77,302,580 / 75,017,613 (49.8/48.3%); turnout 64.3% | Wikipedia infobox via `en.wikipedia.org/w/api.php` (MediaWiki parse API, section 0 wikitext) | Infobox cites the **official FEC PDF** `fec.gov/resources/cms-content/documents/2024presgeresults.pdf` and Univ. of Florida for turnout |
| O2 | IFES: "TRUMP won 312 EV; HARRIS won 226" (results source: FEC PDF) | `https://www.electionguide.org/elections/id/4325/` | Independent second confirmation |
| O3 | 2024 Senate: R flipped 4 D seats, regained majority, defended all own seats (53–47) | Wikipedia REST summary API, revision 1375347616 | Kalshi settlement (K4) agrees → PASS |
| O4 | 2024 House: R 220 / D 215; popular 74,390,864 (49.8%) / 70,571,330 (47.2%) | Wikipedia infobox (House Clerk 2024 report citation) | Kalshi settlement (K3) agrees → PASS |
| O5 | 119th Congress composition R 220: House Roll 102 (119-1) H.R.22 passed 220–208, all 216 present R voted yea | `https://www.congress.gov/votes/house/119-1/102` | Official roll-call confirmation |
| O6 | 2020 presidency: Biden 306 EV / Trump 232; 81,283,501 (51.3%) / 74,223,975 (46.8%); turnout 66.6% | Wikipedia infobox via MediaWiki API (section 0) | AP certification article cited in lead; baseline cycle (no Kalshi 2020 markets — exchange launched 2021) |

## 3 · Polls & forecasters

| # | Fact | Source fetched this session | Note |
|---|---|---|---|
| P1 | 538 national 2024 averages (final 2024-09-12: **Trump 44.30 / Harris 47.12** → Harris +2.82; 2024-06-30: Trump 41.72/Biden 40.38/Kennedy 9.08; 2024-08-31: Harris 47.06/Trump 43.82) | `github.com/fivethirtyeight/data` cloned (sparse) → `data/polls/538-national-averages.csv` (1,604,311 bytes, verbatim) | Column semantics from the upstream README; national rows use `pct_estimate`, `state=National` |
| P2 | 538 2024 poll census (1,700 polls, as of 2024-10-28) + 469-race table w/ Cook ratings | same clone → `538-2024-polls.csv`, `538-2024-races.csv` | Byte sizes recorded in `data/polls/PROVENANCE.md` |
| P3 | 538 site shutdown 2025-03-05; Silver → Silver Bulletin; final 2024 forecast ≈50/50 | Wikipedia "FiveThirtyEight" / "Nate Silver" (fetched) | Why the poll archive ends 2024-09-12 (no late series exists publicly) |
| P4 | Quinnipiac 2026-09-10: House generic D 49 / R 38; Trump approval 33/59; n=970, 9/3–9/6, ±3.9 | syndicated full text (masslive, pennlive, mlive) | June 2026 benchmark (D 48 / R 41) in the same release |
| P5 | Monmouth 2024-10: generic D 47 / R 45 (n=802); weighted party ID 28R/42I/30D; institute ceased 2025-07-01 | `monmouth.edu` report page + Ballotpedia | IRREGULARITIES #5 |
| P6 | Pew 2026-09-16: ~70% of 2024 national polls used political weighting; "modestly more accurate" | `pewresearch.org` report page | Methodology context for the poll layer |
| P7 | Gallup: ended approval tracking Feb 2026 (final 36%, Dec 2025); ended horse-race 2015 | NYT 2026-02-11 + CNN 2026-02-12 | IRREGULARITIES #4; CNN Poll of Polls 39% (134-poll avg) cited in the CNN piece |
| P8 | VoteHub 2026-05-04: House D 85% (234 seats favored D vs 201 R); AK/OH toss-ups, TX R 58%; methodology (poll weighting + ENOP + market-data adjustment) | `votehub.com` forecast page + methodology PDF | Forecast cross-check point |
| P9 | RCP final 2024 battleground averages (Top Battlegrounds +0.8; AZ +2.8 … GA +1.3) + 2026 Senate board | `realclearpolling.com` battleground page | Poll-aggregator cross-check |

## 4 · Market cross-checks & regulation

| # | Fact | Source fetched this session | Note |
|---|---|---|---|
| X1 | Polymarket Balance-of-Power 2026: **D sweep 60%** (Kalshi: 59%) — $12.56M vol; hub launched 2026-09-16 | `polymarket.com/event/balance-of-power-2026-midterms` + PRNewswire | Cross-platform consistency check only (never a trading layer) |
| X2 | WaPo 2026-06-23: analysis of 2,000 primary markets — 75%-priced candidates won ~75% of the time; LA mayoral market >$40M | `washingtonpost.com` (2026-06-23) | Independent validation of market calibration |
| X3 | CFTC record: DCM approval (2020); KalshiEX v. CFTC (2024, political contracts OK); appeal dropped May 2025; Staff Advisory 26-08 (2026-03-12); Third Circuit 2026-04-06 (sports, exclusive CFTC jurisdiction); NV/NJ/MD cease-and-desist; S.D. Ohio 2026-03-09 (sports ≠ swaps) | law-firm analyses (Stinson, Regulatory Oversight, Paul Weiss) fetched via search | IRREGULARITIES #10 |
| X4 | The Leap mechanics: $100k paper, 15–30 days, ranked by realized P&L, min trading days, open positions force-closed, top-250 prizes | `tradingview.com/the-leap/*` + TradingView blog (2024-10) + newtrading.io (2026-07-18) | Contest template (KPS-sister convention matched) |
| X5 | EAC has no serving commissioners since July 2026 (2 dismissed, 1 resigned) | Wikipedia EAC page + Ballotpedia + usa.gov | IRREGULARITIES #1 (high) |
| X6 | Census CPS voting series (biennial since 1964; 2022: 52.2% CVAP turnout) | `census.gov` press release + NBER-hosted raw (DOI 10.60592/w6zf-md62) | Turnout source family |
| X7 | MIT Election Data & Science Lab datasets w/ DOIs (precinct 2020; House 1976–2022; Senate 1976–2020) | `dataverse.harvard.edu/dataverse/medsl` | Academic returns layer for R2/R6 |
| X8 | CQ Press: "final official results obtained from election authorities in each state" (1789–present) | `library.cqpress.com` sources-and-definitions page | Institutional results database |
| X9 | covers.com 2026-08-27: Senate R 53/D 47 (table) vs "57%" (prose) — internal inconsistency | `covers.com` guide | IRREGULARITIES #3; excluded from master list |
| X10 | predictionmarketspicks 2026-09-13: 34/35 Senate seats have markets (claims none for LA; hub shows thin LA market — both recorded); 66 competitive House districts individually priced | `predictionmarketspicks.com/midterms-2026` | IRREGULARITIES #9 |

## 5 · Things deliberately NOT used

- **political.org, electiontracker.live, uspollingdata.com** — surfaced in searches, excluded from the
  master list: not clearly official/primary; useful only as tertiary trackers. (Kept out per the
  "official/verified/trusted only" constraint.)
- **Any 2026 polling numbers not fetched this session** — none were used.
- **Web-rendered percentages as authoritative prices** — order-book/API figures preferred; web % kept
  as-rendered and labeled (IRREGULARITIES #2, #7).
