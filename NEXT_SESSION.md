# NEXT SESSION (9) handoff — Elections

Today's date at writing: **2026-09-20**. Branch: `arena/01a0bfa5-elections` (merged to main as PR #10 after session 8).
Baseline after session 8: `npm test` = **90 tests (89 pass, 1 skip)**, `npm run lint` green
(77 data JSON files, 189 sources, 4 outcomes, 5 markets, 64 irregularities (md rows 64), 31 poll entries).

## Session 8 delivered (all verified, see VERIFICATION.md §13)

- **8 poll-layer rows ingested** (stateRaces 15 → 23): HPU Poll 126 NC Senate (Cooper 50/Whatley 45, LV 660,
  CI ±5.2) + NC House generic (47/47, **null ticker by design** — `marketBasis` explains the
  KXHOUSEWINSTATE-NCD seat-count distinction); UH Hobby TX Governor (Abbott 49/Hinojosa 42, n 1,502, ±2.53) +
  TX Senate (median D 43 / R 45.5 over the six candidate-matched scenarios — reduction stated); Saint Anselm
  NH Senate (Pappas 47/Sununu 41, RV 1,614, ±2.4, **new family `random-cellphone-rv-panel`**, marketGap vs
  SENATENH-26-D ≈ 0.83); Stetson CPOR FL Governor (Donalds 47/Jolly 40) + FL Senate (Moody 49/Vindman 42 →
  **SENATEFLS-26**, the short-term seat); PPP NC Senate (Cooper 48/Whatley 44, n 759, ±3.6,
  `methodFamily: null` by #49 discipline). CIRCLE youth poll (n 5,549, 57/43) as aggregator reading with
  D/R null; CIRCLE YESI 2026 top-10 lists as `independentPriors`.
- **20 new master entries (169 → 189)** — DC gap closed (dcboe), 6 county offices (Maricopa, King, Harris,
  Wayne, Clark, Cook IL), MSU IPPSR, Stetson CPOR, Rasmussen, PPP, Echelon, UNF PORL, 5 news desks
  (USA Today, LA Times, Guardian US, AJC, DM Register), Manifold, Clarity ENR. 2 admitted via documented live
  search (cook-county-il, unf-porl) — **direct-200 re-fetch is owed** before any machine use of those URLs.
- **Re-tests done** (§13c): SurveyUSA #28000 still pending (question text only, client-rendered report);
  HarrisX reachable; CourtListener resolved; PEC/Split Ticket #53 stand; Selzer #48 stands; **WI/NV/CA/MA still
  blocked** (cloudflare/akamai/403/imperva); **GA + WV Clarity now 'reachable' via the probe runner's browser
  profile** (plain fetcher still 403 on GA — recorded as a split, not papered over); thehillx still dead.
- **State Navigate dual-format parser** (irregularity #64): national + chamber regexes now match BOTH the
  2026-09-19 and the reworded 2026-09-20 layouts; 2 new fixtures asserted in `test/crosslayer.test.mjs`.
  The failed 2026-09-20 live row was NOT backfilled (provenance rule) — **the next live run (12:30 UTC) should
  produce the first fully-parsed row; check it first thing.**
- **CIRCLE YESI ↔ Kalshi volume cross-check** written to `data/polls/yesi-vs-kalshi-volume.json`
  (senate 6/10, governor 6/10, house 3 states with documented basis mismatch).
- Metaculus 03:16Z pre-gate row: explained by #63 (audit trail kept) — no new irregularity. Next irregularity
  id: **65**.

## Do first in session 9

1. **Check the next State Navigate live run** (12:30 UTC daily) — `data/statenavigate/forecast-daily.json`
   should now show a national row with `parse:'ok'` and most chambers parsed (fetchMethod headless-chrome).
   If the layout changed AGAIN, add the new strings to the dual-format regexes + a third fixture (the pattern
   is in §13d / #64).
2. **Direct-200 re-fetch owed**: cook-county-il (cookcountyclerkil.gov / results326 host) and unf-porl
   (unf.edu/coas/porl/). Update the entries (notes) once a direct fetch returns 200 — do NOT change verifiedOn.
3. **Ingest the first UNF PORL 2026 FL row** (the July 2026 Donalds 46 / Jolly 41 poll, 848 voters, Jul 17 —
   per floridapolitics.com Jul 20, 2026): fetch the lab's own release + topline PDF from unf.edu/coas/porl/
   first (no secondary sources for the numbers), transcribe n/dates/MoE/methodology, map to GOVPARTYFL-26-D.
   Also check MSU IPPSR's Sept 1, 2026 senate release and April 20, 2026 governors release for full
   methodology pages → SENATEMI-26-D / GOVPARTYMI-26-D rows.
4. **SurveyUSA #28000 MN**: try the headless-Chrome render path for the report page
   (probe target `surveyusa-poll-28000`, render:true) — if the rendered DOM carries the numbers, transcribe
   Flanagan/Tafoya + Klobuchar/Demuth and ingest (SENATEMN-26 / GOVPARTYMN-26). If still empty, keep pending
   and log the render result.
5. **Search for 20 new entries** (standing rule): verified line by line, no hallucinations. Untested
   candidates from this session's dead-ends list: CUNY NYC Election Atlas (electionatlas.nyc), the NYU
   Democracy Project (wagner.nyu.edu — civic fellowships, likely NOT a data source — decide on evidence),
   Las Vegas Review-Journal, Arizona Republic, Houston Chronicle, Detroit Free Press (news); a Metaculus
   collector for the third layer was DONE in session 7 (scripts/collect-metaculus.mjs) — a **Manifold
   collector** is the natural next third-layer piece (ROADMAP) if you want continuous crowd-price scoring.
6. **#65 recurrence watch**: the 16:22Z universe commit was a two-fetch-state splice (repaired in session 8:
   replay rebuild + collector self-consistency guard + workflow recapture-after-rebase guard). In session 9,
   spot-check the NEXT bot universe commit: `bySeries` event-sum must equal `counts.openEvents`, and the
   offline replay test must pass on the merged tree (it is the canary). If the bot run's hash guard fired
   (log line 'recapturing so the commit stays a single-run snapshot'), that is working as designed.
7. **GA Clarity post-Nov-3 readiness**: the probe runner reads GA (browser profile) while the plain fetcher
   gets 403. Plan the GA/WV certification pull to use the probe-runner path (or a browser-profile fetch) on
   Nov 4+. The openelections/clarify parse path (detailxml.zip) is documented in the `clarity-enr` entry.

## Gotchas (unchanged unless noted)

- Judge continue-on-error workflow steps by the files they committed, never the badge (#61/#62/#63 standing rule).
- Kalshi tickers ≠ state codes (#59): SENATELA-26 is Kentucky; **OH = OHS** (SENATEOHS-26); **FL 2026 = SENATEFLS-26**
  (short-term seat), FL 2028 = SENATEFL-28. Always confirm the event TITLE in the universe capture.
- Harris Poll (theharrispoll.com) ≠ HarrisX (harrisx.com) — but the Harvard CAPS monthly is co-branded
  "The Harris Poll and HarrisX" (#43 refinement).
- `src/site/app.js` interpolates `${r.kalshiDemTicker}` raw — a **null** ticker renders literal "null" in the
  Polls table, so every null-ticker row MUST carry a `marketBasis`/`methodNote` explaining the basis
  (hpu-2026-08-nc-house-generic is the first such row).
- Test counts are hard-asserted per session in `test/site-sources.test.mjs` (session 7: 22 dated 2026-09-20;
  session 8: 20 more, total 42; master ≥ 189). When session 9 admits entries, split the dated count by session
  the same way — the test for session 8 asserts exactly 42 total for 2026-09-20, so session-9 entries dated
  2026-09-20 would break it: date them with their real verification date and add a session-9 block.
- The Metaculus daily file keeps one row per RUN; any row with `consistencyFlags` naming a chamber must be read
  as 'unparsed' (#63 reviewer rule).
- No Chrome in this sandbox: in-session rendering goes through the fetch tool, not `scripts/lib/render.mjs`.
- Winthrop 2026-july national poll is issues-only (all 26 tables) — do not retry it for a horse race;
  FHSU Kansas Speaks is policy-only (recognition/evaluation, Figures 14–15) — same discipline.

## Data locations (no moves)

- Polls: `data/polls/poll-layer-2026.json` (23 stateRaces, 4 generic, 2 aggregator, 6 pending, 8 families) +
  `data/polls/yesi-vs-kalshi-volume.json` (new).
- Sources: `data/sources/master.json` (189) — categories: G-federal 20, G-state&local 60, Official publishers 4,
  Academic 21, Pollsters 33, News 22, Prediction markets 10, Ratings 18, Contest refs 1.
- Cross-layer: `data/crosslayer/{metaculus-daily,snapshots,outcomes}.json`; probes: `data/probes/{targets,latest,history}.json`
  (first committed verdicts: run 35490431271, 2026-09-20T05:38Z); State Navigate: `data/statenavigate/forecast-daily.json`.
- Irregularities: `data/irregularities.json` (ids to 64) + `IRREGULARITIES.md` mirror (rows to 64). Next id 65.
- Site bundle: `src/data/site-data.js` (regenerated by `npm run pipeline`); GitHub Pages = repo root on main.

## Next session end-state checklist

- [ ] State Navigate live row parses (national + chambers) — verify from the committed file.
- [ ] Cook IL + UNF PORL direct-200 re-fetched; entries updated (verifiedOn untouched).
- [ ] UNF PORL FL row + MSU IPPSR rows ingested (or documented why not) with #49 labels.
- [ ] SurveyUSA #28000 rendered (or kept pending with the render evidence).
- [ ] 20 new entries verified line by line and admitted (no hallucinations; search-admitted ones flagged).
- [ ] `npm run pipeline` + `npm test` + `npm run lint` green; counts synced (README, tests, VERIFICATION.md).
- [ ] Commit → PR → merge to main; end with suggestions + limitations.
