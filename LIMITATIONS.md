# Limitations

Honest constraints on what this project can currently claim or do.

## Data collection

1. **No live Kalshi snapshot yet.** The sandbox blocks outbound HTTPS to Kalshi's API, so `scripts/fetch_kalshi.py` is built, documented, and tested for graceful failure but has not yet pulled a live snapshot. The `collect.yml` workflow pulls daily on GitHub Actions (normal network) starting after merge; manual fallback: run the collector locally and commit `data/kalshi/markets_politics_*.json`.
2. **Kalshi category taxonomy unconfirmed.** Politics/elections filtering is client-side keyword heuristics + an (empty) operator allowlist. The exact `category`/`series` fields must be confirmed from live responses before tightening the filter.
3. **Kalshi `/events` endpoint unverified.** The docs page for events was not fetched this session; the collector treats it as best-effort and logs the outcome.
4. **RCP freshness unconfirmed** (IRR-003). Human check required.
5. **No scraped poll datasets yet.** Only source registry + methodology exist; per-poll time-series ingestion (with per-row source URLs) is batch-2 work.

## Modeling & contest

6. **Fees not modeled.** Kalshi charges trading fees; the paper engine fills at flat snapshot prices with zero fees. Any PnL comparison to real trading must account for this. Fee schedule must be verified from Kalshi's official fee page before implementing.
7. **No partial fills / order book.** Fills assume infinite liquidity at the snapshot price. Slippage modeling is future work.
8. **Simulated contestants only.** The 8 strategies are project-designed toys for engine testing. Real-strategy research (poll-aggregation, fundamentals) starts once live snapshots + poll series exist.
9. **Backtest has no real scored data yet.** Only templates + synthetic demo. First real backtest target: 2024 presidential + Senate races vs certified results (FEC/House Clerk/NARA).

## Verification

10. **Single-session verification.** All 20 entries were verified 2026-09-18. Sources drift (see 538, Monmouth): re-verify on a schedule (proposed: monthly link + freshness check via `validate_sources.py --check-live`).
11. **Search-index corroboration is weaker than direct fetch.** Three entries (SRC-004/005/016) rest on search-index observation; confirm by direct visit when possible.

## Site

12. **Static site, manual sync.** `docs/data/*` is refreshed by `scripts/sync_site_data.py`; there is no live data pipeline yet. A scheduled workflow (collector → sync → deploy) is proposed for next session.
