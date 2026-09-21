# Certification-gated cross-layer evaluation

Updated 2026-09-21. No 2026 outcomes have been entered. November 3 is in the
future and election night is **not** certification. `npm run crosslayer` and the
site build score the saved forecasts continuously, but return pending until
certification evidence is present. This is not an implemented universal canvass scraper.

## Record contract

`data/crosslayer/outcomes.json` is keyed by the exact question id from
`snapshots.json`. A future jurisdiction-specific collector must emit:

- `y`: numeric 0 or 1, according to that question's resolution rules.
- `certifiedOn`: ISO day, on/after its election day and no later than the report's `asOf`.
- `sources[]`: one or more evidence objects with `sourceId` (verified government
  entry in the master registry), `url`, `kind: "certified-canvass"`,
  `certificationQuote` (actual text establishing certification, at least 20 characters),
  and `retrievedAt` (ISO timestamp with timezone, on/after certification and by `asOf`).

Only HTTPS origins belonging to the referenced verified government registry entry
are eligible. A directly verified county/state-contracted vendor or CDN may be
added to that entry's `resultOrigins` explicitly. A new origin is **not** trusted
merely because a redirect, a `.gov` suffix, or a news report points there.
Do not whitelist an entire shared vendor's customer base as a government authority.

The gate validates structure and provenance relationships, **not whether the quote
is truthful or sufficient to establish the winner**. Implement and test parsers on
actual primary documents, retain raw artifacts and hashes, reconcile totals and
certification language, and flag ambiguous or contested cases. Do not label an
unofficial results page certified, even when it shows all precincts reporting.
The new Milwaukee source documents why 100% reporting need not mean complete counts.

For chamber control, certified contested seats alone are insufficient. Reconcile
carried-over seats, independents/caucuses, vacancies, any runoff and tie rules, and
the actual Kalshi/Metaculus question definitions. Record the complete derivation
and all jurisdiction links. Do not infer control from the resolution of one race.
Until that automated derivation exists, keep the control outcomes empty.

## Numeric and time gates

- Probabilities: numbers in [0,1], finite. A book midpoint requires both quotes in
  range with bid ≤ ask. Strings, NaN, infinity, lone or crossed quotes are refused.
- Brier is exactly `(p-y)^2`; only log-loss clips p to [0.005,0.995].
- Snapshot and per-layer timestamps are parsed, not lexically compared. Both must
  precede election day **00:00 UTC**, a conservative look-ahead cutoff; this intentionally
  discards election-day forecasts even before local polls close.
- Missing/invalid dates, future captures, duplicate snapshot ids, untrusted sources
  and certification after `asOf` are refused. Refusals are visible on the dashboard.
- Per-layer aggregates count dated snapshots, not independent election outcomes.
  Their answered question sets can differ; do not rank layers by these unpaired means.
- The paired evaluation selects the latest jointly answered eligible snapshot per
  question. Gap and score deltas are **Metaculus minus Kalshi**; a negative loss
  delta favors Metaculus. This fixes the comparison set, not intraday timing or
  correlation. No statistical significance or tradable edge is claimed.

## Reproduce

```sh
npm run crosslayer
node scripts/run-crosslayer.mjs --as-of 2026-09-21
npm run build-site
node --test test/crosslayer.test.mjs test/verification-gates.test.mjs
```

Synthetic test fixtures live only in tests. They are never copied into outcomes.
The daily pipeline runs this report automatically. A green job cannot certify a
result or guarantee a collector parsed data; inspect its output rows and refusals.
