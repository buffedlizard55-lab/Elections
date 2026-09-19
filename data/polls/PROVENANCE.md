# Provenance — FiveThirtyEight data files

Files in this directory were cloned from the official archived GitHub repository
`fivethirtyeight/data` (sparse checkout, 2026-09-18) and copied here **verbatim**:

| File | Upstream path | Bytes |
|---|---|---|
| `538-national-averages.csv` | `polls/2024-averages/presidential_general_averages_2024-09-12_uncorrected.csv` | 1,604,311 |
| `538-2024-polls.csv` | `state-of-the-polls-2024/2024_polls.csv` | 185,240 |
| `538-2024-races.csv` | `state-of-the-polls-2024/2024_races.csv` | 17,518 |

Upstream repository: https://github.com/fivethirtyeight/data

- `538-national-averages.csv` columns (per upstream README): `candidate, date,
  pct_trend_adjusted, state, cycle, party, pct_estimate, hi, lo`. National rows
  have `state=National`. The file is the final archived 538 general-election
  average, published 2024-09-12 ("uncorrected"), covering 2020-02-27 through
  2024-09-12.
- `538-2024-polls.csv`: the 1,700 individual 2024 polls (end field dates between
  180 and 15 days before the election), published as of 2024-10-28 9am ET.
- `538-2024-races.csv`: 469 races with poll counts and Cook Political Report
  ratings (as of 2024-10-28).

FiveThirtyEight the website shut down on 2025-03-05 (Wikipedia, fetched
2026-09-18); the GitHub archive is the canonical public copy.

## Integrity check (2026-09-19)

Each local copy was compared with the upstream GitHub object via the GitHub
contents API (`gh api repos/fivethirtyeight/data/contents/<path>`), which returns
the git blob SHA-1 and size. All three match byte-for-byte. SHA-256 digests of the
local files are recorded for offline re-verification (`sha256sum data/polls/*.csv`).

| File | git blob SHA-1 (local = upstream) | SHA-256 (local) |
|---|---|---|
| `538-national-averages.csv` | `ce9b15dacf16f11ddf184560bcd6d71c86fd2907` | `c66cf38aa566c3dfa0b50823e8259d9631bfb5ab830c18af13dd54204a8d8b35` |
| `538-2024-polls.csv` | `1d9f5565079c93217ff92f897da2da051ba15499` | `a95ea0246bdf2f9ca0dbddf555984cc46ce24ae47c7cfcf203e09d3259e8c0a7` |
| `538-2024-races.csv` | `21d0562e2a2f1bd921c514d9e6ff407b5819e374` | `b28024c5c591b83f41522edfe34d960713ee9c53b4bddcd0d154d312d716a398` |

Re-run: `for f in data/polls/538-*.csv; do git hash-object "$f"; done` and compare with
`gh api repos/fivethirtyeight/data/contents/<upstream path> --jq .sha`.

`verified-polls.json` (this directory) holds the line-by-line verified individual
poll data points with full citation chains.
