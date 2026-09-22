# Next session (12) — handoff

Updated **2026-09-21** after the follow-up on `arena/01a0c65b-elections`.
Session 11 (`arena/01a0c626-elections`) is already on main. This follow-up added
16 sources that were not already there (249 → **265**) and did not duplicate
Baltimore City, Denver, Multnomah, or Salt Lake. Evidence:
`data/sources/admissions-2026-09-21-batch4.json`. Irregularities #70 (Vote.org /
Rock the Vote recategorized) and #71 (10 shells/404s withheld). No new poll rows
and no vote totals.
Primary audit: `VERIFICATION.md` §16. Do not interpret successful schema tests as independent
confirmation of a source's truth.

## Delivered in session 11

- **P0 canvass machinery**: `src/canvass.js` (9/9 tests), `scripts/gen-canvass-config.mjs`
  (32-jurisdiction config, idempotent), `scripts/ingest-canvass.mjs` (default / `--set-url` /
  `--set-certified-on` / `--promote`), staging + per-run evidence under `data/crosslayer/canvass/`.
  Both workflows run it after Nov 3. First run: 32 jurisdictions, 0 staged (`no-url-yet` by design).
- **Master 229 → 249** (batch3): 20 direct-fetch admissions — 5 gov (Denver, Salt Lake, Baltimore,
  Multnomah, Clark WA), 4 academic (AP-NORC, Rutgers-Eagleton, Schar School, USC CESR), 4 pollsters
  (Quantus, InsiderAdvantage; Cygnal + Change Research at **needs-review**), 4 news (WMUR, Nevada
  Independent, MN Star Tribune, Alaska Beacon), 3 analysis/civic (VPAP, FairVote, VOTE411).
  Evidence: `data/sources/admissions-2026-09-21-batch3.json`, `data/probes/session-review-2026-09-21-s11.json`.
- **Poll layer 35 → 40**: 5 Rasmussen/Pulse rows with `ivr-rdd-online-panel-blend` labels;
  framing flag = irregularity #69 (FairVote fetch corroborates seat context, publisher framing stays flagged).
- `oregon-sos` promoted to `verified` (direct re-fetch). MA intentionally still `verified-via-search`.

## Remaining work (priority order)

1. **Kalshi CONTROLS-2026 rules page** (`kalshi.com/markets/controls-2026` event rules): confirm
   majority(51) + VP tiebreak, then set `controlQuestion.resolutionRule.confirmed=true` and fill
   `carriedSeats` in `data/crosslayer/canvass-jurisdictions.json`. The rules fetch was queued but
   not completed this session.
2. **First post-election canvass pass (after Nov 3)**: for each jurisdiction set
   `--set-url` to its results page as URLs publish, then run nightly ingest; `--promote` only dated,
   validated rows. Score the Metaculus-vs-Kalshi Senate/House gap (`pairedComparison` in
   `src/crosslayer.js`) against certified outcomes — the P0 question.
3. **JS-shell counties**: headless-Chrome render re-test for `bexar-county-elections`,
   `tarrant-county-elections`, `hennepin-county-elections` (queued render:true in
   `data/probes/targets.json`). Admit only from readable renders.
4. **Poll-layer backlog**: pendingSources `echelon-2026-04-fl`, `prri-2026-ava-midterms`,
   `kff-2026-06-mifepristone-midterms`, `surveyusa-28000-mn` (toplines-only re-fetch); candidate
   re-tests per #53 criteria; SurveyUSA/HarrisX/CourtListener re-tests; blocked official paths
   (WI/NV/CA/MA) re-probe.
5. **Metaculus duplication check** (2026-09-20 senate/house question rewrites) → irregularity #70
   if confirmed. Next irregularity id = **70**.
6. **Collectors**: State Navigate API (`data.statenavigate.com` — endpoints 404 as of #55; re-probe
   for the unpriced downballot layer); keep Metaculus daily collector running so layer 3 scores
   continuously.
7. **Contest reverse-engineering (The Leap)**: unique usernames/strategies per trader, paper-trading
   PnL on Kalshi political markets — scaffolding exists (`contest/`, `data/contest-results.json`);
   needs per-strategy attribution.
8. **Standing monitors**: R13 third-party-rendering cross-checks automation; Franklin & Marshall
   admission after a direct fetch; re-admit Daily Kos when the 500s clear.

## Limitations (unchanged + new)

- Sandbox has **no general egress**: node fetches fail TLS; live collection runs in GitHub Actions
  only. All session verification used the page-fetch tool.
- Four hosts are fetch-blocked or bot-walled (WI/NV/CA/MA officials); MA cannot pass the promote-gate
  by design until that changes.
- Bexar/Tarrant/Hennepin render only in real browsers; the runner probe (headless Chrome) is the path.
- Cygnal + Change Research are partisan-aligned commercial pollsters admitted at `needs-review`:
  per-release methodology required before any number enters the poll layer; never pool unlabeled.
- InsiderAdvantage founder retires from polling Nov 2026 — continuity caveat for future cycles.
- No certified 2026 outcomes exist yet; nothing is scored against canvasses until certification.
