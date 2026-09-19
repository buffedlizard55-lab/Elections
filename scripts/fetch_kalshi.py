#!/usr/bin/env python3
"""Collect Kalshi market data (public endpoints only, no API key needed).

What it does
------------
1. Pages through ``GET /markets`` (``limit`` + ``cursor``) until exhausted or
   ``--max-markets`` is reached, saving the RAW responses verbatim.
2. Optionally fetches ``GET /events`` (best effort; endpoint not yet verified
   against the live docs by this project — behavior is logged, never assumed).
3. Filters client-side for politics/election markets using transparent keyword
   heuristics over verified response fields (``event_ticker``, ``title``,
   ``subtitle``) plus an operator-maintained series allowlist/
   denylist (``data/kalshi_series_allowlist.json``).
4. Writes a run-metadata log (endpoint, timestamps, counts, errors).

No prices are ever invented. If the network is unavailable, the script exits
non-zero and records the failure in the log file.

Docs: https://docs.kalshi.com/api-reference/market/get-markets
Base:  https://external-api.kalshi.com/trade-api/v2
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE = "https://external-api.kalshi.com/trade-api/v2"
USER_AGENT = "Elections-Research-Collector/1.0 (+https://github.com/)"

TITLE_KEYWORDS = [
    "election", "vote", "voter", "ballot", "senate", "house control",
    "governor", "midterm", "midterms", "presidential", "president",
    "congress", "congressional", "referendum", "mayor", "primary",
    "nominee", "nomination", "electoral", "poll", "seat", "senator",
    "representative", "gubernatorial",
]
EVENT_KEYWORDS = [
    "PRES", "ELECT", "VOTE", "SENATE", "HOUSE", "GOV", "MIDTERM",
    "CONGRESS", "BALLOT", "REFERENDUM", "MAYOR", "NOMINEE", "NOM",
    "FED", "SCOTUS", "WHITEHOUSE", "EXEC",
]


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def http_get_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {"ok": True, "status": resp.status, "data": json.loads(resp.read().decode("utf-8"))}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "error": f"HTTP {exc.code}: {exc.reason}"}
    except Exception as exc:  # URLError, timeout, TLS/SSL, bad JSON, ...
        return {"ok": False, "status": None, "error": f"{type(exc).__name__}: {exc}"}


def load_allowlist(path: Path) -> tuple[set[str], set[str]]:
    try:
        cfg = json.loads(path.read_text())
    except FileNotFoundError:
        return set(), set()
    except json.JSONDecodeError as exc:
        print(f"WARNING: allowlist file {path} is not valid JSON ({exc}); ignoring.", file=sys.stderr)
        return set(), set()
    allow = {str(s).upper() for s in cfg.get("allowlist", [])}
    deny = {str(s).upper() for s in cfg.get("denylist", [])}
    return allow, deny


def series_of(market: dict) -> str:
    """Best-effort series ticker: prefix of event_ticker before the date/code suffix.

    Kalshi tickers look like ``PRES-24`` / ``KXHARRIS...`` depending on era;
    rather than assume a scheme, we return the full event ticker upper-cased
    and let the allowlist match on either the full string or its
    dash-prefix. Transparent and auditable.
    """
    return str(market.get("event_ticker", "") or "").upper()


def match_politics(market: dict, allow: set[str], deny: set[str]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    event = series_of(market)
    title = f"{market.get('title', '')} {market.get('subtitle', '')}".lower()
    if event and event in deny:
        return False, ["denylisted-series"]
    prefix = event.split("-")[0] if "-" in event else event
    if (event and event in allow) or (prefix and prefix in allow):
        reasons.append("allowlisted-series")
    for kw in EVENT_KEYWORDS:
        if kw and kw in event:
            reasons.append(f"event-keyword:{kw}")
            break
    for kw in TITLE_KEYWORDS:
        if re.search(r"\b" + re.escape(kw) + r"s?\b", title):
            reasons.append(f"title-keyword:{kw}")
            break
    return (len(reasons) > 0, reasons)


def fetch_all_markets(base: str, limit: int, max_markets: int, delay: float, timeout: int) -> tuple[list[dict], dict]:
    markets: list[dict] = []
    cursor: str | None = None
    pages = 0
    errors: list[str] = []
    while True:
        params = {"limit": str(limit)}
        if cursor:
            params["cursor"] = cursor
        url = f"{base}/markets?{urllib.parse.urlencode(params)}"
        out = http_get_json(url, timeout=timeout)
        pages += 1
        if not out["ok"]:
            errors.append(f"page {pages}: {out['error']} (url={url})")
            break
        batch = out["data"].get("markets", [])
        markets.extend(batch)
        cursor = out["data"].get("cursor") or None
        if not cursor or len(markets) >= max_markets:
            break
        time.sleep(delay)
    meta = {"pages_fetched": pages, "errors": errors}
    return markets[:max_markets], meta


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Collect Kalshi markets (public endpoints).")
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--limit", type=int, default=200, help="page size per request (docs examples use 100; keep modest)")
    ap.add_argument("--max-markets", type=int, default=20000)
    ap.add_argument("--delay", type=float, default=0.4, help="seconds between pages")
    ap.add_argument("--timeout", type=int, default=30)
    ap.add_argument("--out-dir", default=str(REPO_ROOT / "data" / "kalshi"))
    ap.add_argument("--allowlist", default=str(REPO_ROOT / "data" / "kalshi_series_allowlist.json"))
    ap.add_argument("--status-filter", default="open",
                    help="comma-separated market statuses to keep in the filtered file "
                         "(matched against the API 'status' field; use 'ALL' to keep everything)")
    args = ap.parse_args(argv)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    allow, deny = load_allowlist(Path(args.allowlist))

    started = utcnow()
    markets, fetch_meta = fetch_all_markets(args.base_url, args.limit, args.max_markets, args.delay, args.timeout)

    # Best-effort events fetch (endpoint unverified by this project; log outcome).
    events_out = http_get_json(f"{args.base_url}/events?limit=200", timeout=args.timeout)
    events_note = ("fetched" if events_out["ok"] else f"unavailable: {events_out.get('error')}")

    statuses = {s.strip().lower() for s in args.status_filter.split(",")} if args.status_filter.upper() != "ALL" else None
    # Transparency: tally the raw status values the API actually returned so a
    # bad --status-filter choice is visible in the log instead of silently empty.
    status_tally: dict[str, int] = {}
    for m in markets:
        key = str(m.get("status", "<missing>"))
        status_tally[key] = status_tally.get(key, 0) + 1
    filtered: list[dict] = []
    for m in markets:
        if statuses is not None and str(m.get("status", "")).lower() not in statuses:
            continue
        hit, reasons = match_politics(m, allow, deny)
        if hit:
            m = dict(m)
            m["_project_filter_reasons"] = reasons
            filtered.append(m)

    raw_path = out_dir / f"markets_raw_{stamp}.json"
    filt_path = out_dir / f"markets_politics_{stamp}.json"
    raw_path.write_text(json.dumps({"capturedFrom": f"{args.base_url}/markets", "capturedAt": started,
                                    "fetched_at": started, "endpoint": f"{args.base_url}/markets",
                                    "count": len(markets), "markets": markets}, indent=1))
    filt_path.write_text(json.dumps({"capturedFrom": f"{args.base_url}/markets", "capturedAt": started,
                                     "fetched_at": started, "status_filter": args.status_filter,
                                     "filter": "client-side keywords + series allowlist (see kalshi_api.json)",
                                     "count": len(filtered), "markets": filtered}, indent=1))

    log = {
        "run_started_at": started,
        "run_finished_at": utcnow(),
        "base_url": args.base_url,
        "docs": "https://docs.kalshi.com/api-reference/market/get-markets",
        "pages_fetched": fetch_meta["pages_fetched"],
        "markets_total": len(markets),
        "status_tally_raw": status_tally,
        "markets_politics_filtered": len(filtered),
        "events_endpoint": events_note,
        "fetch_errors": fetch_meta["errors"],
        "raw_file": raw_path.name,
        "filtered_file": filt_path.name,
        "allowlist_size": len(allow),
        "denylist_size": len(deny),
        "status_filter": args.status_filter,
    }
    (out_dir / f"collection_log_{stamp}.json").write_text(json.dumps(log, indent=1))
    (out_dir / "LATEST.json").write_text(json.dumps(log, indent=1))
    print(json.dumps(log, indent=1))

    if not markets:
        print("ERROR: no markets retrieved (network unavailable or API error). See log.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
