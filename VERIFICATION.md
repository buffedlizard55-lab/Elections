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
| N21 | `iem` — Iowa Electronic Markets | **CORRECTED + DIRECTLY VERIFIED 2026-09-19** — live fetch of `https://iemweb.biz.uiowa.edu/markets/`; entry URL fixed to `https://iem.uiowa.edu/iem/` (iem.isu.edu was simply the wrong domain — IRREGULARITIES #26) | Three 2026 winner-takes-all congressional-control markets open (U.S. Congressional / House / Senate Control); live price pages at `iemweb.biz.uiowa.edu/iem_market_info/2026-u-s-*-control-winner-takes-all-market/`; prior evidence retained (U. of Iowa-hosted 2026 prospectus 'Forecasting 2026 Congressional Control: A Comparison of IEM and Kalshi': RS.gain26/RS.hold26/RS.lose26 + DH_DS26, $1.00 liquidation, IEM Trader's Manual rules; founded 1988, oldest continuously operating real-money prediction market, $500 CFTC-no-action cap, zero fees) |

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
| `iem.isu.edu` | non-existent host — corrected to `iem.uiowa.edu/iem/` (200; `/iem/markets/` 500 server-side) — irregularity #26. Late batch (§8): markets board `iemweb.biz.uiowa.edu/markets/` fetched LIVE — three 2026 winner-takes-all congressional-control markets open; master entry upgraded to `verified` |
| Kalshi docs default host `external-api.kalshi.com` | recorded; cross-host comparison queued (R10, #31) |

---

## 8 · 2026-09-19 late/independent second batch — 20 new master-list entries (line-by-line, per user request "search 20 new entries … verify no hallucinations before adding")

Entry labels N22–N41 below are **batch-local** (they continue §6a's N1–N21 numbering and do not collide with §7, which uses no N-labels); the canonical identifiers are the master.json ids.

Method: every candidate was checked against the official source before being added — direct fetch where possible; where the sandbox fetch failed, the evidence is the institution's OWN document quoted via live search (status `verified-via-search`). Candidates deliberately NOT added: Pew Research Center and SSRS/Edison (already master entries N15/N16), uspollingdata.com (unverified aggregator citing a defunct Gallup series — §5), 270toWin / Decision Desk HQ (aggregator/forecast-vendor fit still unverified — deferred), AtlasIntel / SurveyUSA (weaker institutional standing), Data for Progress (advocacy-aligned). Master list is now 73 entries.

| # | Entry (id) | How verified | What was observed on the official source (2026-09-19) |
|---|---|---|---|
| N22 | Cook Political Report (`cook-political`) | direct fetch cookpolitical.com | "Non-Partisan Political Analysis for US Elections & Campaigns"; Battleground District Project (with New River Strategies (D) + GS Strategy Group (R)): competitive-district generic ballot D 49 / R 47 (Sep 17, 2026); CPR PollTracker Trump trendlines; 2026 House Open Seat Tracker; NH Senate → Toss Up (Sep 15); free newsletters + free podcast; deep archive subscriber-only |
| N23 | Sabato's Crystal Ball — UVA Center for Politics (`crystal-ball`) | direct fetch centerforpolitics.org/crystalball | TX Senate Paxton–Talarico → Toss-up; FL Senate → Safe R; NH Senate → Toss-up; Gov Toss-ups AK + GA; 6 competitive SoS races; "GOP still favored, but just barely" |
| N24 | Inside Elections (`inside-elections`) | direct fetch insideelections.com | "Nonpartisan Analysis Since 1980"; public rating-change log: Sep 17 (ME Senate II Tilt R → Toss-up, FL Gov → Lean R, FL-14 → Toss-up), Sep 3 (OH Senate III → Toss-up, NH Senate II → Toss-up, AZ Gov → Tilt D), Aug 6 (NC/GA Senate II → Tilt D) |
| N25 | Marist Poll (`marist-poll`) | direct fetch maristpoll.marist.edu (+ search for PDFs) | "classroom project in 1978" → top survey org; latest poll Jul 1, 2026 (America 250); Poll Hub EP463 (Sep 17, 2026); NPR/PBS News/Marist methodology PDFs on the .edu (Mar 2026, n=1,591); AAPOR Transparency Initiative charter member; free Poll Academy |
| N26 | Emerson College Polling (`emerson-polling`) | direct fetch emersoncollegepolling.com | "non-partisan organization"; live 2026: MI Sep 17 (El-Sayed–Rogers dead heat; Benson leads Gov), TX Sep 17 (Talarico 47 – Paxton 46; Abbott 49 – Hinojosa 46), KS Sep 18, NV Sep 10 (Trump 37/55); Nexstar/KLAS partnerships; free full releases |
| N27 | Suffolk University Political Research Center (`suffolk-suprc`) | **via live search** (suffolk.edu-hosted press-release PDFs; landing page returned HTTP 500 from sandbox — flagged in entry) | Jun 16, 2026 Suffolk/Boston Globe MA (Healey 56-31 Minogue; Markey 55-30 Deaton; tax-cut question 66-21); Aug 18, 2026 MA Senate Dem primary (Markey 52 – Moulton 38, Aug 13-16 field); corroboration: founded 2002; first center to publish ALL cross-tabs free; 538 grade A; 2024: 14/14 swing-state outcomes within MoE in final 3 weeks |
| N28 | Siena Research Institute (`siena-research`) | direct fetch sri.siena.edu | "preeminent academically situated polling institute in New York State"; Sep 17 TX (Hinojosa +4 over Abbott; Talarico +6), Sep 15 NYT/Siena national, Aug 25 NYT/Inquirer/Siena PA (Shapiro 55-39), Aug 12 NY Gov (Hochul 49-39), Jul 1 NYT/Siena AK/IA/NC/OH with FREE toplines+crosstabs (Sullivan 47-45 Peltola; Hinson 48-46; Cooper 50-43; Husted 50-47); Sep 9, 2025 NYC mayor (Mamdani 46/Cuomo 24/Sliwa 15/Adams 9 — settled, backtest-usable); 94 archive pages; 538 "most accurate pollster" citation on official X |
| N29 | Marquette Law School Poll (`marquette-law-poll`) | direct fetch law.marquette.edu/poll | Sep 17, 2026 release (Charles Franklin): national Sep 2-9, n=1,023, ±3.3 — SCOTUS approval 43/57 w/ trend tables to Jan 2025; EO-screening 60% unconstitutional; court reform (ethics 89 / terms 79 / expand 53); WI Dem gov primary Jul 29 (Hong 38/Barnes 16/Crowley 7; +leaners 46); full questionnaires free; old /political-polls URL 404 → /poll/ |
| N30 | UNH Survey Center (`unh-survey-center`) | direct fetch scholars.unh.edu/survey_center_polls | repository of every Granite State Poll release as free PDF; since 1976; 40-50 projects/yr; 2026: Aug 27 NH Gov (Ayotte lead grows), Aug 26 MA Senate primary (Markey pulls away), Aug 26 NH CD1 (Pappas slides), Jun 30 NH tighten, Jan 21 NH Senate open seat (Sununu/Pappas frontrunners), Sep New England economy surveys |
| N31 | Texas Politics Project (`texas-politics-project`) | direct fetch texaspolitics.utexas.edu | Aug 2026 TX: 57% oppose local data centers; ICE 41/46; 64% extremely concerned on healthcare costs; Trump second-term approval trend; Second Reading podcast (Henson/Blank) on 2026 TX elections; free newsletter |
| N32 | YouGov US (`yougov-us`) | direct fetch yougov.com/en-us | live free trackers: Trump approval 39/59; congressional ballot R 39 / D 44; Economist/YouGov Sep 11-14, 2026: "Independents give Democrats a big midterms lead among likely voters"; daily results archive |
| N33 | Ipsos in the U.S. (`ipsos-us`) | direct fetch ipsos.com/en-us | "one of the world's leading market research companies"; 6M+ panelists, 90 markets; KnowledgePanel (probability-based); America 250 program; Data Drops 2026 (Aug 24); Reuters/Ipsos fieldwork house |
| N34 | Morning Consult Political Intelligence (`morning-consult-intel`) | **via live search** (official intel.morningconsult.com tracker pages; morningconsult.com homepage fetched directly — now B2B) | "Tracking Public Opinion of Trump's Washington" (Eli Yokley): Trump 43/54 (net -11); Dems +5 on economy trust (46-41); methodology public (online quota sample weighted on CPS/ACS + 2024 vote; e.g. May 22-24 n=2,204 RV ±2); separate 2026 midterm generic-ballot tracker |
| N35 | OpenSecrets (`opensecrets`) | direct fetch opensecrets.org | free federal + ALL-50-STATE databases (candidates, governors, legislatures, judges in the 38 electing states, outside spending, dark money, PACs, lobbying/FARA, political ads, ballot measures); live newsroom Sep 16, 2026; merged CRP + NIMSP |
| N36 | NIMSP FollowTheMoney (`nimsp-ftm`) | direct fetch followthemoney.org | state campaign finance 1990-2026 tools (all states + DC + territories; independent spending; lobbying; ballot measures; Competitiveness Index); merger banner: data current through 2024 election year, site unmaintained during OpenSecrets integration — IRREGULARITIES #28 |
| N37 | NASS (`nass`) | direct fetch nass.org | "nation's oldest, nonpartisan professional organization for public officials"; members = 50 states + DC + territories chief election officials; Can I Vote portal; 2026 newsroom: National Voter Registration Day, NASS+NASED+ABA poll-worker recruitment, Microsoft "Check. Recheck. Vote." AI-literacy campaign |
| N38 | NCSL State Elections 2026 hub (`ncsl-2026`) | **via live search** (NCSL's own Jul 1, 2026 press release, re-promoted Aug 17; direct ncsl.org fetches failed from sandbox) | Nov 3, 2026: 6,139 state legislative seats in 46 states (>83% of all seats nationwide) + 157 in DC/AS/GU/MP; 88 of 99 chambers; partisan composition, races by state/chamber, interactive map, ballot measures, election administration; updated through and after Nov 3 |
| N39 | DOJ Civil Rights Division (`doj-crt`) | direct fetch justice.gov/crt | live 2026 press releases (UC Davis finding; Minnesota compliance review; California Glock-ban suit; NY nursing-facilities suit; Evanston reparations intervention); election-integrity reporting portal; houses the Voting Section; legacy voting-section pages 404 → moved to administration archive — IRREGULARITIES #27 |
| N40 | Roper Center (`roper-center`) | direct fetch ropercenter.cornell.edu | Cornell; mission "collect, preserve, and disseminate public opinion data"; first social-science data archive (1947, Elmo Roper; Fortune Survey 1935-50); iPoll; public presidential-approval app; **"one of the few places that makes available state and national exit polls, back to 1972"**; Elections & Presidents highlights; 2026 Mitofsky Award → Scott Keeter |
| N41 | CRS Products (`crs`) | direct fetch congress.gov/crs-products (crsreports.congress.gov redirects) | "nonpartisan shared staff to congressional committees and Members"; U.S.-Government works, no copyright, freely redistributable; live stream (Sep 18, 2026: R48887 U.S. Conflict with Iran etc.); full-text search + alerts |

Duplicate-check before adding: `pew` (N15) and `edison-ssrs` (N16) already existed — Pew/SSRS candidates were dropped from the batch rather than duplicated. All 20 new ids checked unique programmatically (73 total, `new Set(ids).size === 73`). Lint (`scripts/lint-verified.mjs`) re-run after the batch: 16 data JSON / **73 sources** / 4 outcomes / 5 markets — all provenance checks pass.

---

## 9 · 2026-09-19 session 4 (branch `arena/01a0bada-elections`) — 20 new master-list entries, every one fetched directly

Requested verbatim: *"Search for 20 new entries. Before adding to master list, Verify no hallucinations."* Entry labels
N42–N61 below are **batch-local** (they continue §8's N22–N41 numbering); the canonical identifiers are the
`data/sources/master.json` ids shown in parentheses.

Method — stricter than §6–§8: **all 20 entries were fetched directly** through this session's proxied fetch tool on
2026-09-19. Nothing in this batch was admitted on a search snippet, on prior knowledge, or on a URL that could not be
opened. Each `verified` field records only text observed on the fetched page, quoted verbatim where quotation marks
appear. Candidates that failed to fetch were **excluded** and are itemised in §9c. The merge ran a programmatic
duplicate check first: 105 ids / 105 urls, `new Set(ids).size === 105`, `new Set(urls).size === 105`, and none of the
20 new domains occurs anywhere in the previous 85 entries. Master list is now **105 entries** (32 verified 2026-09-18,
73 verified 2026-09-19).

| # | Entry (id) | Fetched URL (link for manual review) | What was observed on the official source (2026-09-19) |
|---|---|---|---|
| N42 | FVAP — Federal Voting Assistance Program, DoD (`fvap`) | direct fetch https://www.fvap.gov/ | "Voting assistance for Service members, their families and overseas citizens"; countdown "**45 Days until the November 03 General Election**" (2026-09-19 + 45 = 2026-11-03); Upcoming Elections: Georgia General Runoff + Arkansas General Runoff (Dec 1); state selector = 50 states + DC, AS, GU, PR, VI with guidelines/dates/office lookup/ballot status; FPCA + FWAB tools; Voter Alerts Sep 3, Aug 4, Jul 17 2026; "Phishing Campaign Impersonating FVAP.gov" (Apr 29) |
| N43 | Wisconsin Elections Commission (`wisconsin-wec`) | direct fetch https://elections.wi.gov/ | "Your 2026 Election Roadmap" + 2026 Election Information Hub; "a **six member, bipartisan commission** … supporting Wisconsin's **1,851 municipal clerks and 72 county clerks**"; dates Oct 14 (mail/online registration deadline), Oct 20 (in-person absentee may begin), Oct 30 (write-in filing; in-person registration), **Nov 03 2026 General Election**; MyVote WI, ElectEd, sworn complaints, election security. Deep path `/elections-voting` returned "**Access denied**" — IRREGULARITIES **#40** |
| N44 | Nevada Secretary of State — Elections (`nevada-sos`) | direct fetch https://www.nvsos.gov/elections | Hub links: Election Information, Voter Information, **Voter Registration Statistics**, Information for Candidates, Initiatives & Referenda, Resources, My Voter File (`/votersearch/`). URL CORRECTION: `/sos-elections` → the site's own 404 ("may have been removed, renamed, entered wrong…") behind a BotDetect CAPTCHA — **#41**. County results pages located via live search on the same host (`/SOSelectionPages/results/2026StateWidePrimary/Clark.aspx` — "Official Primary Election Results Clark", 141/141 precincts) |
| N45 | California Secretary of State — Elections Division (`california-sos`) | direct fetch https://www.sos.ca.gov/elections | "Elections and Voter Information :: California Secretary of State"; **General Election – November 3, 2026**: online registration closes Oct 19, ballots mailed by Oct 5, drop boxes open Oct 6, first VCA vote centers Oct 24, in-person early voting Oct 31, "Mailed ballots must be postmarked on or before November 3", polls 7:00 a.m.–8:00 p.m.; registertovote.ca.gov, voterstatus.sos.ca.gov, voterguide.sos.ca.gov, VoteCal, Same-Day/Conditional registration, NVRA, Political Parties, Elections Division (800) 345-VOTE. CDN host `elections.cdn.sos.ca.gov` → S3 "**AccessDenied**" — **#42** |
| N46 | Pennsylvania Department of State — vote.pa.gov (`pennsylvania-dos`) | direct fetch https://www.pa.gov/agencies/vote (vote.pa.gov redirects here) | "Welcome to Pennsylvania's official voter information website"; **Election Results** (state returns site), **Voting and Election Statistics**, Upcoming Elections, mail/absentee + ballot availability, mail ballot before Election Day, Accessible Remote Mail Ballot, county election offices, election complaints, poll workers, Election Security, "**Fact-Checking Election Claims**"; ra-voterreg@pa.gov, 1-877-868-3772; Spanish + Traditional Chinese paths |
| N47 | Virginia Department of Elections (`virginia-elections`) | direct fetch https://www.elections.virginia.gov/ | "An official website of the Commonwealth of Virginia"; live notice "**Early Voting Starts September 18** … through October 31, 2026"; Citizen Portal (`vote.elections.virginia.gov/VoterInformation`); Upcoming Election Info; Voter Pocket Guide; polling-place/ballot lookup; **Campaign Finance** — "Full public access to campaign financial data and financial disclosure reports"; Officer of Election application; mission: "promotes and supports accurate, fair, open and secure elections" |
| N48 | U.S. Government Accountability Office (`gao`) | direct fetch https://www.gao.gov/ | "When Members of Congress Need Answers to Complex Questions—They Come to GAO"; live products with Published **and** Publicly Released dates (GAO-26-109302, GAO-26-109300 — Sep 18, 2026; GAO-26-107871, GAO-26-109097, GAO-26-108106, GAO-26-108836 — Sep 17, 2026); bid-protest decisions Sep 17–18 2026; "Improper Payments Rose to an Estimated $186 Billion in FY25"; High Risk List; blog "**Mail is Taking Longer to Deliver—We Looked at Why**" (Sep 17, 2026) |
| N49 | Cooperative Election Study — Tufts Tisch College (`ces-tufts`) | direct fetch https://tischcollege.tufts.edu/research-faculty/research-centers/cooperative-election-study (`/ces` redirects here) | "the **largest academic survey focused on American elections**"; "Since 2006 … **more than a half-million Americans**"; "partially funded by the **National Science Foundation**"; election years = "**more than 50,000 American adults before and after the election**" (pre-election wave: attitudes, demographics, policy assessments, political information, vote intentions; post-election wave: how they voted); Interactive CES Analytics, Dataverse data downloads, CES blog, listserv; in-the-news item "Could Prediction Markets Replace Election Polling?" (Tufts Now, 2026-07-31). Harvard host `cces.gov.harvard.edu` is stale ("PLEASE NOTE THAT OUR NEW WEBSITE CAN BE FOUND HERE"; newest news March 04, 2024) — **#44** |
| N50 | Stanford-MIT Healthy Elections Project (`healthyelections-mit`) | direct fetch https://web.mit.edu/healthyelections/www/home.html | "Promoting a Safe & Equitable **2020** Election"; "The Virus and the Vote" final report; "**COVID-Related Election Litigation Tracker**"; "After the Polls Close"; "The Miracle and Tragedy of the 2020 Election"; Latest Additions dated **Jun 19, 2021** / Apr 14, 2021; "© 2022 All rights reserved". `healthyelections.org` → HTTP 500 and `healthyelections.mit.edu` is a stub — **#45**; entry labelled ARCHIVE |
| N51 | VoteView — UCLA (`voteview`) | direct fetch https://voteview.com/ | "**UCLA Presents voteview.com beta 3**"; "**113,550 votes found**"; filters for chamber, date, Congress 1st–119th, vote outcome, subject matter, Key Vote (CQ/Wikipedia). Live 119th-Congress records on the page: Senate 897 (Sep 17, 2026, PN9994, **49-45**, Nomination Confirmed — Kasdin Miller Mitchell, N.D. Tex.), Senate 896 (49-47 cloture), Senate 895 (S4668, 77-22), House 674 (S2403, 401-14), 673 (HR9497, 415-9), 672 (HR9340, 417-3), 671 (HJRES213, 214-208) — House votes dated Sep 16, 2026; per-vote export |
| N52 | CIRCLE — Tufts (`circle-tufts`) | direct fetch https://circle.tufts.edu/ | "**2026 Youth Poll** — over 5,000 young people … ahead of the midterms"; "Almost **50 million Gen Zers** will be eligible to vote in 2026 … Fielded between **January 26 and February 12** by CIRCLE and When We All Vote … oversampling young Black and Latino voters"; "**2026 Youth Electoral Significance Index** — rankings of 2026 U.S. Senate and gubernatorial elections where the youth vote can have the biggest impact on results" (`/yesi2026`); "Modest Increases in Youth Voter Registration Compared to 2022 Midterms" (18–19 registrations still lower); 2024 post-election youth-vote analyses; Gen Z attitudes-toward-democracy report |
| N53 | Brennan Center for Justice, NYU Law (`brennan-center`) | direct fetch https://www.brennancenter.org/ | "We stand for the rule of law / the freedom to vote / democracy"; "strengthens American democracy through research, advocacy, and public education"; topic hubs **Voting & Elections**, **Money in Politics**, Government Power; live 2026 items with in-line type labels: resource "**Vote Safely in 2026**", policy solution "Eight Solutions to Protect Voting Rights and Improve Representation", analysis "**Supreme Court Rules Postal Service Must Deliver Mail Ballots**" (2026-09-15), expert brief "The Trump Administration's Campaign to Undermine the Next Election"; midterms hub `/midterms-2026`. Deep-path guesses returned "Content Not Found" — §9c |
| N54 | Bipartisan Policy Center — Elections (`bipartisan-policy-center`) | direct fetch https://bipartisanpolicy.org/explainer/a-proposal-for-bipartisan-federal-election-reform/ | Explainer comparing the **ACE Act** (Chair Bryan Steil, R-WI) with the **Freedom to Vote Act** (Bennet/Hickenlooper/Klobuchar) across four areas — casting a ballot, voter registration, voter ID, certification — drawn from "**BPC's bipartisan election official task force**"; links three BPC reports verified on the page ("Logical Election Policy" with its numbered recommendations, "Policies Beyond the Next Election", "Voting Experience 2020"); NCSL-linked state counts (automatic registration 22 states, online 42); states plainly it "is not an exhaustive proposal". Shallow paths `/elections/`, `/topic/elections/` → "Page not found" — §9c |
| N55 | Decision Desk HQ + DDHQ Votes (`decision-desk-hq`) | direct fetch https://www.decisiondeskhq.com/ | "delivers reliable and fast U.S. election data — built for newsrooms, platforms, research, and business use"; "independent results and analysis across **every level** of U.S. elections … presidency and Congress down to mayor and school board"; Data Reporting ("real-time county level election results, **historical datasets** and race projections"), Analysis; **DDHQ Votes** (`votes.decisiondeskhq.com`): "results … **dating back to 2000**", interactive maps/swing views, and "**Prediction Market Integration — Track live odds and market movement from Kalshi and Polymarket alongside official election results**"; Kalshi-branded screenshot of 2024 Wisconsin presidential results |
| N56 | 270toWin (`270towin`) | direct fetch https://www.270towin.com/ | "**Prediction Markets** — Which party will win the 2028 Presidential Election? **57% / 41%**" with a Kalshi logo and the disclosure "Probability based on the most recent 'yes' trade for each party as of **Sep. 19, 2026 at 18:17 UTC** (2:17 PM EDT). **May not total 100%.**"; "Kalshi **American Power Index** (+1.90 D, KPOW as of 9/17/26 11:53 AM EDT)"; 2026 **Forecast** and 2026 **Polls** pages for Senate/House/Governor; maps for President, Senate, House, Governor, State Senate, State House; dated headlines: Delaware primary live results (Sep 15, 2026), Rhode Island (Sep 9), New Hampshire (Sep 8), "New Interactive Maps: FiftyPlusOne Senate and House Forecast" (Sep 2), Massachusetts (Aug 31); "© 2026 Electoral Ventures LLC"; base map stamped "Map Updated: Jan. 29, 2025" — cross-checked in §9a, recorded as **#46** |
| N57 | AtlasIntel (`atlasintel`) | direct fetch https://www.atlasintel.org/ | "**Public Polls** — Nationally representative polls conducted by AtlasIntel using its **proprietary data collection technology and post-stratification algorithms**" (`/polls/general-release-polls`); "Tracking Pro — Proprietary **high-frequency polling** … when public opinion shifts and the likelihood of political outcomes changes" (`tracking.atlasintel.org`); Atlas Monitor; Political Risk; Forecasting; Atlas Político. Admitted with the method caveat on the entry and **#49** |
| N58 | The Harris Poll (`harris-poll`) | direct fetch https://theharrispoll.com/ | "See Tomorrow. Shape Today."; "a global **market research and advisory partner**"; scale claims "70+ Years … since 1956", "40M Unique respondents", "67K+ Media mentions last year", "90 Countries surveyed"; report library (Six Types of AI Users, Sports Momentum, State of Pets 2026, America's World Cup Moment, Algorithmic Aisle, AutoTECHCAST 2026); sub-brands Harris Quest / Storyline Strategies / Bera AI / Emerald Research Group. **No political polling on the page** — DISCREPANCY **#43**; entry admitted as methodology/market-research only |
| N59 | NPR — Elections 2026 (`npr-elections`) | direct fetch https://www.npr.org/sections/elections/ | "Elections 2026: The latest from the NPR Network"; Sep 18, 2026: "Republican 'cavalry' arrives with a **Trump-backed $150 million ad blitz** in key races" ("two Trump-aligned super PACs have reserved more than $150 million in ads — primarily in deep red House and Senate races that have now become competitive", 4:05 audio + transcript), "A DHS email raises new questions about the Trump administration's election plans" (Exclusive, document linked), "It's illegal for armed federal officers to be at polls. Lawsuits seek to ensure that" (Exclusive); Sep 16, 2026: "**close to 100 lawmakers** who started this Congress will not be around for the next one, according to an **NPR analysis**"; "AI-generated ads are everywhere" |
| N60 | PBS NewsHour — Politics (`pbs-newshour`) | direct fetch https://www.pbs.org/newshour/politics | "Politics — Follow PBS NewsHour's **complete coverage of politics, Congress, the Supreme court and the presidency**"; items with on-page dates and bylines: Sep 19 "Trump announces all 50 states joining Medicaid drug pricing model" (Fatima Hussein, AP), "MS NOW, CNN and Politico say their journalists were denied access to White House after Trump ban" (Jocelyn Noveck, AP), Kennedy Center protest (Gary Fields, AP); Sep 18 Big Bend border wall ("$46 billion plan", Rebecca Santana, AP), Greenland agreement (Nick Schifrin), press-freedom ban (Liz Landers), News Wrap (Newsom AI order), "Shadow surge" immigration arrests (Geoff Bennett) |
| N61 | Saint Anselm College Survey Center — NHIOP (`saint-anselm-sasc`) | direct fetch of the primary PDF https://www.anselm.edu/sites/default/files/2026-06/June%2024-25%202026%20Poll.pdf | "A SURVEY OF NEW HAMPSHIRE REGISTERED VOTERS — **June 24-25, 2026**", Neil Levesque (Executive Director), Tauna Sisco Ph.D. (Faculty Advisor); method verbatim: "online surveys of **1614** New Hampshire registered voters … collected between June 24th and 25h, 2026, from cell phone users randomly drawn from a sample of registered voters … **margin of sampling error of +/- 2.4%** with a confidence interval of 95% … weighted for age, gender, geography, and education based on a voter demographic model derived from historical voting patterns, but are **not weighted by party registration or party identification**"; sections incl. Weighted Marginals/Tables/Demographics; ballot tests NH Gov (Ayotte v Warmington), US Senate (Pappas v Brown; Pappas v Sununu), CD-1/CD-2 primaries, 2028 NH primary; findings: Pappas 46-43 favourable and **62-20** over Manzur; Sununu over Brown **59-21**; Shaheen 22 / Sullivan 15 (CD-1 D); Noveletsky 16 / DiLorenzo 13 (CD-1 R); Goodlander **76-9** over Beauchemin |

### 9a · Cross-check of the new sources against this project's own captured Kalshi data (run 2026-09-19)

Every state/pollster entry added above was tied back to the markets this repo already captured, using
`data/kalshi/forward/universe-open.json` (full open universe, 24,084 markets, `capturedAt 2026-09-19`) and
`data/kalshi/tracker/daily/2026-09-19.csv`. Prices are the captured `yes_bid`/`yes_ask`, never a rendered percentage:

| New entry | Kalshi market in the 2026-09-19 capture (candidate name as captured) | Captured bid/ask |
|---|---|---|
| `wisconsin-wec` | GOVPARTYWI-26-D "David Crowley" · GOVPARTYWI-26-R "Tom Tiffany" (+ vote-share ladders `KXVOTEGENERAL-GOVPARTYWI-26DCRO-*`, `…26TTIF-*`) | 0.80/0.81 · 0.19/0.20 |
| `nevada-sos` | GOVPARTYNV-26-R "Joe Lombardo" · GOVPARTYNV-26-D "Aaron Ford" (+ `…NV-26JLOM-*`, `…NV-26AFOR-*`) | 0.55/0.56 · 0.44/0.45 |
| `california-sos` | GOVPARTYCA-26-D "Xavier Becerra" · GOVPARTYCA-26-R "Steve Hilton"; KXGOVCA-26-SHIL is **#11 by lifetime volume** (8,707,389 contracts) | 0.958/0.967 · 0.029/0.043 |
| `pennsylvania-dos` | GOVPARTYPA-26-D "Josh Shapiro" · GOVPARTYPA-26-R "Stacy Garrity" (+ ladders e.g. `…PA-26JSHA-62` "At least 62%" 0.39/0.45, `…PA-26SGAR-36` "At least 36%" 0.51/0.60) | 0.968/0.973 · 0.030/0.033 |
| `virginia-elections` | SENATEVA-26-D "Mark Warner" · SENATEVA-26-R "Bert Mizusawa" (+ `…VA-26MWAR-*`, `…VA-26BMIZ-*`); **no VA gubernatorial market in the capture** (last VA governor election was 2025) | 0.973/0.980 · 0.003/0.025 |
| `saint-anselm-sasc` | SENATENH-26-D "Chris Pappas" · SENATENH-26-R "John E. Sununu" — the same two candidates the June 2026 SACSC release tests head-to-head (+ `…NH-26CPAP-*`, `…NH-26JSUN-*`) | 0.83/0.84 · 0.17/0.18 |
| `270towin` | KXPRESPARTY-2028-D "Democratic party" · KXPRESPARTY-2028-R "Republican party" | 0.58/0.59 · 0.41/0.42 |

**Third-party rendering vs our captures (the substantive finding, IRREGULARITIES #46).** 270toWin displayed "57%" and
"41%" for the 2028 presidential party market, labelled "most recent 'yes' trade … as of Sep. 19, 2026 at 18:17 UTC" and
"May not total 100%". This project's two independent captures of the same tickers — Node events feed
`2026-09-19T15:59:45.931Z` and Python markets feed `2026-09-19T15:59:58+00:00` — are **identical to each other**
(D 0.58/0.59/last 0.58; R 0.41/0.42/last 0.41). The rendered 41% equals the Republican last trade exactly; 57% is 1¢
below the Democratic last trade taken 2h18m earlier. Attribution of 57%→Democrat / 41%→Republican is an **inference**
from that match (the page labels neither figure), and the 98% sum matches the page's own disclaimer. Conclusion
recorded: third-party panels corroborate our captures to within 1¢, but they are last-trade based, need not sum to
100%, and can sit on a page whose base map is 20 months older — so they are a corroboration surface, never a price
source.

**Election-date triangulation.** FVAP's live countdown ("45 Days until the November 03 General Election"), the WEC
calendar ("Nov 03 2026 — 2026 General Election"), California SOS ("General Election - November 3, 2026"), Virginia
ELECT ("Early Voting Starts September 18 … through October 31, 2026") and the captured Kalshi `close_time` values for
the 2026 state markets (`2027-11-03T15:00:00Z` / `2027-11-03T14:00:00Z`, i.e. election Nov 3 2026 with a one-year
settlement window) all agree. No date discrepancy found.

### 9b · Organisational change applied to ALL 105 entries: `category`

To keep a 105-row list readable on the site, every entry now carries a `category` label (added 2026-09-19, session 4).
The assignment is a **fixed per-id map**, reviewed id-by-id against each entry's own `type` and `verified` text — it is
an organisational label only and never alters verified content, URLs or notes:

| Category | Count | Examples |
|---|---|---|
| Government — federal | 20 | fec-results, eac, cftc, govinfo, clerk-house, doj-crt, crs, **fvap**, **gao** |
| Government — state & local | 17 | ncsbe, texas-sos-results, la-county-rrcc, nass, ncsl-elections, **wisconsin-wec**, **nevada-sos**, **california-sos**, **pennsylvania-dos**, **virginia-elections** |
| Official publishers & archives | 1 | cq |
| Academic & university research | 10 | mit-lab, harvard-dataverse, anes, icpsr, uf-election-lab, roper-center, **ces-tufts**, **healthyelections-mit**, **voteview**, **circle-tufts** |
| Pollsters & survey research | 20 | gallup, pew, quinnipiac, norc, edison-ssrs, siena-sri, unh-survey-center, suffolk-suprc, emerson, marquette-law-poll, marist-poll, yougov-us, ipsos-us, **atlasintel**, **harris-poll**, **saint-anselm-sasc** |
| News outlets & wires | 13 | ap, reuters, cnn, nyt, wapo, abc-news, cbs-news-2026, nbc-news-2026, politico, the-hill, fox-news, **npr-elections**, **pbs-newshour** |
| Prediction markets & exchange data | 8 | kalshi, kalshi-api-docs, kalshi-fee-schedule, kalshi-hub-claims, kalshi-midterms-hub, polymarket, predictit, iem |
| Ratings, forecasts & analysis | 15 | cook-political, inside-elections, crystal-ball, rcp, votehub, silver-bulletin, 538-archive, ballotpedia, opensecrets, nimsp-ftm, ifes, **brennan-center**, **bipartisan-policy-center**, **decision-desk-hq**, **270towin** |
| Contest & methodology references | 1 | the-leap |

Judgement calls recorded for review: `ifes`, `ballotpedia`, `opensecrets` and `nimsp-ftm` are nonprofits/archives but
are filed under *Ratings, forecasts & analysis* because that is how this project uses them (aggregated reference
layers, not primary returns); `roper-center` is filed under *Academic & university research* (a Cornell data archive)
rather than with pollsters; `ncsl-elections` and `nass` are filed under *Government — state & local* because both are
bodies of state officials; `crs` and `gao` are federal, not *analysis*, because both are official government research
arms of Congress; `the-leap` alone forms *Contest & methodology references* (it is the contest-rules source).

### 9c · Candidates NOT added this session (no-hallucination rule enforced)

| Candidate | What happened when it was fetched 2026-09-19 | Disposition |
|---|---|---|
| SurveyUSA (`surveypoll.com`) | two attempts, bare "Failed to fetch page", no content returned | **NOT added** — IRREGULARITIES **#47**; §8's deferral stands |
| HarrisX (`thehillx.com`) | bare "Failed to fetch page", no content returned | **NOT added** — **#47**; the Harris Poll entry (#43) documents why the two brands must not be conflated |
| CourtListener / Free Law Project (`courtlistener.com`) | HTTP 500 bare and with `?q=election` | **NOT added** — **#47**; retry via its documented free REST API next session |
| Selzer & Company (`selzerco.com`) | page returned only navigation scaffolding ("Skip to primary navigation", "## Main Content", "Menu") — no substantive content to verify | **NOT added** — **#48**; syndicated coverage of the 2024 Iowa miss and of an announced exit from election polling is **secondary and unfetched**, so no figure from it is recorded as verified |
| Franklin & Marshall College Poll (`fandm.edu`) | official release not fetched this session; only syndicated coverage located via search (WGAL, ABC27, PoliticsPA — Shapiro 50 / Garrity 28, 546 registered PA voters fielded Jun 8–14 2026 at the Center for Opinion Research) | **NOT added** — search-level evidence only. Its matchup is corroborated independently by captured Kalshi rungs GOVPARTYPA-26-D "Josh Shapiro" / -R "Stacy Garrity" (§9a); the poll itself needs a direct fetch of the F&M release before admission |
| Brennan Center deep paths (`/our-work/voting-rights`, `/our-work/research-reports/state-votes-elections-2026`) | both returned "Content Not Found \| Brennan Center for Justice" | homepage + topic hubs verified instead; entry records the path caveat |
| BPC shallow paths (`/elections/`, `/topic/elections/`) | both returned "Page not found • Bipartisan Policy Center" | the specific explainer/report URL was fetched and used as the entry URL |
| Wisconsin `/elections-voting`, Nevada `/sos-elections`, California `elections.cdn.sos.ca.gov` | access-denied / 404 / S3 AccessDenied | **#40**, **#41**, **#42**; each entry uses the URL that actually fetched |

### 9d · Reversals of §8's deferrals (recorded deliberately, not silently)

§8 declined **270toWin**, **Decision Desk HQ** ("aggregator/forecast-vendor fit still unverified — deferred") and
**AtlasIntel** ("weaker institutional standing"). All three were fetched directly this session and are admitted with the
evidence that settled the question: DDHQ's page states county-level results "dating back to 2000" **and** a
Kalshi/Polymarket price integration (making it a cross-check surface for this project's own captures); 270toWin's
Kalshi-derived panel produced the quantitative comparison in §9a; AtlasIntel's own page states its sampling method,
which is why it is admitted **with** the non-probability caveat (#49) rather than as equivalent to a probability panel.
§8's other deferrals (Pew, SSRS/Edison — already in the list; uspollingdata.com — §5 exclusion; Data for Progress —
advocacy-aligned) are unchanged, and SurveyUSA remains excluded (#47).

### 9e · Verification evidence after the batch

`npm run lint` → `checked 62 data JSON files, **105 sources**, 4 outcomes, 5 markets, **49 irregularities (md rows 49)**,
15 poll entries — lint: all verified-data provenance checks pass`. `npm test` → **70 tests, 69 pass, 1 skipped** (the
network-dependent live-capture test), 0 fail — including the new `test/site-sources.test.mjs` (9 tests), which renders
the Sources section headlessly against the committed bundle and asserts the toolbar, one block per category, one row per
registry entry, per-block counts equal to both the published tally and the rendered chip, bundle ⇄ `master.json` parity,
and that irregularities #40–#49 appear on the site. `npm run pipeline` → backtest, contest, site bundle
(`src/data/site-data.js`, 1,591 KB) and headless render check of all 11 sections regenerated and passing; the Sources
section renders all 105 entries grouped by the nine categories above with a live filter. `python3
scripts/sync_site_data.py` → `synced=12 missing=0` (the toolkit sub-site's copies of IRREGULARITIES.md, LIMITATIONS.md
and NEXT_SESSION.md refreshed; note this step is **not** part of `npm run pipeline` — the daily workflow calls it
separately). `python scripts/validate_sources.py` → `entries: 20, csv_consistent: true, schema_valid: true` (the
Python-track registry is untouched by this batch). Every new entry carries `url` (manual-review link), `verified` (what
was observed), `verifiedOn` (2026-09-19), `status: verified`, `category` and `notes`; no field in this batch was
populated from memory or from an unfetched page.

## 10 · 2026-09-19 session 5 (branch `arena/01a0bb28-elections`) — 20 new master-list entries, every one fetched directly (or reached via search and then fetched)

Request executed this session: "Search for 20 new entries. Before adding to master list, verify no
hallucinations." The session verified **22 candidates** end-to-end, admitted **20**, and **declined 2**
with recorded evidence (irregularity #53) — nothing was added from memory, and every quote below was
copied from a page or PDF actually fetched on 2026-09-19, or from the project's own 2026-09-19 Kalshi
universe capture (`data/kalshi/universe/latest.json`) for market quotes.

### 10a · The batch (id → URL → what was observed)

| # | id | URL fetched | Observed (summary — full text on the master entry) |
|---|---|---|---|
| 1 | `minnesota-sos` | sos.state.mn.us/elections-voting/ → **sos.mn.gov/elections-voting/** | 'Minnesota Secretary Of State - Elections & Voting'; ELECTION RESULTS, sample ballot, 'search candidate filings', absentee tracking, 'Secure and Fair Elections' |
| 2 | `new-jersey-doe` | nj.gov/state/elections/ → **/vote.shtml** | Lt. Gov. Dr. Dale Caldwell; mail-ballot mailing from Sept 19; early voting Oct 24–Nov 1; General Election Nov 3; **Dec 3 canvass certification deadline** |
| 3 | `new-york-sboe` | **elections.ny.gov/** | 'November 3, 2026 General Election', early voting Oct 24–Nov 1, certification pages, '2026 Political Calendar', EFS |
| 4 | `florida-dos-elections` | **dos.fl.gov/elections/** | Emergency Rule 1SER26-3 (candidate qualifying); 'The 2nd Qualifying Period for 2026 has closed for ... Governor ...'; Candidate Tracking System; Election Results Archive |
| 5 | `oregon-sos` | **sos.oregon.gov/elections/pages/current-election.aspx** (found via search after two dead paths) | General election Nov 3, 2026; ballots mailed from Oct 14; postmark rule; '**December 10, 2026 Final election results certified**' |
| 6 | `massachusetts-elections` | **sec.state.ma.us/divisions/elections/elections-and-voting.htm** (division root 403'd) | Galvin; '2026 State Election Candidates / Ballot Questions / Primary Results'; '**We publish election results here after they're certified. We don't publish results on Election Night.**' |
| 7 | `illinois-sbe` | **elections.il.gov/** | 'Next Election: GENERAL ELECTION Tuesday, November 3, 2026'; VBM/early-voting calendar; 2026 disclosure deadlines |
| 8 | `american-presidency-project` | **presidency.ucsb.edu/** | '188,601 Presidential and Non-Presidential Records'; midterm seat-swing statistics; party platforms; Sept 12, 2026 midterms analysis |
| 9 | `uw-madison-erc` | **elections.wisc.edu/** | 'fosters cutting edge academic analysis of national and state elections'; 'Midterm Risks + Responses' 10/9/26; Election Symposium Nov 20, 2026; EM26 redistricting |
| 10 | `umass-amherst-poll` | **umass.edu/poll/** | National poll Aug 21–26, 2026 + Sept 2026 releases; AMES June 2–Aug 24, 2026; Nteta/Rhodes/La Raja/Theodoridis; midterm-enthusiasm finding |
| 11 | `muhlenberg-ciopo` | **muhlenberg.edu/wp-content/uploads/pa-public-health-survey-2026.pdf** | 2026 PA Health Survey, fielded Mar 10–17, 2026 (n=500, ±5.5%, dual-frame RDD, Census-weighted); Borick (Exec. Dir.) & Burt (Managing Dir.) |
| 12 | `fox-news-poll` | **static.foxnews.com/.../fox_june-12-15-2026_complete_national_topline_june-24-release.pdf** | 'under the joint direction of Beacon Research (D) and Shaw & Company Research (R)', n=1,002 RV from a voter file, Braun Research fieldwork, ±3pp; job-approval trend 39/60 |
| 13 | `noble-predictive-insights` | **noblepredictiveinsights.com/** (noblepi.com is an unrelated home-inspection firm → #50) | 'nonpartisan Public Opinion Polling firm ... predictive insights on performance at the ballot box' |
| 14 | `state-navigate` | **cnalysis.com → statenavigate.org/** (rebrand → #52) | 'nonpartisan 501(c)(3) nonprofit'; state-legislative forecasts; Data Downloads + API docs; self-reported stats recorded as claims |
| 15 | `metaculus` | **metaculus.com/midterms-2026/** (hub linked from the fetched question feed, then fetched itself) | 'Updated in real time'; Senate D 51.7% / House D 88.8%; House median D +13; control question 50.7/38.1/10.2/1.0; drivers stamped 'Sep 19, 2026' |
| 16 | `race-to-the-wh` | **racetothewh.com/** | Senate forecast 'simulating the election 50,000 times a day'; 2026 House/Governor forecasts; per-race pages for GA/TX/NC/MI Senate and AZ governor |
| 17 | `wsj` | **wsj.com/politics/elections** | 'Midterm Elections 2026' hub; 'less than 50 days until Election Day'; Senate & House control trackers (Sept 18, 2026) |
| 18 | `axios` | axios.com/politics → **/politics-policy** | '2026 midterm elections' topic page; Sept 19, 2026 items; '128 bills targeting deepfakes ... Axios analysis of NCSL data' |
| 19 | `texas-tribune` | **texastribune.org/** | Sept 17–18, 2026 stories; '2026 Texas Elections' series; 'All recent polls have Talarico ahead of Paxton in the U.S. Senate race' tracker |
| 20 | `c-span` | c-span.org/elections/ (404) → **c-span.org/campaign/** | 'Featured Election Results — Data Provided By' AP; Senate-in-35/governor-in-36 primaries line; 2026 campaign-event video archive |

Every master entry also names the **Kalshi markets it maps to, with quotes from the project's own
2026-09-19 capture** — e.g. SENATEMN-26-D 'Peggy Flanagan' 0.902/0.904, SENATENJ-26-D 'Cory Booker'
0.975/0.981, SENATEIL-26-D 'Juliana Stratton' 0.951/0.989, SENATEMA-26-D 'Ed Markey' 0.975/0.980,
SENATEOR-26-D 'Jeff Merkley' 0.976/0.978, GOVPARTYFL-26-R 'Byron Donalds' 0.790/0.800,
GOVPARTYNY-26-D 'Kathy Hochul' 0.924/0.930, GOVPARTYAZ-26-D 'Katie Hobbs' 0.870/0.880,
GOVPARTYPA-26-D 'Josh Shapiro' 0.968/0.973, SENATETX-26-D 'James Talarico' 0.580/0.590 — so each new
source is tied, the day it was admitted, to the specific live markets it will be scored against.

### 10b · Method notes

- **Two statuses were used**: 18 entries are `verified` (fetched directly); **`oregon-sos` and
  `massachusetts-elections` are `verified-via-search`** — their canonical landing paths failed (OR:
  /voting-elections fetch error and /sos/elections 404; MA: division root 403, irregularity #51), the
  correct pages were discovered through live search, and were then fetched and recorded first-hand.
- **Quote policy unchanged**: `verified` fields quote only text visible in this session's fetches.
  Where a fact was seen only in search snippets or on-page self-descriptions (MCIPO's 538 ranking,
  State Navigate's '96% prediction accuracy'), the entry says so explicitly and the fact is treated as
  a claim, not evidence.
- **Market quotes are not fetched from kalshi.com** — they are read from this project's own captured
  universe file, whose `capturedFrom`/`capturedAt` provenance the lint already enforces.
- Candidate-name checks: every candidate named in a market quote ('Peggy Flanagan', 'Byron Donalds',
  'Juliana Stratton', 'Stacy Garrity', 'David Brock Smith', 'Justin Murphy', 'Don Tracy', 'John
  Deaton', 'Christine Drazan', 'Victor Marx', 'Michele Tafoya', 'Bruce Blakeman', 'Andy Biggs',
  'David Jolly', 'Phil Weiser', 'James Talarico', 'Ken Paxton') is the `yes_sub_title` recorded in
  this repo's own capture — none was typed from memory.

### 10c · Declined candidates and a standing deferral re-tested

- **Princeton Election Consortium** — fetched fully; newest on-site posts are 2024-11-05 and the page
  routes readers to a Substack. Declined under this session's collectability criterion; re-test
  criteria recorded (irregularity #53).
- **Split Ticket** — fetched fully; newest on-site post 2025-10-20; its own 2025-08-19 post says the
  bulk of analysis moves to The Argument. Declined, same criterion (#53).
- **SurveyUSA** — re-attempted per #47's action: surveypoll.com failed again (third failure). The
  deferral stands (#51 records the attempt).
- **HarrisX / CourtListener** — not re-attempted this session (their #47 actions remain valid).

### 10d · Irregularities found during this batch

#50 (noblepi.com domain collision — an inspection company, not the pollster), #51 (MA 403 root,
C-SPAN /elections/ 404, SurveyUSA third failure), #52 (cnalysis.com → statenavigate.org rebrand),
#53 (two verified-reachable candidates declined for absence of current-cycle content). All four are
in `data/irregularities.json` with md rows; #47's detail was extended with this session's re-attempt.

### 10e · Verification evidence after the batch

`npm run lint` → `checked 62 data JSON files, 125 sources, 4 outcomes, 5 markets, 53 irregularities
(md rows 53), 15 poll entries — lint: all verified-data provenance checks pass`. `npm test` → see the
counts printed at the end of this section (all pass, 1 skip: the network-dependent live-capture test),
including the extended `test/site-sources.test.mjs` assertions (≥125 entries; the 20 session-5 ids;
exactly two `verified-via-search` entries; quotes must cite the capture date; irregularities #40–#53
render on the site). `npm run pipeline` regenerated `data/backtest-results.json`,
`data/contest-results.json`, `src/data/site-data.js` and passed the headless render check of all 11
sections; `python scripts/sync_site_data.py` refreshed the toolkit sub-site's copies.

**Cross-layer observation recorded this session** (not an irregularity — an inter-source spread to be
scored after Nov 3): Metaculus's midterms hub and this project's Kalshi capture, both stamped
2026-09-19, **agree on the House** (Metaculus D 88.8% vs Kalshi House D 89–90¢) but **disagree on the
Senate** (Metaculus D 51.7% vs Kalshi Senate D 59–60¢ — an ~8-point gap). The divergence is exactly
the kind of signal this project exists to score: after November 3 the calibration tracker will show
which layer was right. No trade, model, or claim depends on either number today.

## 11 · 2026-09-19 session 6 (branch `arena/01a0bb51-elections`) — re-tests, four-pollster ingestion, collectors, cross-layer scorer, 20 new entries

Everything in this section was fetched during the session through the fetch tool (the sandbox itself has
no network). Where a fetch failed the failure is recorded; nothing was reconstructed from memory.

### 11a · The 20 new master-list entries (id → URL → what was observed) + 2 re-test admissions

| id | URL (manual review) | Observed on 2026-09-19 |
|---|---|---|
| south-carolina-sec | https://scvotes.gov/ | '3,423,166 Current number of registered voters'; releases Sep 15 2026 (NVRD), Sep 1 2026 (SD-15 special primary hand-count audit), Aug 25 2026 ('Hand-Count Audits for 2026 U.S. Senate Special Republican Primary Runoff … all 46 counties') |
| kansas-sos | https://sos.ks.gov/elections/elections.html | Elections Division statement; tiles VoterView, Advance Voting, Candidates, Election Results (election-results.html), Election Security; '800-262-VOTE' |
| montana-sos | https://sosmt.gov/elections/ | 'Election Night Reporting' (mtelectionresults.gov); 'Visit Election Results Website'; registration/absentee counts by county; Ballot Measures |
| nebraska-sos | https://sos.nebraska.gov/elections | 'Primary Election: May 12, 2026 / General Election: November 3, 2026'; 2026_Primary_Canvass_Book.pdf; general candidate filing list 9.11.26; Initiative Measures 440/441/442, LR19CA. `/elections/election-results` → site 404 |
| new-mexico-sos | https://www.sos.nm.gov/voting-and-elections/ | '2026 General Election: Tuesday, November 3, 2026'; NMVOTE portal; results host electionresults.sos.state.nm.us; stale sidebar 'Results will become available after 7 PM on Election Day, November 2, 2021' (#56) |
| wyoming-sos | https://sos.wyo.gov/Elections/Default.aspx | 'Primary Election: August 18, 2026 / General Election: November 3, 2026'; general candidates PDF + CSV; 'Primary Election - Official Results'; ballot propositions |
| colorado-sos | https://www.coloradosos.gov/pubs/elections/main.html | Results & Data page: searchable historical database (historicalelectiondata.coloradosos.gov), results archive, registration statistics, TRACER |
| oklahoma-seb | https://oklahoma.gov/elections.html | 'General Election Tuesday, November 3, 2026 Polls Open 7 a.m. - 7 p.m.'; registration deadline Oct 9 2026; absentee deadline Oct 19 2026; 'Last Modified on Sep 17, 2026'. `/elections/election-results.html` → Apache Sling 404 |
| tennessee-sos | https://sos.tn.gov/elections | '2026 Congressional Redistricting' banner; 'Candidate Lists' (2026-candidate-lists); poll-worker release 'Ahead of November 3 Election' |
| hawaii-oe | https://elections.hawaii.gov/election-results/ | 'Primary Election August 8, 2026 — Certified Reports (PDF)' + 'Certified Text Files' (summary.txt, media.txt); SD-20 (R) and HD-43 (R) recount reports; 2024 General 'Last Updated: November 27, 2024' |
| washington-sos-results | https://results.votewa.gov/results/public/washington | '2026 Primary — August 4, 2026', April 28 and February 10 2026 specials (reached via redirect from results.vote.wa.gov/results/current/; sos.wa.gov data-and-maps path → 404) |
| north-dakota-sos-results | https://results.sos.nd.gov/ | 'Official 2024 General Election Results — Results last updated: 4/21/2026'; turnout 62.61% (371,975 / 594,140); 385/385 precincts; Exports page |
| delaware-doe | https://elections.delaware.gov/ | 'Primary Election Results — Official Results' (results/enr/PR2026.html); early voting 'October 22nd – November 1st'; 'General Election November 3, 2026' |
| rhode-island-boe | https://elections.ri.gov/elections/previous-election-results | 'September 9, 2026 Statewide Primary Results'; Prim26_Summary.pdf, Prim26_PrecinctSummary.pdf; 2024 General summary PDF + XLSX |
| vermont-election-archive | https://electionarchive.vermont.gov/ | 'all from official source documents'; 2024: Sanders 63%, Balint 62%, Harris/Walz 64%; '11,319 Contests', '5,209 Candidates' |
| south-dakota-sos-history | https://sdsos.gov/elections-voting/election-resources/election-history/default.aspx | 2024…2014 election information pages; 'Official Election Returns and Registration Figures'; 1889-1970 summary; ballot questions 1890-2024 |
| data-for-progress (needs-review) | https://www.dataforprogress.org/ | Methodology page: 'primarily using SMS text-to-web and web panels'; voter-file random sampling; weighting to TargetSmart likely-voter composition; 2026 briefs Apr 29 / May 20 / Jun 3 |
| civiqs (needs-review) | https://civiqs.com/ | Tracked RV series ending Sep 17–19 2026 (Trump approval, National Popular Vote, Right Track/Wrong Track, party favorability); /results/house_generic_ballot resolved to the homepage — no generic-ballot page is cited |
| election-betting-odds (verified-claim) | https://electionbettingodds.com/ | 'Last updated: 7:42PM EDT on Sep 19, 2026'; Senate Control 2026 '$14,598,871 bet so far'; DEM rows Kalshi 58.4-59.4%, Polymarket 60.0-61.0%, PredictIt 59.0-60.0%, Betfair 56.6-58.2%, blend 59.1%; 2028 presidency '$751,622,162 bet so far' |
| openelections (verified-claim) | https://openelections.net/ | 'Certified election results. For everyone.'; per-state selector; GitHub-activity widget showed 'Unable to Load GitHub Activity' at fetch time |
| courtlistener (re-test → admitted) | https://www.courtlistener.com/ | 'Non-Profit Free Legal Search Engine and Alert System'; '472 jurisdictions'; '8,300,000 precedential opinions'; '8,097 case-law additions in the last ten days'. api.courtlistener.com not reachable from this fetcher |
| franklin-marshall-poll (deferred → admitted) | https://www.fandmpoll.org/ | August 2026 release: Aug 17–23, n=501 PA RV (213 D / 208 R / 80 I), Aristotle sample, mail-notify + phone/online, ±5.5; Shapiro 50 / Garrity 25; House preference D 48 / R 36. June (n=546: 50/28) and March (n=834: 48/28) releases fetched |

Registry: 125 → **147**. Category tally re-counted by script and asserted by lint. No id or URL duplicates
(lint). Candidates fetched and NOT admitted this session: none beyond the two standing declines in 11b —
every candidate the session reached carried current-cycle content.

### 11b · Re-tests (all fetched 2026-09-19)

| Host | Result | Consequence |
|---|---|---|
| surveypoll.com (SurveyUSA) | fetch FAILED (4th consecutive) | stays excluded (#47) |
| thehillx.com (HarrisX) | fetch FAILED | stays excluded (#47) |
| courtlistener.com | **fetches** | admitted (11a); #47 partially resolved |
| election.princeton.edu | fetches; newest posts still Nov 5 2024 | #53 criteria not met — still declined |
| split-ticket.org | fetches; newest post still Oct 20 2025; Aug 19 2025 partnership note | #53 criteria not met — still declined |
| elections.wi.gov/elections-voting | still 'Access denied' | #40 stands (root fetches) |
| nvsos.gov/sos-elections | still 404 + CAPTCHA; /sos/elections fetches | #41 stands |
| elections.cdn.sos.ca.gov | still S3 AccessDenied | #42 stands |
| sec.state.ma.us/divisions/elections | root still 403; elections-and-voting.htm fetches ('2026 State Election Candidates', 'We publish election results here after they're certified. We don't publish results on Election Night.') | #51 stands |

### 11c · Collector design and the endpoint evidence

- **Metaculus** — `https://www.metaculus.com/api2/questions/?limit=2&order_by=-activity` → 'Permission Error: The
  API is only available to authenticated users.' The hub `https://www.metaculus.com/midterms-2026/` is server-rendered:
  House D 88.8 / R 11.2; Senate D 51.7 / R 48.3; Congressional Control (question 34484) DH/DS 50.7, DH/RS 38.1,
  RH/RS 10.2, RH/DS 1.0; 'House median D+13'; 'Senate median even'; '18 of 35 races lean Democrat · 3 too close to
  call'; Key Drivers 'Data from Sep 19, 2026'. `scripts/collect-metaculus.mjs` parses the hub (parser reproduces every
  number above from a transcribed fixture in `test/fixtures/`), checks D+R and quadrant sums and the identity
  senateD = DH/DS + RH/DS (50.7 + 1.0 = 51.7 ✓), and only touches api2 when `METACULUS_API_TOKEN` is set (#54).
- **State Navigate** — `https://data.statenavigate.com/` and `/index.html` → HTTP 500; `/api/`, `/docs/` → 404;
  `projects.statenavigate.com/downloads/data.html` → login, 'Required Tier: Tier 3'. Free pages parsed instead:
  national ('2,306 seats forecasted, 124 D pickups, 11 R pickups, 14 states with current 2026 model, 27 chambers,
  143 close seats within 5 pts, 135 projected flips'; launched states AK WI MN MI NY IA PA NJ UT CO WV VA NC SC GA TX
  FL) and per-chamber pages (VA lower: 'Democrats favored to win 60 seats (+9)', 'Republicans 40 (−9)', D super 12%,
  D majority 82%, tie <1%, R majority 3–4%; title '2025 Virginia State Legislative Forecast'). The collector probes the
  API host every run and stores the answer (#55).
- **R13 renderings** — 270toWin homepage: Kalshi panel '57% / 41% … as of Sep. 19, 2026 at 20:29 UTC … May not
  total 100%' (2028 presidency), KPOW '+1.90 D as of 9/17/26'. DDHQ Votes: House D 70%, Senate D 52%, House & Senate
  D 49 / R 27. EBO: see 11a. `scripts/crosscheck-renderings.mjs` compares EBO's Kalshi row with the captured
  CONTROLS-2026-D midpoint (0.589 vs 0.595 → within the 3-point tolerance) and stores DDHQ/270toWin as context.

### 11d · Poll-layer ingestion (numbers transcribed into `data/polls/poll-layer-2026.json`, #49 labels)

| row id | primary source fetched | numbers | methodFamily |
|---|---|---|---|
| umass-2026-08-house-generic | umass.edu/poll/about/reports/2026-09-national-public-opinion-poll-0 (+ news release + toplines PDF) | Aug 21–26, n=1,000, ±3.5; House generic D 42 / R 34 / Ind 10 / DK 14; Senate generic (36 states) D 40 / R 38 / Ind 10 / DK 12; enthusiasm D 67 / R 59; Congress approval 22/68 | online-nonprobability-matched (YouGov, ACS frame) |
| fox-2026-09-generic | static.foxnews.com/…/fox_september-11-14-2026_national_topline_september-16-release-1.pdf | Sep 11–14, 1,211 RV, ±3; Q14 D 51 / R 44 / DK 4; Trump 39/61; trend Jul 53/46, Apr 52/47, Jan 52/46 | voter-file-hybrid (96 landline + 821 cell + 294 text-to-web) |
| npi-2026-08-az-governor | noblepredictiveinsights.com/post/katie-hobbs-leads-andy-biggs-in-the-grand-canyon-state (+ down-ballot post) | Aug 10–13; 1,040 RV (±3.04) / 923 LV (±3.23); LV Hobbs 48 / Biggs 35 / other 4 / undecided 12; RV trend Hobbs 41→46, Biggs 37→32 | online-optin-weighted |
| fm-2026-08-pa-governor | fandmpoll.org/franklin-marshall-college-poll-release-august-2026/ | Aug 17–23, n=501 RV, ±5.5; Shapiro 50 / Garrity 25 (June 50/28, March 48/28) | voter-file-mail-recruit |
| fm-2026-08-pa-house-preference | same release | PA U.S. House preference D 48 / R 36 | voter-file-mail-recruit |
| muhlenberg-ciopo | poll library fetched | **no 2026 horse-race release exists on the site** → `pendingSources`, no row | — |

Side-by-side after `npm run pipeline`: AZ governor poll-implied D 0.947 vs Kalshi GOVPARTYAZ-26-D 0.875 (gap −7.2 pts,
review); PA governor poll-implied 0.996 vs GOVPARTYPA-26-D 0.9705 (−2.6 pts). Both rows are labelled with the
logistic mapping caveat (#12); the k=4.5 mapping saturates on a 25-point lead and is not a probability claim.

### 11e · Verification evidence after the batch

`npm run lint` → `checked 64 data JSON files, 147 sources, 4 outcomes, 5 markets, 57 irregularities (md rows 57),
20 poll entries — lint: all verified-data provenance checks pass`. `npm test` → **82 tests, 81 pass, 1 skipped**
(network live-capture test), including the new `test/crosslayer.test.mjs` (8 tests: scorer, both collector parsers,
R13 parsers, seed-snapshot consistency with the captured universe) and three new assertions in
`test/site-sources.test.mjs` (session-6 ids/statuses, #49 labels on the five rows, the Cross-layer section rendering
its 7.8-point Senate spread). `npm run pipeline` regenerated the bundle and the headless render check passed all
12 sections (Cross-layer added). New irregularities: #54–#57 (+ #58 from the first live collector run on 2026-09-20, see IRREGULARITIES.md).

## 12 · 2026-09-20 session 7 (branch `arena/01a0bca8-elections`) — 22 new entries, re-tests, live-run repairs, first live Metaculus seat rows

Everything below was fetched during the session through the fetch tool (the sandbox itself has no network) or
observed in files committed by the GitHub Actions runs named. Where a fetch failed the failure is recorded;
nothing was reconstructed from memory. Runs cited: collector-probe 35485210251 (push trigger), daily-collection
35484999487; the runs' logs and artifacts are **not** downloadable from the sandbox — only their committed outputs were read.

### 12a · The 22 new master-list entries (id → URL → what was observed), all `verified`, all fetched directly

| `alabama-sos` | https://www.sos.alabama.gov/alabama-votes | Observed: 'Secretary of State Wes Allen'; '3,837,234 Registered Voters'; 'View the 2026 General Election Sample Ballots' (/alabama-votes/2026-general-election-sample-ballots); hub tiles Voter Registration, Election Information… |
| `arkansas-sos` | https://www.sos.arkansas.gov/elections | Observed sections: For Voters (Register to Vote; VoterView at voterview.ar-nova.org; Absentee Voting; Ballot Issues; Candidate Search at candidates.arkansas.gov); Election Results — 'Current or Most Recent Election Results' and 'Historical Election Results'… |
| `connecticut-elections-database` | https://electionhistory.ct.gov/ | Observed: 'A searchable database of historical election information, all from official source documents'; year range '1787' to '2026'; Data Inventory '35,795 Contests', '1,485 Ballot Questions', '56,426 Candidates'; Latest Results — 'Feb 3, 2026 - Special… |
| `idaho-sos-voteidaho` | https://voteidaho.gov/election-results/ | Observed: '2026 Election Results — May 19 Primary Election ... Official Results' with a 'Statewide Results Page' at results.voteidaho.gov/results/public/id/elections/may2026 and per-county pages for all 44 counties; 'Audit & Canvass Reports' — 'Election Audit… |
| `indiana-election-division` | https://www.in.gov/sos/elections/ | Observed: 'THE NEXT PRIMARY WILL BE ON TUESDAY, MAY 5, 2026'; 'THE NEXT INDIANA GENERAL ELECTION DAY WILL BE ON TUESDAY, NOVEMBER 3, 2026'; 'Primary Election Results' linking enr.indianavoters.in.gov/site/index.html; '2026 General Election Candidate List'… |
| `kentucky-sbe-results` | https://elect.ky.gov/results/Pages/default.aspx | Observed verbatim: 'The State Board of Elections and county clerks maintain archives of Kentucky election results for research and public inspection. Choose from the menu to view the results available online from 1973 to present. View 1955-1972'… |
| `louisiana-sos` | https://www.sos.la.gov/ | Observed on the live root: 'Upcoming Election — November 3, 2026 — U.S. Senate General / Open U.S. Representative Primary / Open Primary Election'; Elections links 'Election results & statistics' (/elections-voting/election-results-statistics), 'Election… |
| `maryland-sbe-2026` | https://elections.maryland.gov/elections/2026/index.html | Observed: Timeline 'General Election Day November 03, 2026', 'Early Voting October 22, 2026 - October 29, 2026'; Results — 'Official Primary Results' (/elections/2026/primary_results/index.html) and 'Data files' (/elections/2026/election_data/index.html);… |
| `mississippi-sos` | https://www.sos.ms.gov/elections-voting | Observed: tiles My Election Day, Update Voter Registration, Campaign Finance, 'Sample Ballot' (content/documents/Elections/2026/Sample Ballot 9-9-26.pdf), 'Elections Calendar' (2026 Election Calendar.pdf), 'Election Results'… |
| `missouri-sos-elections` | https://www.sos.mo.gov/elections | Observed verbatim: 'The Elections Division of the Office of the Secretary of State is responsible for administering all statewide elections, initiative petitions ...'; 'Missouri's elections are decentralized, and the state is composed of 116 local election… |
| `new-hampshire-sos` | https://www.sos.nh.gov/elections | Observed: '2026 Election Details' (/2026-election-details), '2026 Election Results' (/2026-state-primary-election-results), '2024 Election Results', '2025-2026 Special Elections', 'Party Registration History 1970-2026', 'Election Audits & Reports', 'Election… |
| `utah-lt-governor-vote` | https://vote.utah.gov/ | Observed: '2026 Primary Election Results' linking electionresults.utah.gov/results/public/Utah/elections/Primary06232026; links 'Election Results, Historical Information & Data', 'Interactive Data Hub', 'Track my mail or provisional ballot', '2026 Election… |
| `west-virginia-sos` | https://sos.wv.gov/elections | Observed: '2026 General Election' — '2026 General Candidate Listing' (candidates.wvsos.gov) and '2026 Primary Election Results' linking results.enr.clarityelections.com/WV/126209; 'Online Voter Registration' (ovr.sos.wv.gov); 'GoVoteWV'; 'Campaign Finance… |
| `surveyusa` | https://results.surveyusa.com/PollHistory.aspx | Observed in the September 2026 list: '09/16/26 Poll #28000 — All SurveyUSA clients in Minnesota — Minnesota' with questions 'If the November election for Minnesota Governor were today ... who would you vote for? (candidate names rotated)' and 'If the November… |
| `harrisx` | https://www.harrisx.com/ | Observed: post 'August Harvard CAPS / HarrisX Poll' dated September 2, 2026 (/posts/august-harvard-caps-harrisx-poll) headlined 'August Harvard CAPS / Harris Poll: Trump Approval Sees Slight Improvement at 44%' with 'MIDTERMS HORSERACE REMAINS TIGHT AT 51-49… |
| `elon-poll` | https://www.elon.edu/u/elon-poll/ | Fetched directly 2026-09-20 (title 'Elon University Poll \| Elon University') plus the September 10, 2026 news-release PDF. Index observed: 'September 10, 2026: North Carolina Poll on U.S. Senate race ...', 'September 17, 2026: ... NC Constitutional amendments… |
| `hpu-survey-research-center` | https://www.highpoint.edu/src/ | Observed: 'The SRC's HPU Poll surveys people in North Carolina and beyond ... reports the results as a public service'; 'The HPU Poll reports methodological details in accordance with the standards set out by AAPOR's Transparency Initiative, and the HPU… |
| `umass-lowell-cpo` | https://www.uml.edu/research/public-opinion/ | Observed: 'The center is a member of the American Association of Public Opinion Research (AAPOR) Transparency Initiative'; 'Maine Poll: Platner Holds Slight Lead over Collins in U.S. Senate Race' (06/04/2026): 'The survey of 650 likely Maine voters shows… |
| `roanoke-college-ipor` | https://www.roanoke.edu/ipor | Observed verbatim: 'From 1983 to 2026, the Institute for Policy and Opinion Research (IPOR) conducted regular surveys in the Commonwealth of Virginia ... Explore our archive of past polls below.'; recent items 'Virginia Consumer Sentiment Report for Aug.… |
| `uh-hobby-school-elections` | https://www.uh.edu/hobby/research/elections/index.php | Observed report tiles: 'Texas Primaries 2026' (primary2026, senate report cover), 'Republican Primaries 2026', 'Democratic Primaries 2026', Harris County primaries 2026 (countyprimary), 'Texas Congressional District 18 Special Election 2025', 'Texas Trends… |
| `fhsu-docking-kansas-speaks` | https://www.fhsu.edu/docking/kansas-speaks/ | Observed: 'Kansas Speaks is a statewide public opinion survey measuring Kansans' opinions on public issues and their evaluations of elected officials'; report PDFs from 'Kansas Speaks Fall 2025' (2025-kansas-speaks-report_final-10-27-20251.pdf) back to… |
| `winthrop-poll` | https://www.winthrop.edu/winthroppoll/ | Observed verbatim: 'The Winthrop Poll is a long-term survey initiative ... citizens in South Carolina, the South as a region, and the nation as a whole'; 'The first statewide poll took place in fall 2006'; 'frequent Winthrop Polls focusing on the South as a… |

Brand/host traps checked before admission: SurveyUSA was admitted on the archive host it actually serves
(results.surveyusa.com), not surveypoll.com (dead since #47); HarrisX on harrisx.com (thehillx.com still fails);
Louisiana's legacy paths return the site's own 404 (recorded on the entry); Noble Predictive's #50 domain lesson applied
to every pollster (each URL fetched and its title recorded).

### 12b · Re-tests (fetched 2026-09-20; recorded as dated addenda on the existing entries, never by overwriting `verifiedOn`)

| Host | Result | Consequence |
|---|---|---|
| results.surveyusa.com (SurveyUSA) | **fetches** — archive index lists '09/16/26 Poll #28000 Minnesota'; the report page (PollReport.aspx?g=…) is client-rendered (empty body to the fetcher) | admitted (`surveyusa`); #47 resolved for the host, MN toplines pending a rendered read (pendingSources `surveyusa-28000-mn`; probe target `surveyusa-poll-28000`) |
| www.harrisx.com | **fetches** — 'August Harvard CAPS / HarrisX Poll' (Sept 2, 2026) states the survey was conducted 'by The Harris Poll and HarrisX' | admitted (`harrisx`); #43's Harris Poll/HarrisX distinction now reads 'co-authors of the Harvard CAPS series' |
| courtlistener.com/api/rest/v4/ | HTTP 200 (DRF API root listing) | #47 fully resolved for the host |
| election.princeton.edu | **fetches** — newest posts still 'Geek's Guide to the Election 2024' / 'A final snapshot and House prediction' / 'Herding, or judgment?' (all November 5, 2024, Sam Wang) | #53 criteria not met — still declined; probe target `pec` keeps watching |
| split-ticket.org | **fetches** — newest post still 'The Pendulum Effect' (October 20, 2025); 'What's Next: Split Ticket Partners With The Argument' (August 19, 2025) says the bulk of analysis now publishes at The Argument | #53 criteria not met — still declined; probe target `split-ticket` keeps watching |
| elections.wi.gov/elections/election-results | **fetches** — Aug 11 2026 partisan primary certified Aug 25; WEC states it runs no statewide election-night reporting (media/AP collect from 72 county clerks) | #40 partially resolved (deep path reachable); canvass source for Nov 3 is the certified-results page |
| nvsos.gov | /sos/elections and /elections/election-information fetch; the guessed results path is the office's own 404 behind a CAPTCHA | #41 stands as 'path unknown', not 'host blocked' |
| electionresults.sos.ca.gov | **fetches** — CD-14 special: Wahab (DEM) 51,734 = 53.1% vs Hernandez (DEM) 45,700 = 46.9%, 323/323 precincts as of 2026-09-16, certification due 2026-09-25 | #42's CDN block is irrelevant for results; this host is the Nov 3 canvass source (probe target `ca-electionresults`) |
| electionstats.state.ma.us | **fetches** (PD43+, 1970–2026) | #51 stands for the division root only |
| sos.nh.gov/elections | **fetches** (title 'Elections \| New Hampshire Secretary of State') | #35 resolved for NH — admitted (`new-hampshire-sos`) |
| results.enr.clarityelections.com/WV/126209 | West Virginia publishes primary results only through the Clarity ENR vendor host that blocked the Georgia fetch (#35) | probe target `wv-clarity` added; no numbers transcribed |
| www.270towin.com | Kalshi panel = 2028 presidency: D 57 / R 41 vs captured KXPRESPARTY-2028 last prices (diff −0.01) | R13 evidence (rendering-crosscheck row); raw HTML lacks the numbers → render fallback added |
| www.metaculus.com | plain fetch 403 on the runner (both profiles); headless Chrome rendered q36370, q44711, q44710 | first live seat rows (12c); persistent-profile + retry + second pass shipped |

### 12c · Live-run evidence (files committed by the runner, read line by line)

- `data/crosslayer/metaculus-daily.json` row 2026-09-20T02:54:50Z: q36370 Senate plurality D 50.6 / R 49.3 / other 0.1
  (459 forecasters); q44711 Montana D 1 / R 94 (55 forecasters); q44710 Nebraska D 0.1 / R 73.5 (49). Hub, q40598,
  q43448, q41678: HTTP 403 `cloudflare-challenge`, render still an interstitial → `parse:'failed'` rows with the error (#62).
- `data/crosslayer/snapshots.json`: `2026-09-20-senate-mt-2026` (Metaculus D 0.01 vs Kalshi SENATEMT-26-D bid 0.002 /
  ask 0.013 / last 0.015) and `2026-09-20-senate-ne-2026` (D 0.001 vs SENATENE-26-D 0 / 0.001 / 0.001) — both
  `status: pending` until an official canvass lands in `outcomes.json` (P0 after Nov 3).
- `data/kalshi/tracker/rendering-crosscheck.json` 2026-09-20T02:57:43Z: EBO Kalshi Senate-D 0.584–0.594 vs captured mid
  0.595 (diff −0.006, not flagged); DDHQ House D 70 / Senate D 52; 270toWin `extract:'failed'` (#62).
- `data/statenavigate/forecast-daily.json`: 35 pages `fetch:project` + `parse:'failed'` — the shell's navigation contains
  'close seats', so the keyword trigger for rendering never fired (#62; fixed: the parser is now the trigger).
- `data/probes/latest.json`: **absent** — the probe crashed on ENOENT before writing (#61; fixed and verified locally).
- **Third run** (daily-collection 35484999487, committed 22a2766 at 03:18Z): the hub rendered (4,674,647-byte DOM) but was
  misread — houseD 88.8 / senateD 88.8 with quadrants 50.7 / 38.1 / 10.2 / 1.0 and the collector's own flag
  'senateD 88.8 vs quadrant-derived 51.7'; the wrong Senate value was still written to `snapshots.json`. The same
  commit, made with `rebase -X theirs` over the 02:58 collector-probe commit, dropped the Montana/Nebraska rows (#63).
  Repaired in this PR: parser rebuilt (nearest chamber word + quadrant cross-check that blocks scoreboard writes),
  wrong row deleted, seat rows restored verbatim from commit 3976353, workflows serialised. The governor question
  (q43448) did parse: HI 98 / NM 92.2 / OR 88 / MI 85 (76 forecasters) → four governor seat rows paired with
  GOVPARTY{ST}-26-D (0.968/0.98, 0.91/0.941, 0.84/0.85, 0.906/0.924).
- Kalshi universe 2026-09-20T00:53Z: SENATELA-26 is titled 'Kentucky Senate winner?' (Barr 0.940/0.952, Booker
  0.050/0.061) — #59; the Maine event prices Troy Jackson 0.67/0.68 vs Collins 0.33/0.34 — #60.

### 12d · Poll-layer ingestion (numbers transcribed into `data/polls/poll-layer-2026.json`, #49 labels)

| Row id | Source (fetched 2026-09-20) | Transcribed | Label |
|---|---|---|---|
| `elon-2026-09-nc-senate` | Elon University Poll release PDF, Sept 10 2026 | Cooper (D) 49 / Whatley (R) 38 among 800 likely voters (from 1,121 adults), Aug 21–31, MoE ±5.6 | `online-nonprobability-matched` |
| `hpu-2026-04-nc-senate` | HPU Poll 120 release page (highpoint.edu/blog/2026/04/…), April 16 2026 | Cooper (D) 50 / Whatley (R) 42 among 703 likely voters (914 responses matched to 800 RV), fielded by YouGov Mar 26–Apr 6; the release says a classic MoE is 'not appropriate' and gives a credibility interval of ±4.3 (LV) — stored as `moe` with that label in `methodNote` | `online-nonprobability-matched` |
| `harrisx-2026-08-generic` | harrisx.com post 'August Harvard CAPS / HarrisX Poll' | n=2,100 RV, Aug 28–30; two-way generic D 51 / R 49; LV R+2; Trump approve 44; **no MoE published → `moe: null`** | `online-optin-weighted` |
| pending `umass-lowell-2026-05-me-senate` | UMass Lowell CPO release | Platner (D) 48 / Collins (R) 43 — Platner is not the nominee Kalshi prices (Troy Jackson) | not ingested (#60) |
| pending `surveyusa-28000-mn` | results.surveyusa.com archive | report page client-rendered — no numbers read | not ingested (#47) |

### 12e · Verification evidence after the batch

`npm run lint` → `checked 73 data JSON files, 169 sources, 4 outcomes, 5 markets, 63 irregularities (md rows 63),
23 poll entries — lint: all verified-data provenance checks pass`. `npm test` → **88 tests, 87 pass, 1 skipped**
(network live-capture test): `test/crosslayer.test.mjs` grew to 12 (Kentucky→SENATELA-26 pairing, title-check
`kalshiSkipped`, the #63 hub-parser case: nav 'Senate' before the House card, and the inconsistent-chamber block), `test/site-sources.test.mjs` gained the session-7 registry assertions (22 ids dated 2026-09-20 and
fetched directly, SurveyUSA/HarrisX admitted on their live hosts, re-test addenda without overwriting `verifiedOn`,
≥169 entries) and the poll-row assertions (Elon NC 49/38 and HPU NC 50/42 → SENATENC-26-D, HarrisX `moe: null`, UMass Lowell ME and
SurveyUSA MN only in `pendingSources`); `test/outcomes.test.mjs` accepts 2026-09-20 as a documented session date.
`npm run pipeline` regenerated the bundle (Cross-layer section now lists the per-question Metaculus rows with how each
was read, the State Navigate card says plainly that the latest automated row did not parse, and the Sources section ends
with the R15 host re-test table — 'no run yet' until the first committed `latest.json`); the headless render check passed
all 12 sections. `python scripts/sync_site_data.py` → synced=12 missing=0. Code changes verified offline: `renderDom`
retry/profile logic against a stand-in Chrome that always returns an interstitial (3 attempts, budgets 20/35/50 s) and
against one that returns a page (1 attempt); `probe-hosts.mjs` end-to-end over all 30 targets with the stand-in binary
(no crash; local outputs deleted, never committed). New irregularities: #59–#63.

## 13 · Session 8 (2026-09-20, branch `arena/01a0bfa5-elections`)

Baseline at session start: `npm test` = 88 tests (87 pass, 1 skip), `npm run lint` green, master.json 169
entries, poll layer 15 stateRaces / 4 generic / 1 aggregator / 3 pending.

### 13a · Poll-layer ingestion (P0 after Nov 3 — first rows from the four new pollsters, #49 labels)

Eight rows were ingested into `data/polls/poll-layer-2026.json` (stateRaces 15 → 23). Every number was
transcribed from a release fetched in-session on 2026-09-20; every row carries `methodFamily` (or an explicit
`null` with the reason) and its Kalshi mapping was checked against the 2026-09-20T05:05Z universe capture
(4,085 events).

| Row id | Source (fetched 2026-09-20) | Transcribed | Market mapping | Label |
|---|---|---|---|---|
| `hpu-2026-08-nc-senate` | HPU Poll 126 release (highpoint.edu, Aug 21 2026), fielded by YouGov Aug 3–12 | Cooper (D) 50 / Whatley (R) 45 among 660 likely voters (819 NC RVs matched to 800); credibility interval ±5.2 (DE 1.86), not a sampling MoE | SENATENC-26 / SENATENC-26-D | `online-nonprobability-matched` |
| `hpu-2026-08-nc-house-generic` | same release | NC U.S. House generic (LV) D 47 / R 47 | event KXHOUSEWINSTATE-NCD; **`kalshiDemTicker: null` by design** — no D/R delegation-control event exists; the seat-count event is not a race question (`marketBasis` says so) | `online-nonprobability-matched` |
| `uh-hobby-2026-01-tx-governor` | UH Hobby 'Texas Primaries 2026' (uh.edu/hobby/primary2026), online Jan 20–31 2026 (EN+ES), YouGov-matched | Abbott (R) 49 / Hinojosa (D) 42, n = 1,502 Nov-general LV, ±2.53% | GOVPARTYTX-26 / GOVPARTYTX-26-D | `online-nonprobability-matched` |
| `uh-hobby-2026-01-tx-senate` | same report | SIX candidate-matched general scenarios (Paxton/Cornyn/Hunt × Crockett/Talarico + Libertarian Brown): **median D 43 / R 45.5** (ranges D 42–44 / R 44–46); not a party question — the reduction to a median is stated in `methodNote` | SENATETX-26 / SENATETX-26-D | `online-nonprobability-matched` |
| `saint-anselm-2026-06-nh-senate` | Saint Anselm College SASC June 24–25, 2026 poll PDF | Pappas (D) 47 / Sununu (R) 41 (hypothetical general; 12 other/undecided); alternate scenario Pappas 48 / Brown 36; n = 1,614 RVs, MoE ±2.4, weighted age/gender/geography/education (not party); primary context: D Pappas 62 / Manzur 20, R Sununu 59 / Brown 21 | SENATENH-26 / SENATENH-26-D; `marketGap`: market ≈0.83 vs poll D +6 — recorded as a published gap, not a correction | **new family** `random-cellphone-rv-panel` (random cells from the RV frame, live interviews) |
| `stetson-2026-04-fl-governor` | Stetson Today (www2.stetson.edu) April 24, 2026 — CPOR Spring 2026 Survey | Donalds (R) 47 / Jolly (D) 40 (~7% undecided); alternate Donalds 46 / Demings 42; 848 likely FL voters, Mar 25–Apr 13 2026, ±4.1; Qualtrics online non-probability panel, modeled-turnout LV screen, weighted race/ethnicity/education/gender/region (methodology paragraph transcribed verbatim into `methodNote`) | GOVPARTYFL-26 / GOVPARTYFL-26-D | `online-nonprobability-matched` |
| `stetson-2026-04-fl-senate` | same release | Moody (R) 49 / Vindman (D) 42; alternate Moody 51 / Nixon 38 | **SENATEFLS-26** / SENATEFLS-26-D — the 2026 FL Senate seat is the short-term seat (verified in the universe; SENATEFL-28 is the 2028 class) | `online-nonprobability-matched` |
| `ppp-2026-07-nc-senate` | Public Policy Polling release (publicpolicypolling.com, July 13, 2026) | Cooper (D) 48 / Whatley (R) 44; n = 759 NC voters, July 10–11, ±3.6; same release: NC Supreme Court Earls 44 / Stevens 42, legislative generic D 46 / R 44 (context only) | SENATENC-26 / SENATENC-26-D | **`methodFamily: null`** — the mode/weighting paragraph lives in the linked full-methodology PDF and was not transcribed verbatim; #49 discipline says null, not a guess |

Also recorded: CIRCLE's 2026 Youth Poll (ages 18–29, n = 5,549, fielded Jan 26–Feb 12 2026; 57% partisan /
43% no affiliation; 62% wrong direction; 89% willing to vote) as a second `aggregatorReadings` entry with
`D: null / R: null` — a subpopulation, deliberately not comparable to Kalshi likely-voter prices; and CIRCLE
YESI 2026's top-10 battleground lists (senate/governor/house, page updated 2026-07-24) as a new
`independentPriors` entry.

Deliberately NOT ingested (evidence-only, in `pendingSources`, 3 → 6):

- `fhsu-2025-fall-kansas-speaks` — the Fall 2025 Kansas Speaks PDF (QualtricsXM, Sep 26–Oct 14 2025, n = 526 →
  488 weighted) is a **policy** survey: the only gubernatorial items are candidate recognition and general
  evaluation (Figures 14–15); no head-to-head, no generic ballot.
- `winthrop-2026-07-national` — the first national Winthrop poll (YouGov, June 18–23 2026, n = 2,150, ±2.11):
  **all 26 tables are issues-only** (verified by full table read + full methodology — 832 of 11 southern states
  + 1,552 rest matched down to 750/1,400, DE ±1.208, 'too small to report any single state'). No 2026 horse
  race, generic ballot or party-ID question anywhere. The Oct 2025 SC gubernatorial R-primary field poll
  (Mace 17.1 / Evette 16.3 / Norman 8.0 / Wilson 7.8 / Kimbrell 3.4 / Undecided 46.7, GOP registered, ±3.94,
  with the report's own note that Mace–Evette are tied at this MoE) predates the primary — historical context,
  not a row.
- `roanoke-2026-02` — newest Roanoke (ipor) release is Feb 2026, issues-only (guns / redistricting).

### 13b · 20 new master-list entries (verified line by line, 169 → 189)

All 20 were verified in-session on 2026-09-20 before admission (the standing rule: no hallucinations). 18
were fetched directly; 2 were located via live search of their official domains where the direct fetch 404/500'd
at verification time, and both entries say so verbatim plus require a direct-200 re-fetch before machine use:

| # | id | Category | Evidence (2026-09-20) |
|---|---|---|---|
| 1 | `dcboe` | Gov — state & local | **Fetched** dcboe.org: DCBOE homepage — ranked-choice banner, Sept 11 ballot-order lottery, Sept 14 pre-election equipment testing, Nov 3, 2026 UOCAVA reminder, June 16, 2026 special-election manual-audit results PDF |
| 2 | `maricopa-county-az` | Gov — state & local | **Fetched** elections.maricopa.gov: 'Maricopa County Elections'; 2,538,491 active registered voters (Jan 2, 2026); 1,966,254 active early-voting list; '3rd largest voting jurisdiction' (transcribed as displayed) |
| 3 | `king-county-wa` | Gov — state & local | **Fetched** kingcounty.gov/en/dept/elections/: 'King County Elections'; Nov 3, 2026 general (measures + candidates, eid=55); 10-year results archive; data & statistics |
| 4 | `harris-county-tx` | Gov — state & local | **Fetched** harrisvotes.com: Nov 3, 2026 general + special; early voting Oct 19–30; mail-ballot deadline Oct 23; Election Results (live/archives/rosters/reports); ENG-SPA sample ballot. Located via the county's own menu (the /departments/clerk/elections path is a 404 — recorded) |
| 5 | `wayne-county-mi` | Gov — state & local | **Fetched** waynecountymi.gov Clerk page: Elections section (voter info, candidate info, campaign finance, results archive 2011–2024, Board of Canvassers, Election Commission). waynecounty.com now redirects to waynecountymi.gov (observed) |
| 6 | `clark-county-nv` | Gov — state & local | **Fetched** clarkcountynv.gov elections page: full services menu, historical documentation 1910–1996, reports/data/maps |
| 7 | `cook-county-il` | Gov — state & local | **Live search 2026-09-20** (direct fetches 500'd): official-domain pages show results326.cookcountyclerkil.gov 'March 17, 2026 Gubernatorial Primary — 100.00% / 1430 of 1430 Precincts' (394,256 ballots, 1,727,843 registered) and the Nov 26, 2024 certification release. Direct-200 re-fetch required before machine ingestion |
| 8 | `ippsr-msu` | Academic | **Fetched** ippsr.msu.edu: 'Institute for Public Policy and Social Research' (Michigan State) — Sept 1, 2026 'MSU Poll Shows Democrats Lead, Republicans Coalesce Behind Rogers' (State of the State Survey / OSR); April 20, 2026 'MSU Governors Poll Shows Slight Benson Lead' |
| 9 | `stetson-cpor` | Pollsters | **Fetched** Stetson Today release (see 13a) — both FL rows ingested |
| 10 | `rasmussen-reports` | Pollsters | **Fetched** rasmussenreports.com: 'Public opinion polling since 2003'; daily presidential tracking (Sep 18); generic congressional ballot (Sep 14, 'five-point lead'); 'Election 2026: Georgia Governor'. Paywall banner for full access ($4.95/mo Platinum) — recorded |
| 11 | `public-policy-polling` | Pollsters | **Fetched** publicpolicypolling.com: 'Latest Poll: Cooper leads, but Whatley has a path' (July 13, 2026) — row ingested (13a) |
| 12 | `echelon-insights` | Pollsters | **Fetched** echeloninsights.com: 'strategic research firm … 2026 Political Tribes … cluster analysis of verified voters'; client logos incl. NRSC. No 2026 horse-race release on the homepage yet — admitted for the polling program |
| 13 | `unf-porl` | Pollsters | **Live search 2026-09-20** on unf.edu (contact page + newsroom): Public Opinion Research Lab, porl@unf.edu, 'one of only two dedicated live caller academic survey centers in Florida', 538 #12 pollster (2024). Live 2026 FL polls confirmed by dated press (Jul 2026: Donalds 46 / Jolly 41, 848 voters). Lab home page direct-200 re-fetch required |
| 14 | `usatoday` | News | **Fetched** usatoday.com: live front page Sept 20, 2026 |
| 15 | `latimes` | News | **Fetched** latimes.com: live front page — 'The Race for Mayor' (Bass / Raman), CA midterms coverage; 'For Subscribers' articles labelled |
| 16 | `theguardian-us` | News | **Fetched** theguardian.com/us-news: live section — Fetterman PA profile, midterms anger piece, primary-season takeaways, Newsom election-security bills (Sept 19) |
| 17 | `ajc` | News | **Fetched** ajc.com: live front page Sept 20, 2026 (Atlanta/Georgia) |
| 18 | `desmoinesregister` | News | **Fetched** desmoinesregister.com: live front page — Iowa politics incl. Sept 20 elections-path article; official domain per the Wikipedia entry (Aug 30, 2026) |
| 19 | `manifold-markets` | Prediction markets | **Fetched** manifold.markets: '2026 Midterms' tag, '2026 US Congressional Elections' forum, active 2028 presidential market. Honest limits stated in the entry: user-created, community-scored, not a regulated exchange — never merged into the Kalshi backtest |
| 20 | `clarity-enr` | Official publishers & archives | **Fetched** results.enr.clarityelections.com/GA/ → '403 Forbidden (nginx)' to the plain fetcher; probe runner (run 35490431271, 05:38Z) records ga-clarity and wv-clarity 'reachable'. Parse path documented at github.com/openelections/clarify (detailxml.zip). Vendor: SOE Software |

The DC gap is closed: with `dcboe`, every state-level board among the 51 jurisdictions is in the master list.
Re-test addenda (original `verifiedOn` untouched) were appended to `harrisx` (probe verdict 'reachable') and
`surveyusa` (archive fetches; report pages still client-rendered — #28000 MN still pending).

### 13c · Re-tests (SurveyUSA / HarrisX / CourtListener, declined candidates #53, blocked official paths)

All re-tests ran 2026-09-20. Blocked-path verdicts are from the daily probe runner (run 35490431271,
05:38Z, browser profile + headless Chrome — the sanctioned re-test path for the hosts that block plain fetchers);
in-session `fetch_page` readings are recorded where they differ:

| Target | Session 7 state | 2026-09-20 re-test | Verdict |
|---|---|---|---|
| SurveyUSA #28000 (MN horse-races) | report page client-rendered | PollHistory.aspx fetches: full 09/16/26 question list (governor, US Senate, AG, SOS, Auditor + top issue; 09/20/26 priorities + approvals waves). Report page: probe 'reachable', in-session render returns empty `<body>` | **Still pending** — question text only, no numbers; no row fabricated |
| HarrisX (harrisx.com) | #47 exclusion (fetch failed in both profiles) | probe 'reachable' + fetched directly in session 7 | **Re-opened** — the August Harvard CAPS / HarrisX poll row already stands |
| CourtListener API v4 | #47 (v3/v4 paths unreachable) | probe 'reachable' + session-7 direct fetch 'HTTP 200 OK' | **Resolved** — the API root is reachable; the path note in the entry was updated in session 7 |
| PEC (election.princeton.edu) | declined candidate (#53) | fetched: latest content 2024-11-05 | **#53 stands** — no 2026-cycle content |
| Split Ticket (split-ticket.org) | declined candidate (#53) | fetched: latest content 2025-10-20 | **#53 stands** |
| Selzer & Co (selzerco.com) | #48 exclusion | fetched: empty client-rendered shell | **#48 stands** |
| WI (WECC /elections-voting) | blocked (Cloudflare) | probe 'blocked-cloudflare-challenge' | **Still blocked** |
| NV (SoS legacy /sos-elections) | blocked (Akamai) | probe 'blocked-akamai-block' | **Still blocked** (#41: 404 legacy path; canonical /elections is in the registry) |
| CA (SoS results/statements CDN) | blocked (403) | probe 'http-403' | **Still blocked** |
| MA (Elections Division root) | blocked (Imperva) | probe 'blocked-imperva-block' | **Still blocked** |
| GA (Clarity ENR) | #35: 403 to the fetcher | probe 'reachable' (browser profile); in-session plain fetch still 403 (nginx) | **Split result recorded exactly** — the probe runner's path is the one that will pull post-Nov-3 GA certification; the plain-fetcher 403 is kept, not papered over (see also the `clarity-enr` entry) |
| WV (Clarity ENR) | blocked/timeout era (sessions 3–6) | probe 'reachable' | **Improved** — WV results are now accessible through the probe path |
| thehillx.com | excluded (dead host) | probe 'error' | **Still excluded** — harrisx.com remains the live HarrisX host |

### 13d · State Navigate parser fix (R14) — irregularity #64

The first live run (run 35490431271) committed a 2026-09-20 row whose national parse is 'failed' (only the D/R
pickup counts matched) and whose 34 chamber rows are 'failed'. In-session rendering of the live pages showed
State Navigate reworded the layout (see #64 for the exact before/after strings). `parseNational` / `parseChamber`
are now dual-format and the 2026-09-20 rendered text is transcribed into two new fixtures
(`statenavigate-national-2026-09-20.txt`, `statenavigate-mn-lower-2026-09-20.txt`) asserted alongside the
2026-09-19 ones. The failed 2026-09-20 row was NOT backfilled (provenance rule); the next live run should parse
cleanly. No Chrome exists in this sandbox, so the in-session rendering went through the fetch tool, not
`scripts/lib/render.mjs`; the runner's Chrome path is unchanged and untested here (it is what produced the
05:38Z run).

### 13e · CIRCLE YESI 2026 ↔ Kalshi volume cross-check (R12)

`data/polls/yesi-vs-kalshi-volume.json` ranks the Kalshi events by summed cumulative market volume (from the
2026-09-20T05:05Z universe) against CIRCLE's top-10 lists. Overlap: **senate 6/10** (GA, IA, ME, MI, NC, TX —
note Kalshi prices Ohio as SENATEOHS-26, the same alias the Metaculus collector uses); **governor 6/10** (AZ,
GA, IA, NV, OH, WI); **house 3 states** (AZ, MI, PA) with the basis mismatch documented (Kalshi prices
state-level seat counts, YESI lists districts). Scored at Nov 3 into `data/crosslayer/outcomes.json`.

### 13f · Metaculus layer (P0 scoring stays pending by design)

No change to the scorer: Nov 3, 2026 is ~6.5 weeks out, so `scoreSnapshots` keeps pending snapshots pending
(refused-lookahead when capturedAt ≥ certifiedOn; y ∈ {0,1}; source-less outcomes refused — all unit-tested).
The 2026-09-20T03:16Z pre-gate daily row (the #63 misread audit trail) remains in `metaculus-daily.json` and the
site marks its Senate cell; #63 is the documented explanation — no new irregularity was filed for it. The
committed `snapshots.json` carries no senate-control metaculus row dated 2026-09-20, which is the correct state
after the #63 fix.

### 13g · Standing monitors

- **R13 third-party rendering cross-check** — `data/kalshi/tracker/rendering-crosscheck.json` gained its first
  fully clean live row on 2026-09-20 (EBO + DDHQ parsed; 270toWin client-side fill documented); the daily
  workflow renders when the raw HTML does not parse.
- **Franklin & Marshall admission after direct fetch** — already in the master (session 6); the probe target
  `fandmpoll` stayed 'reachable' today, and the `fm-2026-08-pa-governor` row remains the template for the
  PA-governor market (GOVPARTYPA-26-D).
- **R15 host monitor** — first committed verdicts landed today (run 35490431271); 14 of the 30 targets are the
  re-test set exercised in 13c.

### 13h · Verification evidence after the batch

`npm run lint` → `checked 77 data JSON files, 189 sources, 4 outcomes, 5 markets, 63 irregularities (md rows 63),
31 poll entries — lint: all verified-data provenance checks pass` (run before #64 was appended; re-run in the
final pass). `npm test` → **90 tests, 89 pass, 1 skipped** (the network live-capture skip): `test/crosslayer.test.mjs`
gained the dual-format State Navigate assertions (both layouts), and `test/site-sources.test.mjs` gained the
session-8 registry block (20 ids; 18 'fetched directly 2026-09-20', 2 documented live-search admissions with the
re-fetch requirement; non-200 hosts quoted verbatim) and the session-8 poll-row block (all 8 rows, the null
NC-house ticker + `marketBasis`, the median Texas Senate reduction, the new `random-cellphone-rv-panel` family,
PPP's `methodFamily: null`, the CIRCLE subpopulation entry with `D: null`, the YESI prior, and the three new
pending ids). `npm run pipeline` regenerated the site bundle (Sources now 189 rows) and `ROADMAP.md` (15 items,
24 limitations); the headless render check passed all sections.


### 13i · Bot-run universe chimera — repaired (irregularity #65)

While resolving the merge against main (the 12:30 UTC collect run, d9bbbd7, captured 16:22:34Z, committed
16:51Z), the offline replay test failed: the committed `data/kalshi/universe/latest.json` does not reconcile
with itself — `counts.openEvents` = 4,087 = `len(events)`, but `bySeries` (1,355 rows) sums to **4,124**
events / **24,444** markets (vs `counts.openMarkets` = 24,319), and `bySeries` rolls the CA-22 event up under
the label HOUSENY17 (two rows, 110,508.87 + 107,536.97) where the event list correctly carries
HOUSECA22-26 / HOUSENY17-26. The committed daily CSV is from a different fetch state too (KX2028DRUN-28-REMA
yes_ask 0.82 in the CSV vs 0.83 in the saved event). The bot's own run passed its tests, so the splice
arose between its verification and the commit — consistent with the documented push-race rebase (run started
~16:22Z from a main predating PR #9's 16:26Z merge; 3-way merge of a ~4MB JSON can splice clean hunks from
the other side despite `-X theirs`; run logs not downloadable from this sandbox — recorded as 'consistent
with, not proven').

Repair (all verifiable in this PR):
1. **Data** — the four derived files (`universe/latest.json`, `universe/series.json`,
   `tracker/calibration.json`, `tracker/daily/2026-09-20.csv`) were rebuilt deterministically from the
   file's own saved event list (`node scripts/collect-kalshi.mjs --replay --date 2026-09-20`); the committed
   universe now reconciles (bySeries = 4,087 events / 24,319 markets) and carries the `replayedAt` marker.
   `tracker/index`, `settlements`, `discrepancy-watch` were already byte-identical to the replay; the live
   daily `.meta.json` (fetch audit) was kept.
2. **Collector** — a pre-write self-consistency guard now throws when bySeries totals do not reconcile with
   the projected event list; an internally inconsistent universe can never be written again.
3. **Workflow** — the commit step anchors the collector's output files (sha256, after all data steps) and,
   after any rebase, re-hashes them and re-captures + re-verifies + amends before pushing if they changed:
   what gets pushed is always one consistent run's snapshot.
4. **Rule** — if a committed universe's bySeries/topMarkets/CSV ever disagree with its event list again,
   treat the derived blocks as corrupted and rebuild with the replay command before reading summary numbers.

New irregularities this session: #64 (State Navigate rewording), #65 (universe chimera). Next id: 66.
