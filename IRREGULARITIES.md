# IRREGULARITIES & DISCREPANCIES — flagged for review

Machine-readable twin: `data/irregularities.json` (rendered on the site). Severity:
**high** = affects trust in a result · **medium** = affects interpretation · **low** = cosmetic/monitor.
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

## Review status

- Items 1–2, 4–6, 10: structural/contextual — no repo data depends on the affected values.
- Items 3, 9: source-exclusion decisions — recorded in VERIFICATION.md §5 / sources notes.
- Items 7–8, 11: standing monitors for the daily collector (ROADMAP R5 adds automated checks).
