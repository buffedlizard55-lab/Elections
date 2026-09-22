# Next session (12) — handoff

Updated **2026-09-21**. Session 11 branch: `arena/01a0c65b-elections`.
Primary audit: `VERIFICATION.md` §16. Do not treat a successful schema test as
confirmation that a page's claims are true.

## Delivered

- Master registry **249 entries**. Session 11 added 20 directly fetched pages:
  18 county or city election authorities, plus the League of Women Voters and
  Verified Voting. Evidence: `data/sources/admissions-2026-09-21-batch3.json`.
- Ten other candidate URLs were not admitted (irregularity #70): CivicPlus
  loading shells, a welcome-only page, a path that resolved to Entertainment,
  a Custom404, a failed fetch, and a post-redesign 404. Do not reconstruct those
  offices from memory.
- Vote.org and Rock the Vote were recategorized from government to
  Ratings, forecasts & analysis (irregularity #69). Their `verifiedOn` dates and
  observed text were not rewritten.
- No poll rows, turnout figures, or vote totals were added. Linked result files
  and registration widgets that did not expose numbers were not opened and not
  invented. County pages are not certified canvasses.

## Counts

| Category | Entries |
|---|---:|
| Government — federal | 21 |
| Government — state & local | 106 |
| Official publishers & archives | 4 |
| Academic & university research | 24 |
| Pollsters & survey research | 35 |
| News outlets & wires | 26 |
| Prediction markets & exchange data | 10 |
| Ratings, forecasts & analysis | 22 |
| Contest & methodology references | 1 |
| **Total** | **249** |

Entries dated 2026-09-21: **60** (20 session 9 + 20 session 10 + 20 session 11).
Next irregularity id: **71**. Keep the independent Python 20-source registry
separate from this Node registry.

## Next work, in priority order

1. **After November 3 and certification:** jurisdiction-specific canvass parsers,
   retained evidence, certified-versus-unofficial detection, and contest mapping.
   Do not use an exchange settlement or a news call as official ground truth.
   Chamber control still needs carried seats, independents, vacancies, and the
   market's own resolution rule.
2. **Shells still withheld:** Hillsborough, Duval, Palm Beach, Pinellas, Pierce,
   Nassau, El Paso, Honolulu, and Hennepin. Retry with a headless browser before
   any canvass use. A loading shell is not an official results page.
3. **State Navigate:** do not invent an API. Inspect the next scheduled rendered
   capture. Free pages are not proof the collector parsed them.
4. **Outstanding polls:** SurveyUSA #28000 still has no readable toplines.
   Muhlenberg still has no 2026 horse-race on its own site. Do not fill either
   from memory. MSU governor modeling stays withheld until the full wording is read.
5. **Old registry:** this session checked the 20 new pages and the two category
   corrections, not all 249 historical pages. Do not re-date prior admissions.

## Reproduce

```sh
npm run pipeline
npm test
npm run lint
python scripts/validate_sources.py
python scripts/sync_site_data.py
```
