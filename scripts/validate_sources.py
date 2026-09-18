#!/usr/bin/env python3
"""Validate the master sources list.

Checks (all offline except the last):
  1. Schema validation: every entry in ``data/master_sources.json`` has the
     required fields, sane URLs, unique IDs, and an allowed verification
     status.
  2. CSV consistency: ``data/master_sources.csv`` carries the same IDs and
     primary URLs as the JSON (drift = error).
  3. Live URL checks (``--check-live``): best-effort HTTP GET per URL with a
     short timeout. Network failures are reported as ``network-unavailable``,
     distinctly from HTTP errors, so a blocked sandbox is never misreported
     as a bad URL.

Writes ``data/validation_report.json``. Exit code 0 = schema valid
(live-check failures never fail the build; they are reported).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MASTER = REPO_ROOT / "data" / "master_sources.json"
MASTER_CSV = REPO_ROOT / "data" / "master_sources.csv"
REPORT = REPO_ROOT / "data" / "validation_report.json"

REQUIRED = ["id", "name", "category", "type", "url_primary", "description",
            "access", "update_frequency", "checked_date", "verification"]
ALLOWED_STATUS = {"verified-live", "search-corroborated", "verified-exists-freshness-unconfirmed",
                  "api-plus-registry", "fetch-plus-third-party"}
ALLOWED_CATEGORIES = {"government-official", "academic", "pollster", "aggregator-analysis"}


def check_live_url(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Elections-SourceValidator/1.0"},
                                 method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return {"url": url, "outcome": "http-ok" if resp.status < 400 else f"http-{resp.status}",
                    "status": resp.status, "final_url": resp.geturl()}
    except urllib.error.HTTPError as exc:
        return {"url": url, "outcome": f"http-{exc.code}", "status": exc.code, "final_url": None}
    except Exception as exc:  # network blocked, DNS, TLS, timeout...
        return {"url": url, "outcome": "network-unavailable",
                "status": None, "final_url": None, "detail": f"{type(exc).__name__}: {exc}"}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Validate master_sources.json.")
    ap.add_argument("--check-live", action="store_true", help="also perform best-effort HTTP checks")
    ap.add_argument("--timeout", type=int, default=15)
    args = ap.parse_args(argv)

    errors: list[str] = []
    warnings: list[str] = []
    data = json.loads(MASTER.read_text())
    sources = data.get("sources", [])
    seen: set[str] = set()

    for i, s in enumerate(sources):
        where = f"entry[{i}] ({s.get('id', '?')})"
        for field in REQUIRED:
            if field not in s or s[field] in (None, ""):
                errors.append(f"{where}: missing required field '{field}'")
        sid = s.get("id", "")
        if sid in seen:
            errors.append(f"{where}: duplicate id '{sid}'")
        seen.add(sid)
        for key in ("url_primary", "url_data"):
            url = s.get(key)
            if url and not (url.startswith("https://") or url.startswith("http://")):
                errors.append(f"{where}: {key} is not an http(s) URL: {url!r}")
        if s.get("category") not in ALLOWED_CATEGORIES:
            errors.append(f"{where}: bad category {s.get('category')!r}")
        v = s.get("verification", {}) if isinstance(s.get("verification"), dict) else {}
        if v.get("status") not in ALLOWED_STATUS:
            errors.append(f"{where}: bad verification.status {v.get('status')!r}")
        if not v.get("evidence"):
            warnings.append(f"{where}: empty verification.evidence")
        try:
            dt.date.fromisoformat(str(s.get("checked_date", "")))
        except ValueError:
            errors.append(f"{where}: bad checked_date {s.get('checked_date')!r}")

    # CSV consistency: same IDs in the same order, same primary URLs.
    csv_consistent: bool | None = None
    try:
        with MASTER_CSV.open(newline="") as f:
            csv_rows = list(csv.DictReader(f))
        json_ids = [s.get("id") for s in sources]
        csv_ids = [r.get("id") for r in csv_rows]
        if json_ids != csv_ids:
            errors.append("CSV drift: csv ids differ from json ids")
            csv_consistent = False
        else:
            by_id = {s.get("id"): s for s in sources}
            mismatches = [r["id"] for r in csv_rows
                          if r.get("url_primary") != by_id[r["id"]].get("url_primary")]
            if mismatches:
                errors.append(f"CSV drift: url_primary differs for {mismatches}")
                csv_consistent = False
            else:
                csv_consistent = True
    except FileNotFoundError:
        errors.append("CSV drift: data/master_sources.csv not found")
        csv_consistent = False

    live_results: list[dict] = []
    if args.check_live:
        for s in sources:
            for key in ("url_primary", "url_data"):
                url = s.get(key)
                if url:
                    r = check_live_url(url, timeout=args.timeout)
                    r["source_id"] = s.get("id")
                    r["field"] = key
                    live_results.append(r)

    report = {
        "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "entries": len(sources),
        "csv_consistent": csv_consistent,
        "schema_errors": errors,
        "schema_warnings": warnings,
        "schema_valid": not errors,
        "live_check_performed": args.check_live,
        "live_results": live_results,
    }
    REPORT.write_text(json.dumps(report, indent=1))
    print(json.dumps({k: v for k, v in report.items() if k != "live_results"}, indent=1))
    if args.check_live:
        tally: dict[str, int] = {}
        for r in live_results:
            tally[r["outcome"]] = tally.get(r["outcome"], 0) + 1
        print("live_check_tally:", json.dumps(tally))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
