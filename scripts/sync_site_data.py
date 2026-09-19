#!/usr/bin/env python3
"""Copy data artifacts into docs/data/ for the GitHub Pages site.

The site is fully static (no build step). This script keeps the published
data files in sync with the repo's canonical data/ + contest/ outputs.
"""

from __future__ import annotations

import shutil
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

FILES = [
    ("data/master_sources.json", "docs/data/master_sources.json"),
    ("data/flagged_sources.json", "docs/data/flagged_sources.json"),
    ("data/kalshi_api.json", "docs/data/kalshi_api.json"),
    ("data/kalshi/LATEST.json", "docs/data/kalshi_latest.json"),
    ("data/verification_log.md", "docs/data/verification_log.md"),
    ("data/validation_report.json", "docs/data/validation_report.json"),
    ("contest/contestants.json", "docs/data/contestants.json"),
    ("contest/leaderboard_latest.json", "docs/data/leaderboard_latest.json"),
    ("contest/rules.md", "docs/data/contest_rules.md"),
    ("IRREGULARITIES.md", "docs/data/irregularities.md"),
    ("LIMITATIONS.md", "docs/data/limitations.md"),
    ("NEXT_SESSION.md", "docs/data/next_session.md"),
]


def main() -> int:
    synced, missing = [], []
    for src, dst in FILES:
        s, d = REPO_ROOT / src, REPO_ROOT / dst
        if not s.exists():
            missing.append(src)
            continue
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(s, d)
        synced.append(dst)
    print(f"synced={len(synced)} missing={len(missing)}")
    for m in missing:
        print(f"  MISSING (skipped): {m}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
