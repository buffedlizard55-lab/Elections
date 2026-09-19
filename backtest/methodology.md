# Backtest Methodology

How this project compares forecasts/polls against verified outcomes — and flags what doesn't add up.

## 1. Principle

Every forecast is scored against **official, verified outcomes only**:
Federal results come from the FEC, the House Clerk's official statistics, and
NARA's Electoral College records (SRC-001/003/005). Polls are graded against
certified results, never against other polls.

## 2. Data contracts

- `backtest/template_predictions.csv` — one row per forecast: forecaster, race, target, date, probability, source URL.
- `backtest/template_actuals.csv` — one row per decided outcome: race, target, 0/1 outcome, decision date, official source URL.
- Probabilities live in [0, 1]. Outcomes are binary (1 = target happened).

## 3. Metrics (see `scripts/backtest.py`)

| Metric | Meaning |
|---|---|
| Brier score | Mean squared error of probabilities (lower = better) |
| Log-loss | Penalizes confident wrong forecasts (lower = better) |
| Accuracy @ 0.5 | Share of binary calls correct |
| Bias | Mean forecast − base rate (positive = systematically high) |
| Calibration table | Per 10%-bin: predicted avg vs actual event rate |

## 4. Automatic flags

- `missing-actual` — forecast with no verified outcome (unscored, listed).
- `bad-values` — probability outside [0,1] or non-binary outcome.
- `stale-forecast` — forecast older than 120 days at decision (informational).
- `extreme-miss` — |prob − outcome| > 0.8 (review candidate).

Flags are starting points for human review, recorded in `IRREGULARITIES.md` when confirmed.

## 5. Interpreting results

- Compare Brier/log-loss **within the same race set**; cross-cycle comparisons need base-rate adjustment.
- Small-n leaderboards are noisy: always show `n` next to every score.
- A poll average "missing" is not automatically an irregularity — sampling error,
  late shifts, and correlated error are normal. Flag only systematic, unexplained patterns.

## 6. What `demo-synthetic` is

`scripts/backtest.py --demo-synthetic` generates seeded fake data to test the
pipeline. Its reports are titled **SYNTHETIC DEMO DATA** and must never be
presented as findings.
