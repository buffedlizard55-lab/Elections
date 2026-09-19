#!/usr/bin/env python3
"""Paper-trading contest engine (Leap-style) for Kalshi politics/election markets.

Modes
----
1. ``--demo``: runs a fully SIMULATED season on seeded synthetic price paths
   to exercise the engine end-to-end. Every output is labeled simulated.
   No real Kalshi data is used or implied.
2. Real mode: ``--markets <kalshi filtered JSON> --orders <orders JSONL>
   --settlements <csv>`` replays paper orders against real snapshot prices and
   official settlement outcomes, then ranks contestants.

Contest mechanics (adapted from TradingView's "The Leap" paper-trading
competition — see contest/rules.md for the mapping):
  * equal virtual starting balances, no resets
  * simulated execution at observed prices
  * public leaderboard ranked by total equity
  * minimum active-trading days to qualify
  * auto-liquidation / settlement at season end

Kalshi contract economics modeled: binary YES/NO, $1.00 payout per contract to
the winning side. Fees are NOT modeled in v1 (configurable hook present;
see LIMITATIONS.md).
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
CONTEST_DIR = REPO_ROOT / "contest"
STARTING_CASH = 100_000.0
MIN_ACTIVE_DAYS = 5
PAYOUT = 1.0  # $1 per contract to the winning side


# ---------------------------------------------------------------- portfolios

class Portfolio:
    def __init__(self, username: str, cash: float = STARTING_CASH):
        self.username = username
        self.cash = cash
        self.positions: dict[str, dict[str, float]] = {}  # ticker -> {"yes": qty, "no": qty, "cost": $}
        self.realized = 0.0
        self.active_days: set[str] = set()
        self.trades = 0

    def buy(self, ticker: str, side: str, qty: float, price: float, day: str) -> bool:
        if side not in ("yes", "no"):
            return False
        cost = qty * price
        if cost <= 0 or qty <= 0 or not (0.0 < price < 1.0):
            return False
        if cost > self.cash + 1e-9:
            return False
        pos = self.positions.setdefault(ticker, {"yes": 0.0, "no": 0.0, "cost": 0.0})
        pos[side] += qty
        pos["cost"] += cost
        self.cash -= cost
        self.active_days.add(day)
        self.trades += 1
        return True

    def mark(self, prices: dict[str, float]) -> float:
        value = self.cash
        for ticker, pos in self.positions.items():
            px = prices.get(ticker)
            if px is None:
                continue
            value += pos["yes"] * px + pos["no"] * (1.0 - px)
        return value

    def settle(self, outcomes: dict[str, float]) -> float:
        """Settle all positions at true outcomes (1.0 = YES wins)."""
        for ticker, pos in self.positions.items():
            if ticker in outcomes:
                o = outcomes[ticker]
                proceeds = pos["yes"] * o * PAYOUT + pos["no"] * (1.0 - o) * PAYOUT
                self.cash += proceeds
                self.realized += proceeds - pos["cost"]
                pos["yes"] = pos["no"] = pos["cost"] = 0.0
        return self.cash


# ------------------------------------------------------------ demo simulator

STRATEGIES = [
    ("polls-plus-blend", "Blend of synthetic poll average + market price; buys whichever side the blend favors by >4c."),
    ("mean-reversion-fade", "Fades single-day price moves larger than 8c, betting on snap-back."),
    ("momentum-rider", "Buys the side that gained over the trailing 3 days."),
    ("hold-to-settle-favorite", "Scales into the then-favorite side every 4th day and holds to settlement."),
    ("contrarian-longshot", "Buys YES only when priced 5c-20c (cheap tails)."),
    ("volume-breakout", "Buys YES on synthetic volume spikes (>2x trailing average)."),
    ("rating-differential", "Trades toward a synthetic fundamentals 'rating' when price deviates >6c."),
    ("market-maker-lite", "Buys YES below 45c and NO-side exposure above 55c; mean-reverting inventory style."),
]


def synth_market_paths(seed: int, n_markets: int = 6, n_days: int = 22) -> tuple[dict, dict, dict]:
    """Seeded synthetic binary-market probability paths + terminal outcomes.

    Returns (paths, volumes, outcomes). Paths converge toward the outcome as
    information arrives — a deliberately simple, documented toy process.
    """
    rng = random.Random(seed)
    paths, volumes, outcomes = {}, {}, {}
    for i in range(n_markets):
        t = f"DEMO-{i+1:02d}"
        outcome = 1.0 if rng.random() < 0.5 else 0.0
        outcomes[t] = outcome
        start = rng.uniform(0.35, 0.65)
        path, vols = [], []
        for d in range(n_days):
            w = (d + 1) / n_days  # information weight grows over time
            noise = rng.gauss(0, 0.06 * (1 - w) + 0.005)
            px = min(0.97, max(0.03, (1 - w) * start + w * outcome + noise))
            path.append(round(px, 4))
            vols.append(round(rng.uniform(0.5, 1.5) * (1 + 3 * w * rng.random()), 2))
        paths[t], volumes[t] = path, vols
    return paths, volumes, outcomes


def decide(strategy: str, ticker: str, day: int, paths, volumes, ratings) -> tuple[str, float] | None:
    px = paths[ticker][day]
    if strategy == "polls-plus-blend":
        poll = ratings[ticker]  # synthetic poll average proxy
        blend = 0.5 * poll + 0.5 * px
        if blend - px > 0.04:
            return ("yes", 0.02)
        if px - blend > 0.04:
            return ("no", 0.02)
    elif strategy == "mean-reversion-fade":
        if day >= 1 and paths[ticker][day] - paths[ticker][day - 1] > 0.08:
            return ("no", 0.02)
        if day >= 1 and paths[ticker][day - 1] - paths[ticker][day] > 0.08:
            return ("yes", 0.02)
    elif strategy == "momentum-rider":
        if day >= 3 and paths[ticker][day] > paths[ticker][day - 3] + 0.03:
            return ("yes", 0.02)
        if day >= 3 and paths[ticker][day] < paths[ticker][day - 3] - 0.03:
            return ("no", 0.02)
    elif strategy == "hold-to-settle-favorite":
        # Scale into the then-favorite side every 4th day; hold everything to settlement.
        if day % 4 == 0:
            return ("yes" if px >= 0.5 else "no", 0.02)
    elif strategy == "contrarian-longshot":
        if 0.05 <= px <= 0.20:
            return ("yes", 0.01)
    elif strategy == "volume-breakout":
        if day >= 3:
            avg = sum(volumes[ticker][day - 3:day]) / 3
            if volumes[ticker][day] > 2 * avg:
                return ("yes", 0.02)
    elif strategy == "rating-differential":
        if ratings[ticker] - px > 0.06:
            return ("yes", 0.02)
        if px - ratings[ticker] > 0.06:
            return ("no", 0.02)
    elif strategy == "market-maker-lite":
        if px < 0.45:
            return ("yes", 0.01)
        if px > 0.55:
            return ("no", 0.01)
    return None


def run_demo(season: str, seed: int) -> dict:
    contestants = json.loads((CONTEST_DIR / "contestants.json").read_text())["contestants"]
    paths, volumes, outcomes = synth_market_paths(seed)
    # Stable per-market seeds (Python's hash() is salted per process — never use it for seeds).
    ratings = {}
    for t, p in paths.items():
        suffix = int("".join(ch for ch in t if ch.isdigit()) or "0")
        jitter = random.Random(seed * 1000 + suffix).gauss(0, 0.05)
        ratings[t] = min(0.9, max(0.1, p[0] + jitter))
    portfolios = {c["username"]: Portfolio(c["username"]) for c in contestants}
    strat_of = {c["username"]: c["strategy_id"] for c in contestants}
    fills: list[dict] = []
    n_days = len(next(iter(paths.values())))
    base = dt.date(2026, 10, 1)
    for d in range(n_days):
        day = (base + dt.timedelta(days=d)).isoformat()
        for t in paths:
            for c in contestants:
                u = c["username"]
                sig = decide(strat_of[u], t, d, paths, volumes, ratings)
                if not sig:
                    continue
                side, frac = sig
                pf = portfolios[u]
                equity = pf.mark({k: v[d] for k, v in paths.items()})
                qty = max(1.0, math.floor(equity * frac / paths[t][d] if side == "yes"
                                          else equity * frac / (1 - paths[t][d])))
                # cap single-trade notional at 5% of starting cash for realism
                qty = min(qty, (STARTING_CASH * 0.05) / (paths[t][d] if side == "yes" else (1 - paths[t][d])))
                qty = math.floor(qty)
                if qty < 1:
                    continue
                fill_px = paths[t][d] if side == "yes" else (1.0 - paths[t][d])
                if pf.buy(t, side, float(qty), fill_px, day):
                    fills.append({"simulated": True, "season": season, "day": day, "username": u,
                                  "strategy": strat_of[u], "ticker": t, "side": side,
                                  "qty": float(qty), "yes_price": paths[t][d]})
    # settle at true outcomes
    rows = []
    for c in contestants:
        u = c["username"]
        pf = portfolios[u]
        final_cash = pf.settle(outcomes)
        pnl = final_cash - STARTING_CASH
        rows.append({"username": u, "strategy_id": strat_of[u], "final_equity": round(final_cash, 2),
                     "pnl": round(pnl, 2), "return_pct": round(100 * pnl / STARTING_CASH, 2),
                     "trades": pf.trades, "active_days": len(pf.active_days),
                     "qualified": len(pf.active_days) >= MIN_ACTIVE_DAYS})
    rows.sort(key=lambda r: r["final_equity"], reverse=True)
    return {"simulated": True,
            "warning": "SIMULATED DATA ONLY — prices, volumes, and outcomes generated from seed "
                       f"{seed}. Not real Kalshi data. For engine testing and contest design.",
            "season": season, "seed": seed, "starting_cash": STARTING_CASH,
            "min_active_days": MIN_ACTIVE_DAYS, "outcomes": outcomes,
            "leaderboard": rows, "fills": fills}


# ---------------------------------------------------------------- real mode

def load_snapshot_prices(markets_path: Path) -> dict[str, float]:
    data = json.loads(markets_path.read_text())
    mkts = data.get("markets", data if isinstance(data, list) else [])
    prices: dict[str, float] = {}
    for m in mkts:
        t = m.get("ticker")
        if not t:
            continue
        for key in ("last_price_dollars", "yes_ask_dollars", "yes_bid_dollars"):
            try:
                px = float(m.get(key))
                if 0.0 < px < 1.0:
                    prices[t] = px
                    break
            except (TypeError, ValueError):
                continue
    return prices


def run_real(markets: Path, orders: Path, settlements: Path | None, season: str) -> dict:
    contestants = json.loads((CONTEST_DIR / "contestants.json").read_text())["contestants"]
    portfolios = {c["username"]: Portfolio(c["username"]) for c in contestants}
    prices = load_snapshot_prices(markets)
    fills, rejected = [], []
    for line in orders.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        o = json.loads(line)
        u, t = o.get("username"), o.get("ticker")
        side, qty = o.get("side"), o.get("qty")
        day = o.get("day", season)
        if u not in portfolios or t not in prices or side not in ("yes", "no"):
            rejected.append({**o, "reason": "unknown contestant/ticker/side"})
            continue
        try:
            qty = float(qty)
        except (TypeError, ValueError):
            rejected.append({**o, "reason": "bad qty"})
            continue
        px = prices[t]
        fill_px = px if side == "yes" else (1.0 - px)
        if portfolios[u].buy(t, side, qty, fill_px, day):
            fills.append({"simulated": False, "season": season, **o, "fill_yes_price": px})
        else:
            rejected.append({**o, "reason": "insufficient cash or bad price"})
    outcomes: dict[str, float] = {}
    if settlements and settlements.exists():
        with settlements.open() as f:
            for row in csv.DictReader(f):
                ticker = (row.get("ticker") or "").strip()
                if not ticker:
                    continue
                outcomes[ticker] = 1.0 if (row.get("outcome") or "").strip().lower() in ("yes", "1", "true") else 0.0
    rows = []
    for c in contestants:
        u = c["username"]
        pf = portfolios[u]
        if outcomes:
            pf.settle(outcomes)
            equity = pf.mark(prices)  # settled positions are zeroed; leftovers marked to snapshot
        else:
            equity = pf.mark(prices)
        pnl = equity - STARTING_CASH
        rows.append({"username": u, "strategy_id": c["strategy_id"],
                     "final_equity": round(equity, 2), "pnl": round(pnl, 2),
                     "return_pct": round(100 * pnl / STARTING_CASH, 2),
                     "trades": pf.trades, "active_days": len(pf.active_days),
                     "qualified": len(pf.active_days) >= MIN_ACTIVE_DAYS})
    rows.sort(key=lambda r: r["final_equity"], reverse=True)
    return {"simulated": False, "season": season, "starting_cash": STARTING_CASH,
            "min_active_days": MIN_ACTIVE_DAYS, "prices_used": len(prices),
            "settled_markets": len(outcomes), "leaderboard": rows,
            "fills": fills, "rejected": rejected}


def write_outputs(result: dict, season: str, write_latest: bool = True) -> None:
    (CONTEST_DIR / f"leaderboard_{season}.json").write_text(json.dumps(result, indent=1))
    if write_latest:
        (CONTEST_DIR / "leaderboard_latest.json").write_text(json.dumps(result, indent=1))
    with (CONTEST_DIR / f"leaderboard_{season}.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["rank", "username", "strategy_id", "final_equity", "pnl",
                                          "return_pct", "trades", "active_days", "qualified", "simulated"])
        w.writeheader()
        for i, r in enumerate(result["leaderboard"], 1):
            w.writerow({"rank": i, **r, "simulated": result["simulated"]})
    with (CONTEST_DIR / f"fills_{season}.jsonl").open("w") as f:
        for fill in result["fills"]:
            f.write(json.dumps(fill) + "\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Paper-trading contest engine.")
    ap.add_argument("--demo", action="store_true", help="run SIMULATED demo season")
    ap.add_argument("--season", default="S1-2026-10")
    ap.add_argument("--seed", type=int, default=20261001)
    ap.add_argument("--markets", help="Kalshi filtered markets JSON (real mode)")
    ap.add_argument("--orders", help="paper orders JSONL (real mode)")
    ap.add_argument("--settlements", help="settlements CSV ticker,outcome (real mode, optional)")
    ap.add_argument("--no-write-latest", action="store_true",
                    help="do not overwrite contest/leaderboard_latest.json (for test runs)")
    args = ap.parse_args(argv)
    if args.demo:
        result = run_demo(args.season, args.seed)
    else:
        if not (args.markets and args.orders):
            ap.error("--markets and --orders are required in real mode (or use --demo)")
        result = run_real(Path(args.markets), Path(args.orders),
                          Path(args.settlements) if args.settlements else None, args.season)
    write_outputs(result, args.season, write_latest=not args.no_write_latest)
    print(json.dumps({k: v for k, v in result.items() if k != "fills"}, indent=1)[:3000])
    print(f"[{'SIMULATED' if result['simulated'] else 'REAL-PRICE'}] season={args.season} "
          f"contestants={len(result['leaderboard'])} fills={len(result['fills'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
