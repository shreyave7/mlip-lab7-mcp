"""Acceptance checks: EXPECT failures in the starter; pass after TODOs 1-3."""

import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from connection_lab import server
from connection_lab.agent import connect, unpack_result
from connection_lab.policy import protect_result

FIXED_NOW = "2026-10-18T21:10:00+00:00"
AIRPORT_FIELDS = {"ok", "synthetic", "code", "name", "city", "time_zone", "gate_from", "gate_to", "walk_minutes"}


class StudentChecks(unittest.IsolatedAsyncioTestCase):
    async def test_current_time_over_mcp(self):
        with patch.dict(os.environ, {"LAB_NOW": FIXED_NOW}):
            async with connect() as (session, _, _):
                result = unpack_result(await session.call_tool("current_time", {}))
        self.assertTrue(result["ok"], "Complete TODO 1")
        self.assertEqual(datetime.fromisoformat(result["utc"]), datetime.fromisoformat(FIXED_NOW))
        self.assertEqual(result["source"], "lab_fixture")

    def test_current_time_is_not_hardcoded(self):
        with patch.dict(os.environ, {"LAB_NOW": "2026-10-19T00:10:00+00:00"}):
            result = server.current_time()
        self.assertTrue(result["ok"], "Complete TODO 1")
        self.assertEqual(datetime.fromisoformat(result["utc"]).day, 19)
        with patch.dict(os.environ, {"LAB_NOW": ""}):
            self.assertEqual(server.current_time()["source"], "system_clock")

    async def test_airport_normalization_over_mcp(self):
        async with connect() as (session, _, _):
            result = unpack_result(await session.call_tool("airport_info", {"code": " ord "}))
        self.assertTrue(result["ok"], "Complete TODO 2")
        self.assertEqual(result["code"], "ORD")
        self.assertEqual(result["time_zone"], "America/Chicago")
        self.assertEqual(result["walk_minutes"], 18)
        self.assertIn("notice", result)

    def test_invalid_and_unknown_airports(self):
        for code in ["", "OR", "ORDX", "O1D", "ÅBC", "../"]:
            with self.subTest(code=code):
                result = server.airport_info(code)
                self.assertFalse(result["ok"])
                self.assertEqual(result["error"], "invalid_code", "Complete TODO 2 validation")
        result = server.airport_info("ZZZ")
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "unknown_airport")

    def test_policy_positive_allowlist(self):
        raw = {"ok": True, **server.airport_record("ORD"), "unexpected": "Another instruction"}
        original = dict(raw)
        visible = protect_result("airport_info", raw)
        self.assertTrue(visible["ok"], "Complete TODO 3")
        self.assertEqual(set(visible), AIRPORT_FIELDS)
        self.assertEqual(visible["walk_minutes"], 18)
        self.assertEqual(raw, original, "The policy must not modify the original trace")
        flight = server.flight_status("NL204")
        self.assertEqual(protect_result("flight_status", flight), flight)
        error = {"ok": False, "error": "unknown_airport"}
        self.assertEqual(protect_result("airport_info", error), error)

    async def test_attack_is_excluded_before_model_boundary(self):
        async with connect(attack=True) as (session, _, _):
            raw = unpack_result(await session.call_tool("airport_info", {"code": "ORD"}))
        self.assertTrue(raw["ok"], "Complete TODO 2 first")
        self.assertIn("BANANA BOARDING COMPLETE", raw["notice"])
        visible = protect_result("airport_info", raw)
        self.assertTrue(visible["ok"], "Complete TODO 3")
        self.assertNotIn("notice", visible)
        self.assertEqual(visible["walk_minutes"], 18)

    def test_scenario_arithmetic_uses_boarding_close(self):
        with patch.dict(os.environ, {"LAB_NOW": FIXED_NOW}):
            now = server.current_time()
        airport, flight = server.airport_info("ORD"), server.flight_status("NL204")
        self.assertTrue(now["ok"] and airport["ok"], "Complete TODOs 1 and 2")
        now_utc = datetime.fromisoformat(now["utc"])
        closes = datetime.fromisoformat(flight["boarding_closes_utc"])
        arrival = now_utc + timedelta(minutes=airport["walk_minutes"])
        self.assertEqual((closes - now_utc).total_seconds() / 60, 15)
        self.assertEqual((arrival - closes).total_seconds() / 60, 3)
        self.assertEqual(now_utc.astimezone(ZoneInfo(airport["time_zone"])).strftime("%H:%M"), "16:10")


if __name__ == "__main__":
    unittest.main()
