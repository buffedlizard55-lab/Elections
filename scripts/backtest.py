#!/usr/bin/env python3
"""Backtest election forecasts against verified outcomes.

Inputs (CSV):
  predictions: forecast_id, forecaster, race_id, target, forecast_date, prob, source_url
    - prob: forecasted P(target happens), in [0, 1]
    - target: e.g. "DEM wins PA-SEN-2026" (free text, must match actuals row)
  actuals: race_id, target, outcome, decided_date, source_url
    - outcome: 1 (happened) or 0 (did not happen)

Outputs: JSON metrics + Markdown report.
Metrics per forecaster: n, Brier score, log-loss (probabilities clipped to
[1e-6, 1-1e-6]), accuracy at 0.5 threshold, bias (mean prob minus base rate),
and a 10-bin calibration table. Flags: missing actuals, extreme misses
(|prob - outcome| > 0.8), and stale forecasts (>120 days before decision).

``--demo-synthetic`` generates a seeded SYNTHETIC dataset (clearly labeled) so
the pipeline can be tested without real results. Real runs must cite official
sources (FEC, House Clerk statistics, NARA) in the source_url columns.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import random
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EPS = 1e-6
STALE_DAYS = 120


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def brier(prob: float, outcome: int) -> float:
    return (prob - outcome) ** 2


def logloss(prob: float, outcome: int) -> float:
    p = min(1 - EPS, max(EPS, prob))
    return -(outcome * math.log(p) + (1 - outcome) * math.log(1 - p))


def evaluate(predictions: list[dict], actuals: list[dict]) -> dict:
    actual_map = {(a["race_id"], a["target"]): a for a in actuals}
    per_forecaster: dict[str, list[tuple[float, int]]] = {}
    flags: list[dict] = []
    scored = 0
    for p in predictions:
        key = (p["race_id"], p["target"])
        a = actual_map.get(key)
        if a is None:
            flags.append({"type": "missing-actual", "forecast_id": p.get("forecast_id"), "race_id": p.get("race_id")})
            continue
        try:
            prob = float(p["prob"])
            outcome = int(a["outcome"])
            if not (0.0 <= prob <= 1.0 and outcome in (0, 1)):
                raise ValueError("prob/outcome out of range")
        except (ValueError, TypeError):
            flags.append({"type": "bad-values", "forecast_id": p.get("forecast_id")})
            continue
        try:
            fdate = dt.date.fromisoformat(p["forecast_date"])
            ddate = dt.date.fromisoformat(a["decided_date"])
        except (ValueError, TypeError):
            flags.append({"type": "bad-dates", "forecast_id": p.get("forecast_id")})
            continue
        age = (ddate - fdate).days
        if age > STALE_DAYS:
            flags.append({"type": "stale-forecast", "forecast_id": p.get("forecast_id"), "age_days": age})
        if abs(prob - outcome) > 0.8:
            flags.append({"type": "extreme-miss", "forecast_id": p.get("forecast_id"),
                          "prob": prob, "outcome": outcome})
        per_forecaster.setdefault(p["forecaster"], []).append((prob, outcome))
        scored += 1

    forecasters = {}
    for name, pairs in per_forecaster.items():
        n = len(pairs)
        b = sum(brier(p, o) for p, o in pairs) / n
        ll = sum(logloss(p, o) for p, o in pairs) / n
        acc = sum(1 for p, o in pairs if (p >= 0.5) == bool(o)) / n
        bias = sum(p for p, _ in pairs) / n - sum(o for _, o in pairs) / n
        bins = [{"bin": f"{i/10:.1f}-{(i+1)/10:.1f}", "n": 0, "avg_prob": 0.0, "event_rate": 0.0} for i in range(10)]
        for p, o in pairs:
            bins[min(9, int(p * 10))]["n"] += 1
        for i, blk in enumerate(bins):
            members = [(p, o) for p, o in pairs if min(9, int(p * 10)) == i]
            if members:
                blk["avg_prob"] = round(sum(p for p, _ in members) / len(members), 4)
                blk["event_rate"] = round(sum(o for _, o in members) / len(members), 4)
        forecasters[name] = {"n": n, "brier": round(b, 4), "log_loss": round(ll, 4),
                             "accuracy_at_0.5": round(acc, 4), "bias": round(bias, 4),
                             "calibration": bins}
    return {"scored": scored, "forecasters": forecasters, "flags": flags}


def render_markdown(result: dict, title: str) -> str:
    lines = [f"# {title}", "",
             f"Scored forecasts: **{result['scored']}**", "",
             "| Forecaster | n | Brier ↓ | Log-loss ↓ | Acc@0.5 | Bias |",
             "|---|---|---|---|---|---|"]
    for name, m in sorted(result["forecasters"].items(), key=lambda kv: kv[1]["brier"]):
        lines.append(f"| {name} | {m['n']} | {m['brier']} | {m['log_loss']} | "
                     f"{m['accuracy_at_0.5']} | {m['bias']} |")
    lines += ["", "## Flags", ""]
    if not result["flags"]:
        lines.append("None.")
    else:
        for fl in result["flags"]:
            lines.append(f"- `{fl['type']}`: {json.dumps(fl)}")
    lines += ["", "_Lower Brier and log-loss are better. Bias = mean forecast − base rate._", ""]
    return "\n".join(lines)


def demo_synthetic(seed: int, n_races: int = 60) -> tuple[list[dict], list[dict]]:
    rng = random.Random(seed)
    preds, acts = [], []
    for i in range(n_races):
        race = f"SYN-RACE-{i+1:03d}"
        true_p = rng.uniform(0.1, 0.9)
        outcome = 1 if rng.random() < true_p else 0
        acts.append({"race_id": race, "target": "SYN outcome A", "outcome": str(outcome),
                     "decided_date": "2026-01-01", "source_url": "synthetic://demo"})
        for forecaster, skill in (("calibrated-bot", 0.05), ("overconfident-bot", 0.25), ("coin-flip", None)):
            if skill is None:
                prob = 0.5
            else:
                prob = min(0.99, max(0.01, true_p + rng.gauss(0, skill)))
            preds.append({"forecast_id": f"SYN-{forecaster}-{i+1:03d}", "forecaster": forecaster,
                          "race_id": race, "target": "SYN outcome A",
                          "forecast_date": "2025-12-01", "prob": f"{prob:.4f}",
                          "source_url": "synthetic://demo"})
    return preds, acts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Backtest forecasts vs verified outcomes.")
    ap.add_argument("--predictions", help="predictions CSV (real mode)")
    ap.add_argument("--actuals", help="actuals CSV (real mode)")
    ap.add_argument("--demo-synthetic", action="store_true")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out-dir", default=str(REPO_ROOT / "backtest" / "reports"))
    ap.add_argument("--report-name", default="backtest_report")
    args = ap.parse_args(argv)

    if args.demo_synthetic:
        preds, acts = demo_synthetic(args.seed)
        title = "Backtest Report — SYNTHETIC DEMO DATA (not real results)"
        simulated = True
    else:
        if not (args.predictions and args.actuals):
            ap.error("--predictions and --actuals are required (or use --demo-synthetic)")
        preds, acts = read_csv(Path(args.predictions)), read_csv(Path(args.actuals))
        need_p = {"forecast_id", "forecaster", "race_id", "target", "forecast_date", "prob"}
        need_a = {"race_id", "target", "outcome", "decided_date"}
        if preds and not need_p.issubset(preds[0]):
            ap.error(f"predictions CSV missing columns: {sorted(need_p - set(preds[0]))}")
        if acts and not need_a.issubset(acts[0]):
            ap.error(f"actuals CSV missing columns: {sorted(need_a - set(acts[0]))}")
        title = "Backtest Report"
        simulated = False

    result = evaluate(preds, acts)
    result["simulated"] = simulated
    result["generated_at"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{args.report_name}.json").write_text(json.dumps(result, indent=1))
    (out_dir / f"{args.report_name}.md").write_text(render_markdown(result, title))
    print(json.dumps({k: v for k, v in result.items() if k != "forecasters"}, indent=1))
    for name, m in sorted(result["forecasters"].items(), key=lambda kv: kv[1]["brier"]):
        print(f"  {name}: n={m['n']} brier={m['brier']} logloss={m['log_loss']} acc={m['accuracy_at_0.5']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
