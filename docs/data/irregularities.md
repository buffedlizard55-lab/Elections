# IRREGULARITIES & DISCREPANCIES — flagged for review

Machine-readable twins: `data/irregularities.json` (Node-track items 1–12 + 23–25) and the Python
toolkit's `data/flagged_sources.json` + `data/verification_log.md` (items 13–22).
Severity: **high** = affects trust in a result · **medium** = affects interpretation ·
**low** = cosmetic/monitor.
Nothing here is silently normalized; each item states its action.

| # | Sev | Area | Title | Action |
|---|---|---|---|---|
| 1 | high | Institution | **EAC has had NO serving commissioners since July 2026** (two dismissed, one resigned — Wikipedia, fetched 2026-09-18) | Treat EAC guidance with caution; no numeric data in this repo depends on it |
| 2 | medium | Kalshi API | **Stale `last_price_dollars`/`updated_time` on the shared API host** (CONTROLH-2026 showed 0.10 with updated_time 2026-07-14 while the live page showed an 89/91 book) | Prefer `yes_bid`/`yes_ask` (or the orderbook endpoint) over last-price for live markets; re-verified each collect run |
| 3 | medium | Third-party tracker | **covers.com 2026-08-27 internally inconsistent** (R 57% in prose, 53% in its own table) | Excluded from master list; kept as a labeled historical cross-check point |
| 4 | medium | Polling ecosystem | **Gallup ended presidential approval tracking (Feb 2026)** and horse-race polling (2015); final measure 36% (Dec 2025) | Historical series only; 2026 comparisons use CNN Poll of Polls (39%) and Quinnipiac (33%) |
| 5 | medium | Polling ecosystem | **Monmouth Polling Institute ceased operations 2025-07-01** (Ballotpedia) | 2024-25 releases used as historical only |
| 6 | medium | Forecasting ecosystem | **538 site shut down 2025-03-05; public poll archive ends 2024-09-12** — no late-2024 538 series exists publicly | Poll-vs-market backtest reuses the 2024-09-12 anchor with per-point age disclosed |
| 7 | low | Kalshi web UI | **Hub percentages can sum ≠ 100%** (mixed bid/ask display, e.g. MI SecState 95%+14%, KS AG 57%+49%) | Store web-% as-rendered; API books authoritative where captured; never average web-% pairs |
| 8 | high | Kalshi market design | **KXMUSKCHALLENGERS-26: "At least 3" (13%) priced ABOVE "At least 1" (12%) — logically impossible** ({≥3} ⊂ {≥1}); thin market | Flagged, not traded; monitor for self-correction; candidate for a market-design anomaly study |
| 9 | low | Universe coverage | **34/35 Senate seats have tradeable markets (LA thin; third-party count disagrees with hub — both recorded); 66/435 House districts individually priced** | Collector enumerates the full universe each run; thin/missing markets reported, not imputed |
| 10 | medium | Regulatory | **State-vs-CFTC jurisdiction conflict unresolved** (political contracts settled; sports contested — Third Circuit 2026-04 vs S.D. Ohio 2026-03) | Documented; no numeric reliance; re-checked each session |
| 11 | low | Data capture | **Election-day (2024-11-05) candle bar not captured** (fetch end_ts cut it off); last captured bar = Nov 4 | Conclusions unaffected (settlements come from market objects); collectors re-fetch with end_ts = settlement + 86400 |
| 12 | low | Modeling assumption | **Poll margin → probability uses logistic k=4.5** (the archive publishes margins, not probabilities; 538's 2020 scaling) | Labeled "modeled mapping" at every use; sensitivity at k=3 changes the 2024-09-12 anchor from 35%→31% Trump — conclusion unchanged |
| 13 | low | Forecasting ecosystem | **FiveThirtyEight is defunct; excluded from live sources** (NiemanLab 2025-03-05: shutdown, staff laid off, updates canceled; NYT 2026-05-16: archive redirecting to ABC News) | Confirmed — historical use only. Corroborates item 6 |
| 14 | low | Polling ecosystem | **Monmouth Poll ceased operations 2025-07-01; archive only** (official institute page statement) | Confirmed — historical use only. Corroborates item 5 |
| 15 | medium | Aggregator | **RCP polls page served stale 2010-era snapshot to checker** (direct fetch HTTP 200, correct title, stale body; live operation corroborated by 2026-09-17 third-party citation) | Open — needs human freshness check before use |
| 16 | medium | Polling ecosystem | **Gallup reportedly dropped presidential approval question (Spring 2026)** (Princeton research guide note) | Open — verify per-series before use. Corroborates item 4 |
| 17 | low | Polling ecosystem | **AP VoteCast described as 2017–2024 (past tense); 2026 status unconfirmed** (AP-NORC project page wording) | Open — use archived public-use files until confirmed |
| 18 | low | Institution | **FEC homepage listed 2 commissioners + 4 vacancies** (direct fetch of fec.gov, 2026-09-18) | Noted — data publication current; quorum implications for enforcement only |
| 19 | low | Data capture | **Harvard Dataverse homepage HTML returned HTTP 500 to checker while API healthy** (v6.10.1, OK; re3data + Harvard Library corroboration) | Open — re-check homepage next session |
| 20 | low | Source migration | **CES program home migrated Harvard → Tufts; Split Ticket analysis migrating to The Argument (newsletter URL unverified)** (on-site migration notices) | Tracked — dual URLs recorded for CES; Argument URL queued for batch 2 |
| 21 | low | Source migration | **Pew legacy `/politics/` path dead (restructured to `/topic/politics-policy/`); YouGov `today.` domain redirecting to `yougov.com`** (direct fetch results) | Confirmed — canonical URLs updated in master list |
| 22 | low | Data capture | **Sandbox blocks direct HTTPS to most hosts; live checks via fetch/search channels** (only api.github.com directly reachable; all fetches logged) | Noted — re-run `validate_sources.py --check-live` from normal network |
| 23 | medium | Data source availability | **OpenElections (Harvard Dataverse) site offline — `openelections.org` domain is for sale on GoDaddy** (fetched 2026-09-19) | Do not cite openelections.org; use `dataverse.harvard.edu` datasets with DOIs; re-check domain each session |
| 24 | low | Polling ecosystem | **U.S. Elections Project (UF) migrated** — `electproject.org` is now a stub pointing to the UF Election Lab (fetched 2026-09-19) | Use `election.lab.ufl.edu` (master entry `uf-election-lab`) as canonical VEP-turnout source |
| 25 | low | Polling ecosystem | **Edison Research acquired by SSRS (2025)** — `edisonresearch.com` redirects to `ssrs.com/edison-research-at-ssrs` (fetched 2026-09-19); 2026 exit-poll operation not yet confirmed | Treat 2026 exit-poll sourcing as provisional; confirm operation + methodology before use in backtests |

## Review status

- Items 1–2, 4–6, 10: structural/contextual — no repo data depends on the affected values.
- Items 3, 9: source-exclusion decisions — recorded in VERIFICATION.md §5 / sources notes.
- Items 7–8, 11: standing monitors for the daily collector (ROADMAP R5 adds automated checks).
- Items 13–14, 16: independent corroboration of items 6, 5, 4 (second verification session).
- Items 15, 17, 19: open re-checks for next session (freshness/homepage/VoteCast status).
- Items 18, 20–22: noted/tracked; canonical URLs already updated where applicable.
- Items 23–25 (added 2026-09-19, Node track): source-availability/ecosystem changes found during the 21-entry master-list expansion — no numeric data in the repo depends on the affected URLs (audit trail: VERIFICATION.md §6).

## How to file a new entry

1. Add a row with the next `#`, severity (**high** / **medium** / **low**), evidence links, and action.
2. Mirror machine-readable state in `data/irregularities.json` (items 1–12 schema) and/or the
   source's `caveats` in `data/master_sources.json` / `data/sources/master.json`.
3. Never delete resolved rows — mark them resolved with a resolution note.
