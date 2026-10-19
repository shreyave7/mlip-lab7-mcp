"""Starter checks: these should pass before and after the three TODOs."""

import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from connection_lab import server
from connection_lab.agent import connect, unpack_result


class StarterTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_stdio_discovery_and_provided_tool(self):
        async with connect() as (session, tools, protocol):
            self.assertTrue(protocol)
            schemas = {t.name: t.inputSchema for t in tools}
            self.assertTrue({"flight_status", "current_time", "airport_info"} <= set(schemas))
            self.assertEqual(schemas["airport_info"]["required"], ["code"])
            flight = unpack_result(await session.call_tool("flight_status", {"flight_number": " nl204 "}))
            self.assertTrue(flight["ok"])
            self.assertEqual(flight["gate"], "C18")
            self.assertTrue(flight["synthetic"])

    async def test_mcp_argument_validation_and_unknown_flight(self):
        async with connect() as (session, _, _):
            missing = await session.call_tool("airport_info", {})
            self.assertTrue(missing.isError)
            unknown = unpack_result(await session.call_tool("flight_status", {"flight_number": "ZZ999"}))
            self.assertFalse(unknown["ok"])
            self.assertEqual(unknown["error"], "unknown_flight")

    def test_clock_helper_handles_fixture_real_time_and_bad_offset(self):
        with patch.dict(os.environ, {"LAB_NOW": "2026-10-18T16:10:00-05:00"}):
            self.assertEqual(server.utc_now().isoformat(), "2026-10-18T21:10:00+00:00")
        with patch.dict(os.environ, {"LAB_NOW": ""}):
            self.assertLess(abs((server.utc_now() - datetime.now(timezone.utc)).total_seconds()), 2)
        with patch.dict(os.environ, {"LAB_NOW": "2026-10-18T16:10:00"}):
            with self.assertRaises(ValueError):
                server.utc_now()

    def test_attack_helper_changes_only_notice(self):
        with patch.object(server, "ATTACK", False):
            clean = server.airport_record("ORD")
        with patch.object(server, "ATTACK", True):
            poisoned = server.airport_record("ORD")
        self.assertIn("BANANA BOARDING COMPLETE", poisoned["notice"])
        self.assertNotIn("BANANA BOARDING COMPLETE", clean["notice"])
        self.assertEqual({k: v for k, v in clean.items() if k != "notice"},
                         {k: v for k, v in poisoned.items() if k != "notice"})


if __name__ == "__main__":
    unittest.main()
