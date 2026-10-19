"""Offline checks of the OPTIONAL LLM adapter; these never contact a model provider."""

import contextlib
import importlib.util
import io
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from connection_lab import agent

HAS_OPENAI = importlib.util.find_spec("openai") is not None


def reply(message: dict):
    from openai.types.chat import ChatCompletionMessage

    return SimpleNamespace(choices=[SimpleNamespace(message=ChatCompletionMessage.model_validate(message))])


def fake_client(*replies):
    create = AsyncMock(side_effect=list(replies))
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))), create


CLOCK = SimpleNamespace(name="current_time", description="Clock", inputSchema={"type": "object", "properties": {}})


@unittest.skipUnless(HAS_OPENAI, "Optional openai extra is not installed")
class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_multiple_calls_keep_ids_signatures_and_discovered_schemas(self):
        calls = reply({"role": "assistant", "content": None, "tool_calls": [
            {"id": "call-a", "type": "function", "function": {"name": "current_time", "arguments": "{}"},
             "extra_content": {"signature": "synthetic"}},
            {"id": "call-b", "type": "function", "function": {"name": "airport_info", "arguments": '{"code": "ORD"}'}},
        ]})
        client, create = fake_client(calls, reply({"role": "assistant", "content": "Data unavailable."}))
        schema = {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]}
        tools = [SimpleNamespace(name="airport_info", description="Test airport", inputSchema=schema), CLOCK]
        history = []
        with patch.object(agent, "invoke", new_callable=AsyncMock,
                          return_value={"ok": False, "error": "not_implemented"}) as invoke:
            with contextlib.redirect_stdout(io.StringIO()):
                await agent.run_model(None, tools, client, "offline-test-model", history, "Test", False)
        self.assertEqual(invoke.await_count, 2)
        self.assertEqual(invoke.await_args_list[1].args[3], {"code": "ORD"})
        self.assertEqual(history[2]["tool_calls"][0]["extra_content"], {"signature": "synthetic"})
        self.assertEqual([m["tool_call_id"] for m in history[3:5]], ["call-a", "call-b"])
        self.assertEqual(create.call_args_list[0].kwargs["tools"][0]["function"]["parameters"], schema)

    async def test_rate_limit_is_retried_then_succeeds(self):
        import httpx
        from openai import RateLimitError

        busy = RateLimitError("busy", response=httpx.Response(429, request=httpx.Request("POST", "https://x")),
                              body=None)
        client, create = fake_client(busy, reply({"role": "assistant", "content": "Done."}))
        with patch.object(agent, "RETRY_SECONDS", (0,)), contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()):
            await agent.run_model(None, [CLOCK], client, "offline-test-model", [], "Test", False)
        self.assertEqual(create.await_count, 2)

    async def test_finite_model_rounds(self):
        loop = {"role": "assistant", "content": None, "tool_calls": [
            {"id": "c", "type": "function", "function": {"name": "current_time", "arguments": "{}"}}]}
        client, create = fake_client(*[reply(loop) for _ in range(agent.MAX_ROUNDS)])
        with patch.object(agent, "invoke", new_callable=AsyncMock, return_value={"ok": False}):
            with self.assertRaisesRegex(RuntimeError, "Model-round limit"):
                await agent.run_model(None, [CLOCK], client, "offline-test-model", [], "Test", False)
        self.assertEqual(create.await_count, agent.MAX_ROUNDS)
