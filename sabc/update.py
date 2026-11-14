"""Fetch SABC availability and publish it: python sabc/update.py."""
import argparse
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys

from tools.scrape_core import DAYS, ScrapeError, fetch_json, normalize_member, save_json, validate_members

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "sabc/planner/data/availability.json"
PUBLISHED = ROOT / "docs/sabc/planner/data/availability.json"
BASE = "https://sabc-woad.vercel.app"
DATA_PATHS = [str(path.relative_to(ROOT)).replace("\\", "/") for path in (SOURCE, PUBLISHED)]


def git(*args, capture=False):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None).stdout


def collect():
    started = datetime.now(timezone.utc).isoformat()
    members = validate_members(fetch_json(BASE + "/api/get-members"))
    bulk = fetch_json(BASE + "/api/get-all-rower-availability")
    rows = bulk.get("availability")
    if not isinstance(rows, list):
        raise ScrapeError("Bulk availability is missing")
    by_id = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("memberId"), str) or row["memberId"] in by_id:
            raise ScrapeError("Invalid or duplicate bulk availability record")
        by_id[row["memberId"]] = row
    exported = []
    for member in members:
        if member["id"] not in by_id:
            raise ScrapeError(f"Missing availability for {member['name']}; previous export preserved")
        exported.append(normalize_member(member, {"availability": by_id[member["id"]]}))
    return {
        "schema_version": 1, "source_url": BASE + "/availability",
        "scrape_started_at": started, "scraped_at": datetime.now(timezone.utc).isoformat(),
        "timezone": "Europe/London", "schedule_type": "recurring_weekly",
        "timezone_basis": "Assumed club local timezone; not supplied by the website",
        "interval_convention": "[start_minute, end_minute); minutes since local midnight; 1440 is end of day",
        "empty_source_day_means": "available_all_day_as_displayed_by_website; submission status unknown",
        "whole_day_unavailable_source_marker": {"start": "00:00", "end": "23:59"},
        "member_count": len(exported), "members": exported,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local-only", action="store_true", help="Update files without Git commit or push")
    args = parser.parse_args()
    try:
        if not args.local_only:
            if git("status", "--porcelain", "--untracked-files=no", capture=True).strip():
                raise ScrapeError("Commit or stash changes to tracked files first. Use --local-only to fetch without publishing.")
            if git("branch", "--show-current", capture=True).strip() != "main":
                raise ScrapeError("Run the publishing command from the main branch")
            git("pull", "--ff-only")
        print("Fetching members and bulk availability (two requests; transient failures may retry)…", flush=True)
        data = collect()
        save_json(data, SOURCE)
        save_json(data, PUBLISHED)
        print(f"Saved {data['member_count']} members. Last updated: {data['scraped_at']}")
        if not args.local_only:
            git("add", "--", *DATA_PATHS)
            git("commit", "-m", "Update SABC availability")
            git("push", "origin", "main")
            print("Pushed to GitHub. Allow GitHub Pages a few minutes to publish.")
        return 0
    except (ScrapeError, OSError, subprocess.CalledProcessError) as exc:
        print(f"Update failed: {exc}", file=sys.stderr)
        print("If a commit succeeded but the push failed, run git push origin main to retry.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
