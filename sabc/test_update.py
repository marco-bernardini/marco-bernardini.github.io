import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

import update


class UpdateTests(unittest.TestCase):
    def sample(self):
        member = {"id": "one", "name": "Example"}
        row = {"memberId": "one", **{day: [] for day in update.DAYS}}
        row["monday"] = [{"start": "12:00", "end": "15:00"}]
        return {"members": [member], "total": 1}, {"availability": [row], "success": True}

    def test_two_bulk_requests_produce_complete_normalized_week(self):
        with patch.object(update, "fetch_json", side_effect=self.sample()) as fetch:
            data = update.collect()
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual(data["member_count"], 1)
        self.assertEqual(data["members"][0]["days"]["monday"]["available"], [
            {"start_minute": 0, "end_minute": 720}, {"start_minute": 900, "end_minute": 1440}])

    def test_missing_member_is_never_interpreted_as_available(self):
        members, bulk = self.sample()
        bulk["availability"] = []
        with patch.object(update, "fetch_json", side_effect=[members, bulk]), self.assertRaises(update.ScrapeError):
            update.collect()

    def test_duplicate_bulk_records_are_rejected(self):
        members, bulk = self.sample()
        bulk["availability"] *= 2
        with patch.object(update, "fetch_json", side_effect=[members, bulk]), self.assertRaises(update.ScrapeError):
            update.collect()

    def test_failed_fetch_leaves_previous_snapshots_intact(self):
        with tempfile.TemporaryDirectory() as directory:
            source, published = Path(directory)/"source.json", Path(directory)/"published.json"
            source.write_text("previous"); published.write_text("previous")
            with patch.object(update, "SOURCE", source), patch.object(update, "PUBLISHED", published), \
                    patch.object(update, "collect", side_effect=update.ScrapeError("network failed")), \
                    patch("sys.argv", ["update.py", "--local-only"]):
                self.assertEqual(update.main(), 1)
            self.assertEqual(source.read_text(), "previous")
            self.assertEqual(published.read_text(), "previous")


if __name__ == "__main__":
    unittest.main()
