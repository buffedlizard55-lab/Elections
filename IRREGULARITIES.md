# Irregularities & Discrepancy Log

Confirmed anomalies, stale-data risks, and items needing human review.
No silent patches: everything questionable lands here with evidence.

| ID | Date | Severity | Item | Evidence | Status |
|----|------|----------|------|----------|--------|
| IRR-001 | 2026-09-18 | info | FiveThirtyEight is defunct; excluded from live sources | NiemanLab 2025-03-05 (shutdown, staff laid off, updates canceled); NYT 2026-05-16 (archive redirecting to ABC News) | confirmed — historical use only |
| IRR-002 | 2026-09-18 | info | Monmouth Poll ceased operations 2025-07-01; archive only | Official institute page statement | confirmed — historical use only |
| IRR-003 | 2026-09-18 | review | RCP polls page served stale 2010-era snapshot to checker | Direct fetch HTTP 200, correct title, stale body; live operation corroborated by 2026-09-17 third-party citation | open — needs human freshness check |
| IRR-004 | 2026-09-18 | review | Gallup reportedly dropped presidential approval question (Spring 2026) | Princeton research guide note | open — verify per-series before use |
| IRR-005 | 2026-09-18 | info | AP VoteCast described as 2017–2024 (past tense); 2026 status unconfirmed | AP-NORC project page wording | open — use archived public-use files until confirmed |
| IRR-006 | 2026-09-18 | info | FEC homepage listed 2 commissioners + 4 vacancies | Direct fetch of fec.gov | noted — data publication current; quorum implications for enforcement only |
| IRR-007 | 2026-09-18 | info | Harvard Dataverse homepage HTML fetch returned HTTP 500 to checker while API healthy (v6.10.1, OK) | API + re3data + Harvard Library corroboration | open — re-check homepage next session |
| IRR-008 | 2026-09-18 | info | CES program home migrated Harvard → Tufts; Split Ticket analysis migrating to The Argument (URL unverified) | On-site migration notices | tracked — dual URLs recorded for CES; Argument URL queued |
| IRR-009 | 2026-09-18 | review | Pew legacy `/politics/` path dead (site restructured to `/topic/politics-policy/`); YouGov `today.` domain redirecting to `yougov.com` | Direct fetch results | confirmed — canonical URLs updated in master list |
| IRR-010 | 2026-09-18 | info | Sandbox blocks direct HTTPS to most hosts; live checks via fetch/search channels | Only api.github.com directly reachable; all fetches logged in verification log | noted — re-run `validate_sources.py --check-live` from normal network |

## How to file a new entry

1. Add a row with a new `IRR-0xx` ID, date, severity (`info` / `review` / `blocking`), evidence links, and status.
2. Link it from the relevant source's `caveats` in `data/master_sources.json`.
3. Never delete resolved rows — mark them `resolved` with a resolution note.
