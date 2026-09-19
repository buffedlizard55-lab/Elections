# VERIFICATION — line-by-line audit log

**Sessions:** 2026-09-18 (initial capture + verification; all times UTC) and 2026-09-19 (21-entry
master-list expansion + bug fixes; UTC).
**Standard:** every fact that entered `data/`, `src/`, or the site was fetched from the named URL in
its session and checked line by line. Nothing was carried in from memory. Machine-checked half of the
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

## 6 · 2026-09-19 session — 21 new master-list entries (line-by-line)

Method: each candidate was **fetched directly** (proxied fetch tool) or, where a direct fetch failed,
**located via live search** with the observed text recorded below. Entries with a failed direct fetch
say so in the method column; none of the 21 is listed on assumption. The 21 entries are appended to
`data/sources/master.json` (32 → 53) with `verifiedOn: 2026-09-19`.

| # | Entry (master id) | Method | Observed (exact, abridged) |
|---|---|---|---|
| N1 | `openfec` — FEC Campaign Finance Data Portal | direct fetch `https://www.fec.gov/data/` | 'Campaign finance data — See how candidates and committees raise and spend money in federal elections'; live 2026 top-raising list (Ossoff GA-Sen, Talarico TX-Sen, Brown OH-Sen); API docs located via search: base `https://api.open.fec.gov/v1` |
| N2 | `nara-ec` — NARA Electoral College | direct fetch `https://www.archives.gov/electoral-college` | OFR 'coordinates certain functions of the Electoral College between the States and Congress'; posts Certificates of Ascertainment/Vote; results posted 'after Congress counts the electoral votes on January 6' |
| N3 | `census-p20586` — Census P20-586 (2022 voting report) | direct fetch `https://www.census.gov/library/publications/2024/demo/p20-586.html` | Report P20-586 (April 2024, Fabina & Martin); CPS supplement 'since 1964'; 'most consistently reliable and publicly available estimates of the characteristics of American voters' |
| N4 | `cisa-elections` — CISA Election Security | direct fetch `https://www.cisa.gov/topics/election-security` | CISA secures physical + cyber security of election systems; election infrastructure = critical infrastructure (Jan 2017); scope: registration DBs, counting/audit systems, polling places |
| N5 | `govinfo` — GPO GovInfo | direct fetch `https://www.govinfo.gov/` | Official GPO digital library; trending: H.R. 1 (ENR) One Big Beautiful Bill Act 2025 (PDF+XML), Jan 6 Committee Final Report; America-250 banner |
| N6 | `federal-register` — Federal Register | direct fetch `https://www.federalregister.gov/` | Current issue 2026-09-18: 114 documents / 40 agencies / 648 pages; 1,008,827 searchable; self-describes as unofficial prototype, official edition on govinfo |
| N7 | `clerk-house` — Clerk of the House | direct fetch `https://clerk.house.gov/` | '119th Congress, As of September 17th, 2026': 676 votes; **R 218 / D 214 / I 1 / 2 vacancies**; 12,398 measures introduced, 1,000 passed |
| N8 | `votegov` — Vote.gov | direct fetch `https://vote.gov/` | Official registration portal; 19 languages; state-by-state guides; new-citizen/military/overseas/disability/felony pages |
| N9 | `abc-news` — ABC News | direct fetch `https://abcnews.com/politics/` (live) | 'Trump says he is banning CNN, MSNOW and Politico from the White House' (28 min old); 'Federal Reserve raises interest rates for the 1st time since 2023' (Sep 16) |
| N10 | `cbs-news-2026` — CBS 2026 Midterms feature | direct fetch `https://www.cbsnews.com/feature/2026-midterm-elections/` | Battleground Tracker (Sep 13; model ≈228 D seats per related article); 9 Senate + 42 House races to watch; 'Supreme Court blocks Missouri from using new map favoring GOP' (Sep 10); RI Gov. McKee first sitting governor to lose a primary in 8 years (Sep 10) |
| N11 | `nbc-news-2026` — NBC 2026 Election hub | direct fetch `https://www.nbcnews.com/politics/2026-election` + search | Hub with primary results/calendar; 'Supreme Court denies Trump's mail-in voting restrictions' (Sep 15); Postmaster General: mail-voting system work stopped (Sep 17); Jun 14, 2026 NBC poll: generic D 49 / R 44, Trump approval 42% |
| N12 | `politico` — Politico | direct fetch `https://www.politico.com/` (live) | 'Trump says he's banning media outlets, including POLITICO, from White House'; 'Fears of election 'bloodbath' fuel small GOP revolts' (Sep 18) |
| N13 | `the-hill` — The Hill | direct fetch `https://thehill.com/` (live) | 'Trump: US strikes security deal with Greenland, Denmark'; 'Vance ends Iowa rally with 7-minute censure of Rob Sand'; 'Massie: GOP leaders found 'other Republicans'… Hegseth impeachment push' |
| N14 | `fox-news` — Fox News (lean flagged) | direct fetch `https://www.foxnews.com/` (live) | 'Trump declares victory on historic deal for Greenland… permanent US military rights'; 'VP warns midterms are a vote on common sense versus pure unadulterated crazy' (Vance, Council Bluffs) |
| N15 | `norc` — NORC at the University of Chicago | direct fetch `https://www.norc.org/` | 'NORC delivers objective, nonpartisan insights and analysis decision-makers trust'; divisions incl. Public Affairs; FedRAMP data-enclave item |
| N16 | `edison-ssrs` — Edison Research at SSRS | direct fetch `https://ssrs.com/edison-research-at-ssrs/` (edisonresearch.com redirects here) | 'In 2025, SSRS acquired Edison Research… as well as a deep background in election research'; 'Audio Key to Reaching 2026 Voters' (Jul 30, 2026) |
| N17 | `anes` — American National Election Studies | direct fetch `https://electionstudies.org/` | 'Guide to Public Opinion… 1948 to the present'; 70+ datasets; 'Download data for free'; 75-year timeline (Kish grid 1948, party ID 1952, feeling thermometer 1964) |
| N18 | `icpsr` — ICPSR (U. Michigan) | direct fetch `https://www.icpsr.umich.edu/` | 'Looking for data on US Elections? Check out ICPSR's Election Data Resource Guide' (Sep 16, 2026); 'world's largest archive of social and behavioral science data' |
| N19 | `predictit` — PredictIt | direct fetch `https://www.predictit.org/` (live books) | 'Real-Money Political Prediction Markets', 191 markets; BoP 'Dem. House & Senate 57¢ N/C' / 'D House, R Senate 36¢ 1¢' (217K shares); GOP Senate '47 or fewer 28¢ 1¢' (580K shares); Next WH Press Secretary Jennings 22¢ / Kelly 18¢ / Habba 7¢ |
| N20 | `uf-election-lab` — UF Election Lab (U.S. Elections Project) | direct fetch `https://election.lab.ufl.edu/voter-turnout/` + `https://www.electproject.org/` | VEP turnout 1789-Present (1948+ McDonald); 'distributed by the National Election Pool… runs the national exit poll'; 'The Minnesota Secretary of State uses these statistics as their official turnout rate'; electproject.org: data 'moved to the UF Election Lab… All data here supersedes' |
| N21 | `iem` — Iowa Electronic Markets | **via live search** (direct fetches of iem.isu.edu and the PDF failed: sandbox proxy error, recorded) | U. of Iowa-hosted 2026 prospectus (biz.uiowa.edu PDF, 'Forecasting 2026 Congressional Control: A Comparison of IEM and Kalshi'): contracts RS.gain26/RS.hold26/RS.lose26 + DH_DS26, $1.00 liquidation, IEM Trader's Manual rules; operator profile: founded 1988, oldest continuously operating real-money prediction market, $500 CFTC-no-action cap, zero fees |

### 6a · URL corrections & failures found while verifying (not added as sources)

| What happened | Resolution |
|---|---|
| `https://www.fec.gov/openFEC/` → 404 | Correct surface is `https://www.fec.gov/data/` (portal) + `https://api.open.fec.gov/` (API, via search) — entry N1 |
| `https://www.census.gov/topics/population/voting-and-registration-in-the-united-states.html` → 404 | Correct live report page is `https://www.census.gov/library/publications/2024/demo/p20-586.html` — entry N3 |
| `https://www.cisa.gov/elections` → 404 | Correct page is `https://www.cisa.gov/topics/election-security` — entry N4 |
| `https://www.cbsnews.com/elections/` → 404 | Correct hub is `https://www.cbsnews.com/feature/2026-midterm-elections/` (located via search, then fetched) — entry N10 |
| `https://www.nbcnews.com/politics/nbc-poll-check` → 404 | Live hub is `https://www.nbcnews.com/politics/2026-election` (located via search, then fetched) — entry N11 |
| `https://us-elections-project.unf.edu` → fetch failed (sandbox proxy error); `https://electproject.github.io/` → 404 page ("There isn't a GitHub Pages site here") | Canonical live URLs: `electproject.org` (stub, fetched) → `election.lab.ufl.edu/voter-turnout` (data, fetched) — entry N20 |
| `https://www.openelections.org/` → **GoDaddy domain-for-sale page** | Excluded from master list; **IRREGULARITIES #13**; use dataverse.harvard.edu |
| `https://iem.isu.edu/` + IEM 2026 prospectus PDF → fetch failed (proxy) | Entry N21 marked `verified-via-search` with the university-hosted prospectus as evidence. **Resolved in §7 (2026-09-19 session 3): `iem.isu.edu` is a non-existent host (Iowa State); canonical `https://iem.uiowa.edu/iem/` fetched 200 — irregularity #26.** |

## 7 · 2026-09-19 session 3 — live collection evidence, 20 new master-list entries, poll layer

### 7a · Live Kalshi collection (GitHub Actions, networked)

| Run | What | Evidence |
|---|---|---|
| 35409758565 (00:33 UTC) | First live `collect-kalshi.mjs` + `collect-senate-2024.mjs` | Registry 4,166 series (`/series?category=Elections` + `Politics`), 4,094 open events, 24,367 markets; 50 `SENATE{ST}` series queried → 36 settled 2024 markets in 18 states, 1,269 daily bars, 140 requests, 0 errors. Bot commit bdde995 (54 MB — irregularity #30). |
| 35410552688 (00:48 UTC) | Same-day re-run with the slim formats + Python sample + cross-check | 10,914 traded markets in the CSV; Python sample 2,000 markets; cross-check overlap 1,852: last price within 2¢ on 1,850, book on 1,841, volume never decreased. Bot commit 4896325 (≈ 12 MB diff, one-time index reshape). |
| spot check | `SENATEAZ-24-D` daily bar ending 2024-11-05T05:00Z | volume 93,619, close 70¢ (matches the API candlestick fetched by hand); result `yes` (Gallego) — now a unit test |
| spot check | Texas 2024 Senate | Kalshi `SENATETX-24-R` result `yes`; Texas SoS results portal: Cruz 5,990,741 – Allred 5,031,249 |

### 7b · 20 new master-list entries (all fetched directly on 2026-09-19)

| # | Entry | Fetched URL | What was observed (verbatim-level notes are in `data/sources/master.json → verified`) |
|---|---|---|---|
| N22 | `alaska-doe` | https://www.elections.alaska.gov/ | 2026 General Nov 3; 2026 primary official results; 2024 certified results + recount PDFs; press releases Sep 4/10/16 2026 |
| N23 | `georgia-sos` | https://sos.ga.gov/elections (→ elections-division page) | Nov 3 2026 page; results.sos.ga.gov (HD-13 special runoff 08/25/2026); data hub, CVRs, ballot images |
| N24 | `iowa-sos` | https://sos.iowa.gov/ | 'Obtain Elections Data' → /research-and-data; press release Sep 15 2026 (2026 General) |
| N25 | `maine-sos` | https://www.maine.gov/sos/elections-voting/election-results-data | June 9 2026 primary RCV summary reports + cast-vote-record exports |
| N26 | `michigan-sos` | https://www.michigan.gov/sos/elections | Nov 3 2026 dates; Aug 4 2026 primary results; Nov general candidate listing; Board of State Canvassers |
| N27 | `ncsbe` | https://www.ncsbe.gov/results-data | er.ncsbe.gov dashboard; dl.ncsbe.gov public files; registration/history/absentee data |
| N28 | `ohio-sos-data` | https://www.ohiosos.gov/data | results dashboards, past results, absentee/early-vote dashboard (data.ohiosos.gov) |
| N29 | `texas-sos-results` | https://results.texas-election.com/ | 2024 Nov 5 general: Cruz 5,990,741 / Allred 5,031,249; Trump 6,393,597 / Harris 4,835,250 |
| N30 | `arizona-sos` | https://azsos.gov/elections/election-information | 2026 calendar (reg. deadline Oct 5, early voting Oct 7, Nov 3); per-year election info back to 1974; results.arizona.vote |
| N31 | `la-county-rrcc` | https://www.lavote.gov/home/voting-elections/current-elections/election-results | June 2 2026 primary results (results.lavote.gov 4338); canvass schedule; SOVC archive |
| N32 | `emerson` | three release pages (TX, MI Sep 12–14; IA Aug 31–Sep 1) | toplines + methodology paragraphs (n, CI, mode, weighting) — numbers in the poll layer |
| N33 | `marquette-law-poll` | MLSPSC35 national release PDF | Sep 2–9 2026; LV D 54 / R 41; RV D 50 / R 42; 7-wave trend tables |
| N34 | `ssrs-voter-poll` | https://ssrs.com/news/the-voter-poll-by-ssrs/ + AP explainer | Edison acquired by SSRS; NEP exit poll + AP VoteCast merged into The Voter Poll (Nov 2025 launch; ABC/AP/CBS/CNN/Fox/NBC) |
| N35 | `siena-sri` | https://sri.siena.edu/ (scri.siena.edu redirects) | NYT/Siena national Sep 15 2026; Jul 1 state polls AK/IA/NC/OH; Texas Poll Sep 17 2026 (ReconMR PDF) |
| N36 | `unh-survey-center` | https://cola.unh.edu/unh-survey-center | releases archive on scholars.unh.edu (NH gov Aug 27, CD1 Aug 26, Maine Jul 29 2026); AAPOR TI |
| N37 | `suffolk-suprc` | https://www.suffolk.edu/academics/research-at-suffolk/political-research-center | Iowa Gov + Senate poll Aug 26 2026; NYC CityView Sep 8; 2024 poll-vs-actual table |
| N38 | `kalshi-api-docs` | https://docs.kalshi.com/api-reference/market/get-markets | Market schema (dollar strings, result, settlement_ts…); server list incl. external-api + api.elections |
| N39 | `ncsl-elections` | https://www.ncsl.org/elections-and-campaigns | 458 resources; Tables 7/16 updated Sep 15 2026; mail-ballot rules explainer |
| N40 | `cook-political` | https://www.cookpolitical.com/ratings/senate-race-ratings | Sep 15 2026 ratings: Toss Up ×7 (AK, IA, ME, MI, NH, OH, TX), Lean D GA/NC, Likely D MN, Likely R KS/NE |
| N41 | `inside-elections` | https://insideelections.com/ratings/senate/ | Sep 17 2026: Toss-up ME/MI/NH/OH; Tilt D GA/NC; Tilt R AK/IA; Lean R TX; JSON export URL |

### 7c · Poll layer fetches (numbers transcribed into `data/polls/poll-layer-2026.json`)

| Poll | Fetched | Key numbers |
|---|---|---|
| Quinnipiac national, Sep 3–6 2026 | https://poll.qu.edu/images/polling/us/us09102026_usvi28.pdf | 970 RV ±3.9; House control D 49 / R 38 / 13 DK; Trump 33/59; cites July 29 poll D 48 / R 41 (fixes the June mis-date, #29) |
| NBC News, May 29–Jun 7 2026 | nbcnews.com …rcna348913 | 2,400 RV ±2; D 49 / R 44 / 7 unsure; Trump 42/57 RV |
| Marquette national, Sep 2–9 2026 | MLSPSC35 PDF | LV 581 ±4.3 D 54 / R 41; RV 864 ±3.6 D 50 / R 42; trend since Nov 2025 |
| CNN/SSRS Maine + Michigan, Aug 31–Sep 6 2026 | cnn.com 2026/09/09 article + ssrs.com news page | ME 880 LV ±3.7 Jackson 48 / Collins 45; MI 843 LV ±4.1 El-Sayed 47 / Rogers 44 |
| Emerson TX / MI (Sep 12–14) / IA (Aug 31–Sep 1) | emersoncollegepolling.com releases | TX Talarico 47 / Paxton 46 (1,000 LV ±3); MI El-Sayed 48 / Rogers 46; IA Hinson 50 / Turek 45 (750 LV ±3.6) |
| ReconMR Texas Poll via Siena, Sep 8–11 2026 | reconmr.com release PDF | 614 LV ±4.3; Talarico 49 / Paxton 43; Hinojosa 49 / Abbott 45 |
| RealClearPolling generic ballot | realclearpolling.com | RCP average as of Sep 17 2026: D 50.5 / R 41.9 (14 polls, Aug 28–Sep 15) — aggregator reading |

### 7d · Failures & corrections this session

| What happened | Resolution |
|---|---|
| `results.enr.clarityelections.com/GA/` → HTTP 403; `sos.nh.gov` election results → 403 | Bot-blocked hosts (irregularity #35); Georgia entry uses sos.ga.gov + results.sos.ga.gov; NH not added |
| `sos.ga.gov/elections-division-georgia-secretary-of-states-office` → 404 | canonical slug omits 'of' (`…secretary-states-office`); entry uses `/elections` |
| `sos.iowa.gov/elections` and `/elections/results/index.html` → 404 | site redesign; homepage + `/research-and-data` recorded |
| `ncsl.org/…/election-results-timing-canvass-and-certification` → 404 | section landing page recorded |
| `iem.isu.edu` | non-existent host — corrected to `iem.uiowa.edu/iem/` (200; `/iem/markets/` 500 server-side) — irregularity #26 |
| Kalshi docs default host `external-api.kalshi.com` | recorded; cross-host comparison queued (R10, #31) |
