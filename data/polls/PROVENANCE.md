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

`verified-polls.json` (this directory) holds the line-by-line verified individual
poll data points with full citation chains.
