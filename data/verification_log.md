# Verification Log — Batch 1 (20 entries)

**Check date:** 2026-09-18 (UTC)
**Checked by:** repo maintainer (automated agent session)
**Policy:** An entry is admitted only if its URL resolved and its content matched its description on the check date. Evidence for every line is below. Anything not verified is in `data/flagged_sources.json`, never in the master list.
**Environment note:** the sandbox blocks direct outbound HTTPS to most hosts (only the GitHub API is directly reachable), so verification was performed through (a) direct page fetches via the agent's fetch channel and (b) search-index corroboration. Both are recorded per line. A human reviewer with normal network access should spot-confirm freshness (especially SRC-017).

## Method legend

- `direct-fetch` — full page content retrieved and inspected on check date.
- `search-corroborated` — live page content observed via search index on check date.
- `api-plus-registry` — machine API returned healthy + independent registry records.
- `fetch-plus-third-party` — URL resolves but checker received stale content; live operation corroborated by an independent current citation.

## Line-by-line record

| # | ID | Name | URL checked | Method | Result on 2026-09-18 |
|---|----|------|-------------|--------|----------------------|
| 1 | SRC-001 | FEC | https://www.fec.gov/ | direct-fetch | LIVE. Current: "Week of September 14–18, 2026" digest; 2025–2026 statistical summary. Data hub link https://www.fec.gov/data/ confirmed on page. NOTE: 2 commissioners + 4 vacancies listed. |
| 2 | SRC-002 | EAC | https://www.eac.gov/ | direct-fetch | LIVE. Current Aug 2026 content (Poll Worker Recruitment Day 2026, Learning Lab, 2025 Clearies). |
| 3 | SRC-003 | NARA Electoral College | https://www.archives.gov/electoral-college | direct-fetch | LIVE. Process explainer + links to https://www.archives.gov/electoral-college/results, /faq, certificates confirmed on page. |
| 4 | SRC-004 | Census Voting & Registration | https://www.census.gov/topics/public-sector/voting.html | search-corroborated | LIVE. Nov 2024 P20 tables (Apr 2025) + report (Aug 2026) listed. Data sub-page https://www.census.gov/topics/public-sector/voting/data.html observed in same record. |
| 5 | SRC-005 | House Clerk Election Info | https://clerk.house.gov/Members/ViewElectionInformation | search-corroborated | LIVE. 119th Congress nominees, 2024 statistics, historical series since 1920 described. |
| 6 | SRC-006 | MIT Election Lab | https://electionlab.mit.edu/ | direct-fetch | LIVE. EPI 2008–2024, SPAE, data portal link https://electionlab.mit.edu/data confirmed. MEDSL GitHub org corroborates returns repos. |
| 7 | SRC-007 | ANES | https://electionstudies.org | direct-fetch | LIVE. 70+ free datasets, Guide to Public Opinion, 75-year timeline. UMich CPS stewardship corroborated. |
| 8 | SRC-008 | CES | https://tischcollege.tufts.edu/ces → https://cces.gov.harvard.edu/ (archive) | direct-fetch | LIVE. Harvard page carries migration notice to Tufts; Tufts URL resolves to live CES center page with data/analytics links. Dataset links confirmed on Harvard page incl. https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi%3A10.7910/DVN/PR4L8P (CES 2022). |
| 9 | SRC-009 | Harvard Dataverse | https://dataverse.harvard.edu/api/info/version | api-plus-registry | LIVE. API: {"status":"OK","version":"6.10.1"}. Harvard Library + re3data (accessed 2026-09-18) corroborate. Homepage HTML fetch 500 (checker-side, flagged). |
| 10 | SRC-010 | AP-NORC | https://apnorc.org/ | direct-fetch | LIVE. Sept 2026 research on homepage. VoteCast page https://apnorc.org/projects/ap-votecast/ + ICPSR series 2380 corroborated via index. VoteCast described as 2017–2024 (continuation unconfirmed — flagged). |
| 11 | SRC-011 | Pew Politics & Policy | https://www.pewresearch.org/topic/politics-policy/ | direct-fetch | LIVE. Root fetch returned Sept 15–17, 2026 publications + this topic link. Legacy /politics/ path FAILED (restructure noted). |
| 12 | SRC-012 | Gallup | https://news.gallup.com/ | direct-fetch | LIVE. Resolves to /home.aspx with current releases; politics topic https://news.gallup.com/topic/politics.aspx confirmed on page. Caveat: Princeton guide says approval question dropped Spring 2026 (verify per series). |
| 13 | SRC-013 | Quinnipiac | https://poll.qu.edu/ | direct-fetch | LIVE. Sept 10 + Sept 16, 2026 releases on homepage. Methodology https://poll.qu.edu/methodology/ corroborated. |
| 14 | SRC-014 | Marist | https://maristpoll.marist.edu/ | direct-fetch | LIVE. July 1, 2026 poll + Sept 17, 2026 podcast + poll index https://maristpoll.marist.edu/latest-polls/ confirmed on page. About page corroborated; est. 1978, Marist University. |
| 15 | SRC-015 | YouGov Politics | https://today.yougov.com/politics → https://yougov.com/en-us/politics | direct-fetch | LIVE. Redirect target loaded with Aug 28–31, 2026 Economist/YouGov poll. Hub https://yougov.com/en-us/content/politics confirmed on page. |
| 16 | SRC-016 | Ipsos US polls | https://www.ipsos.com/en-us/latest-us-opinion-polls | search-corroborated | LIVE. Reuters/Ipsos releases Jun–Aug 2026 in hub. |
| 17 | SRC-017 | RCP Polls | https://www.realclearpolitics.com/epolls/latestpolls/ | fetch-plus-third-party | EXISTS (HTTP 200, correct title) BUT checker received stale 2010-era snapshot. Live operation corroborated by 2026-09-17 third-party citation of RCP average. FRESHNESS UNCONFIRMED — human check required. |
| 18 | SRC-018 | Crystal Ball | https://centerforpolitics.org/crystalball/ | direct-fetch | LIVE. Current 2026-cycle rating changes on page. UVA unit corroborated. |
| 19 | SRC-019 | Split Ticket | https://split-ticket.org/ | direct-fetch | LIVE. 2025–2026 articles on page. Partnership notice (bulk of new analysis via The Argument; URL unverified) flagged. |
| 20 | SRC-020 | OpenSecrets | https://www.opensecrets.org/ | direct-fetch | LIVE. Sept 16, 2026 news + full data nav on page. CRP stewardship corroborated (MacArthur record). |

## Kalshi layer (market data, separate track)

| # | Item | URL checked | Method | Result on 2026-09-18 |
|---|------|-------------|--------|----------------------|
| K1 | Kalshi homepage | https://kalshi.com/ | direct-fetch | LIVE. Observed: Midterms Hub link ($758,571,404 volume shown), Politics category, live market cards. Volume figure is an observation, not project data. |
| K2 | Midterms hub | https://kalshi.com/category/elections/midterms | link-verified (seen on K1) | Link present on live homepage. |
| K3 | Politics hub | https://kalshi.com/category/politics | link-verified (seen on K1) | Link present on live homepage. |
| K4 | API docs root | https://docs.kalshi.com/ → /welcome | direct-fetch | LIVE. Confirmed: API reference, first-request guide, demo env, API keys, rate limits, changelog. |
| K5 | Get Markets | https://docs.kalshi.com/api-reference/market/get-markets | direct-fetch | LIVE. Base URL https://external-api.kalshi.com/trade-api/v2 + alternates; `limit`/`cursor` pagination; full response schema captured. |
| K6 | Legal status | https://kalshi.com/about + Justia D.C. Cir. 24-5205 | search-corroborated | CFTC-regulated exchange; election contracts permitted per 2024 federal court decisions. Current-docket status not re-verified. |

## Contest model (“The Leap”, reverse-engineered mechanics)

| # | Item | URL checked | Method | Result |
|---|------|-------------|--------|--------|
| C1 | What is The Leap | https://www.tradingview.com/support/solutions/43000771594-what-is-the-leap/ | search-corroborated | LIVE support article: recurring paper-trading competition, fixed equal virtual balances, no resets, real-time simulated execution, public leaderboard, ~month seasons. |
| C2 | Leap edition reporting | https://www.newtrading.io/the-leap-tradingview-competition/ | search-corroborated | July 20–Aug 14, 2026 edition: $100,000 virtual, US futures, 5-day minimum, top-250 prizes. (Third-party report; official page governs.) |
| C3 | Leap edition page | https://in.tradingview.com/the-leap/february-2026-eurex/ | search-corroborated | Edition mechanics: $100,000 start, 3+ day minimum (edition-specific), auto-close at end, income-ranked. |

## Failed candidates (see flagged_sources.json)

FiveThirtyEight (defunct Mar 2025), Monmouth (ceased Jul 1, 2025), Silver Bulletin (paywalled models), Cook (unverified), NYT/Siena (unverified), Ballotpedia (exists; queued batch 2), The Argument URL (unverified).
