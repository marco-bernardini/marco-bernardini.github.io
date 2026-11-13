"""Read SABC's weekly member availability using the same GETs as its website."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


BASE_URL = "https://sabc-woad.vercel.app"
DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "data" / "availability.json"
TIME_PATTERN = re.compile(r"(?:[01][0-9]|2[0-3]):[0-5][0-9]")


class ScrapeError(Exception):
    """An unsuccessful request or unexpected source data."""


def fetch_json(url: str, *, timeout: float = 20, attempts: int = 3) -> dict:
    """Make only GET requests, retrying transient failures with bounded backoff."""
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "SABC-availability-export/1.0"})
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=timeout) as response:
                payload = json.load(response)
            if not isinstance(payload, dict):
                raise ScrapeError("Expected a JSON object from the website")
            if payload.get("success") is False:
                raise ScrapeError(f"Website reported failure: {payload.get('error', 'unknown error')}")
            return payload
        except HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise ScrapeError(f"HTTP {exc.code} fetching {url}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            if attempt == attempts - 1:
                raise ScrapeError(f"Could not fetch {url}: {exc}") from exc
        except (ValueError, UnicodeError) as exc:
            raise ScrapeError(f"Invalid JSON from {url}") from exc
        time.sleep(2 ** attempt)
    raise ScrapeError("No request attempts configured")


def parse_time(value: object) -> int:
    if not isinstance(value, str) or not TIME_PATTERN.fullmatch(value):
        raise ScrapeError(f"Expected an HH:MM time, got {value!r}")
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


def interval(start: int, end: int) -> dict:
    return {"start_minute": start, "end_minute": end}


def normalize_day(ranges: object) -> dict:
    """Keep original exclusions and derive merged exclusions and their complement."""
    if not isinstance(ranges, list):
        raise ScrapeError("Expected a list of unavailable ranges for every day")
    raw = []
    parsed = []
    for entry in ranges:
        if not isinstance(entry, dict) or "start" not in entry or "end" not in entry:
            raise ScrapeError(f"Invalid unavailable range: {entry!r}")
        start, end = parse_time(entry["start"]), parse_time(entry["end"])
        if end <= start:
            raise ScrapeError(f"Range must end after it starts: {entry!r}")
        raw.append({"start": entry["start"], "end": entry["end"]})
        parsed.append((start, end))

    # The site's 'No availability' button stores exactly this whole-day marker.
    if len(raw) == 1 and raw[0] == {"start": "00:00", "end": "23:59"}:
        parsed = [(0, 1440)]

    merged: list[list[int]] = []
    for start, end in sorted(parsed):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])

    available = []
    cursor = 0
    for start, end in merged:
        if cursor < start:
            available.append(interval(cursor, start))
        cursor = end
    if cursor < 1440:
        available.append(interval(cursor, 1440))

    return {
        "source_unavailable": raw,
        "unavailable": [interval(start, end) for start, end in merged],
        "available": available,
    }


def validate_members(payload: dict) -> list[dict]:
    members = payload.get("members")
    if not isinstance(members, list) or not members:
        raise ScrapeError("The website returned no members; refusing to save an empty export")
    seen = set()
    result = []
    for member in members:
        if not isinstance(member, dict):
            raise ScrapeError("Invalid member in member list")
        member_id, name = member.get("id"), member.get("name")
        if not isinstance(member_id, str) or not member_id.strip():
            raise ScrapeError("Missing member ID in member list")
        if not isinstance(name, str) or not name.strip():
            raise ScrapeError(f"Missing name for member {member_id}")
        if member_id in seen:
            raise ScrapeError(f"Duplicate member ID: {member_id}")
        seen.add(member_id)
        result.append({"id": member_id, "name": name})
    if "total" in payload and payload["total"] != len(result):
        raise ScrapeError("Member count differs from website total; export may be incomplete")
    return result


def normalize_member(member: dict, payload: dict) -> dict:
    source = payload.get("availability")
    if not isinstance(source, dict) or source.get("memberId") != member["id"]:
        raise ScrapeError("Missing availability or member ID does not match the request")
    days = {}
    for day in DAYS:
        try:
            # Missing/null days are errors, never silently turned into free time.
            days[day] = normalize_day(source.get(day))
        except ScrapeError as exc:
            raise ScrapeError(f"{day}: {exc}") from exc
    return {**member, "days": days}


def scrape(base_url: str = BASE_URL, *, delay: float = 0.15,
           timeout: float = 20, local_timezone: str = "Europe/London") -> dict:
    started = datetime.now(timezone.utc).isoformat()
    base_url = base_url.rstrip("/")
    members = validate_members(fetch_json(f"{base_url}/api/get-members", timeout=timeout))
    print(f"Found {len(members)} members. Reading weekly availability...", file=sys.stderr)
    exported = []
    for index, member in enumerate(members, 1):
        time.sleep(delay)
        query = urlencode({"memberId": member["id"]})
        try:
            payload = fetch_json(f"{base_url}/api/get-rower-availability?{query}", timeout=timeout)
            exported.append(normalize_member(member, payload))
        except ScrapeError as exc:
            raise ScrapeError(f"Member {index}/{len(members)} ({member['name']}): {exc}") from exc
        print(f"[{index}/{len(members)}] {member['name']}", file=sys.stderr)

    return {
        "schema_version": 1,
        "source_url": f"{base_url}/availability",
        "scrape_started_at": started,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "timezone": local_timezone,
        "timezone_basis": "Assumed club local timezone; not supplied by the website",
        "schedule_type": "recurring_weekly",
        "interval_convention": "[start_minute, end_minute); minutes since local midnight; 1440 is end of day",
        "empty_source_day_means": "available_all_day_as_displayed_by_website; submission status unknown",
        "whole_day_unavailable_source_marker": {"start": "00:00", "end": "23:59"},
        "member_count": len(exported),
        "members": exported,
    }


def save_json(data: dict, output: Path) -> None:
    """Replace the previous snapshot only after the entire scrape succeeds."""
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=".availability-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        temporary.replace(output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def nonnegative_number(value: str) -> float:
    number = float(value)
    if not 0 <= number < float("inf"):
        raise argparse.ArgumentTypeError("must be a finite nonnegative number")
    return number


def positive_number(value: str) -> float:
    number = nonnegative_number(value)
    if number == 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="JSON destination (default: data/availability.json beside this script)")
    parser.add_argument("--base-url", default=BASE_URL, help="Website origin")
    parser.add_argument("--timezone", default="Europe/London", help="Local timezone label; does not convert the website's times")
    parser.add_argument("--delay", type=nonnegative_number, default=0.15, help="Seconds between member requests (default: 0.15)")
    parser.add_argument("--timeout", type=positive_number, default=20, help="Timeout per HTTP attempt in seconds (default: 20)")
    args = parser.parse_args()
    origin = urlsplit(args.base_url)
    if origin.scheme not in ("http", "https") or not origin.netloc or origin.query or origin.fragment or origin.path not in ("", "/"):
        parser.error("--base-url must be an http(s) origin without a path, query or fragment")
    if not args.timezone.strip():
        parser.error("--timezone must not be empty")
    try:
        data = scrape(args.base_url, delay=args.delay, timeout=args.timeout, local_timezone=args.timezone)
        save_json(data, args.output)
    except (ScrapeError, OSError) as exc:
        print(f"Export failed: {exc}\nAny previous export has been preserved.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Export cancelled. Any previous export has been preserved.", file=sys.stderr)
        return 130
    print(f"Saved {data['member_count']} members to {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
