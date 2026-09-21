# Next session (10) — handoff

Updated **2026-09-21**. Session 9 branch: `arena/01a0c21f-elections`.
Primary audit: `VERIFICATION.md` §14. Do not interpret successful schema tests as
independent confirmation of the source's truth.

## Delivered

- Master registry **209 entries**: 20 new directly fetched local election authority
  pages, each with its observation and review link. Eight other candidates withheld.
  Evidence: `data/sources/admissions-2026-09-21.json`.
- Four primary-release poll rows: UNF July FL governor and **Nixon**/Moody Senate;
  MSU August Michigan Senate and governor LV figures (**n=779**, not 1,000).
  MSU method family and MoE remain null, not guessed. Governor probability/gap is
  withheld until full question wording establishes coverage of Mike Duggan.
- Candidate checks now suppress misleading poll/market comparisons. Historical
  Vindman scenarios are retained, but the captured FL market names Nixon (#67).
- Cross-layer certification gates, exact Brier, valid probability/time checks and
  paired latest-per-question scores. `npm run crosslayer` writes `scores.json`;
  daily pipeline and lightweight probe rebuild the site and scores. **No certified
  2026 outcomes exist yet.** See `backtest/crosslayer-outcomes.md`.
- Metaculus early-probe rows can now receive a missing same-day Kalshi leg after
  the market fetch, preserving original forecasts and both capture times. No complete
  pair is overwritten; added regression coverage for chamber and seat ordering.
- R13 invalid quotes and >24h capture separation withheld; 270toWin dem/rep display
  fixed (#68). Soft AccessDenied/Not Found HTML is no longer accepted as good content.
- Pages dashboard improved: source/market dates, pending certification, paired
  comparison, scoring refusals, current session re-tests, method-unclassified labels,
  keyboard skip link, reduced-motion and narrow-screen fixes.
- Re-tests: `data/probes/session-review-2026-09-21.json` (session fetch tool, **not**
  the automated runner). F&M already admitted; no duplicate. UNF and Cook IL home
  pages now directly readable; Cook results326 host still not validated.

## Next work, in priority order

1. **After November 3 and certification:** implement jurisdiction-specific automatic
   canvass parsers with retained evidence/hashes, certified-vs-unofficial detection,
   contest/nominee mapping and vote-total reconciliation. Only then populate outcomes
   and score the Metaculus/Kalshi Senate gap. Chamber control also requires carried
   seats, independents/caucuses, vacancies, runoffs and exact resolution-rule alignment.
   Never use exchange settlement or a news call as official ground truth.
2. **State Navigate:** API root still HTTP 500 to the session fetch tool; direct
   sandbox Node fetch ECONNRESET. Free national page works (2,306 seats, 126 D
   pickups, 11 R pickups, 27 chambers; session observation only). Inspect the next
   scheduled **12:30 UTC** rendered capture for parser success. Do not guess API
   routes or use paid tier data. Admit an API only after free-access docs and a live
   schema are verified. Nothing in this session constitutes an API implementation.
3. **Outstanding polls:** SurveyUSA #28000 report has field dates Sep 9–14 and
   release Sep 15 (archive date differs), but toplines still blank. Muhlenberg library
   still shows no 2026 horse-race. MSU full methodology/recruitment and governor
   third-candidate coverage needed; April release has image-only toplines. Continue
   to keep family/MoE unknown rather than infer them from a pollster brand.
4. **Automated poll ingestion:** current primary releases were extracted by this
   agent; this is not a general daily poll scraper. Add publisher-specific parsers,
   frozen input fixtures, exact quote/page references and candidate-identity tests.
5. **Official paths:** NV canonical `/elections` now readable; obsolete `/sos-elections`
   remains missing. WI `/elections-voting`, CA CDN root and MA directory still deny.
   Test specific official deep results/certification files, not just directory roots.
   PEC/Split Ticket still do not meet #53 current-cycle admission criteria.
6. **Open-market paper contest:** the existing retrospective simulation and forward
   market collection are not a full persistent live paper-execution ledger. Add
   as-of strategy decisions, immutable orders/fills, candidate changes, mark-to-market
   equity and settlement reconciliation; distinguish modeled fills from executable
   liquidity and do not claim live PnL from retrospective demos.
7. **Old registry audit:** 20 new pages and changed numeric inputs were checked this
   session, not all 209 pages and every historical linked PDF. Some legacy notes cite
   Wikipedia/secondary summaries; replace these before using them as certified truth.
   Verify source licenses and limits before expanding automated collection.
8. **Evidence persistence:** session observations are concise excerpts with URLs,
   not byte-identical archived full bodies. Automated raw artifacts expire in 7 days.
   Plan permitted external immutable storage/hashes without adding large datasets to Git.

## Reproduce / end-of-session checks

```sh
npm run pipeline
npm test
npm run lint
python scripts/validate_sources.py
python -m compileall -q scripts
```

Next irregularity id: **69**. The registry currently has 80 state/local authorities;
county admission is not statewide coverage or certified-result ingestion. Keep the
independent Python 20-source registry separate from the Node 209-source registry.
Do not overwrite historic failed captures or re-date prior source admissions.
