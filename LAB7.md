# Lab 7: A tool description is prompt text

You make four small changes to an airline support agent, then watch an attack that hides in a tool's *description* rather than in data or a user message. The agent reads every tool's description to decide what to call, so a description from a third-party server is attacker-controlled text already in the model's context. It writes a false fact into the agent's memory, which survives into a later, clean session. All data is fictional.

## What you implement

Four tasks, each in one file, each a different idea. Everything else is provided; ignore the rest of the repository, including `typescript/`. Every task is marked with a `TASK` comment giving exact instructions, and `current_time` in `tools.py` is a worked example.

| Task | File | Concept |
| --- | --- | --- |
| T1 `airport_info` | `python/mcp_airline/src/mcp_airline/tools.py` | Define a read-only MCP tool and validate its input. |
| T2 `save_memory` | same file | A tool that changes state (writes to disk), not just one that reads. |
| T3 `_load_memory` | `python/agent/src/agent/agent.py` | How the agent builds its prompt: saved state re-enters every session. |
| T4 `is_suspicious` | `python/agent/src/agent/tool_manager.py` | A host-side guardrail on tool descriptions, and why a filter is not a guarantee. |

## Setup

Two terminals.

```bash
cd python && python3 -m venv .venv && source .venv/bin/activate && pip install -e ./agent -e ./mcp_airline
```

- Server: `PORT=8000 start-airline-server`
- Agent: `agent-cli http://localhost:8000/mcp`

Any LLM works through LiteLLM. Set `MODEL` in `python/agent/src/agent/config.py` and the matching key in `python/agent/.env`. The default is a free Google AI Studio Gemini model, chosen only because it needs no payment (its free tier allows about 5 requests per minute).

## D1 · Build the agent (T1, T2, T3)

Implement T1, T2, and T3. Then check them in the agent: ask *"what city is JFK in?"* (T1); say *"I always fly vegetarian, remember that"* and confirm it saves (T2); quit, start a fresh session, and ask *"what meal will I get?"* It recalls the note from `data/memory/user.md` (T3).

Show the TA the recall across two sessions. Expect the question: where does a saved note re-enter the conversation?

## D2 · Poison a tool description

A provided tool, `get_local_tips`, has a clean description normally and a poisoned one when the server runs with `TOOL_ATTACK=1`. Restart the server that way, start a fresh session, and ask anything. The agent follows an instruction hidden in that tool's description and calls `save_memory` with a false "fee-exempt staff" fact. Restart the server *without* `TOOL_ATTACK` and start a new session: the lie persists from memory.

Show the TA `data/memory/user.md` and the clean-session behaviour. Answer: where did the instruction live before any tool ran, and why does a clean session still obey it?

## D3 · Add a guardrail, then watch it bypassed (T4)

Implement T4 so the agent withholds a suspicious tool description before the model sees it. Re-run `TOOL_ATTACK=1`: the blunt description is now blocked. Then run `TOOL_ATTACK=subtle`, a reworded version with no obvious keywords: it slips past your filter.

Show the TA both runs, and explain why your guardrail reduces risk but does not guarantee safety.

## Show your work

Show D1, D2, and D3 to the TA. Nothing to submit or commit. Reset memory between runs with `rm data/memory/user.md`.

## Stretch

Make `airport_info` fetch real data from the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/). Tool results then become a third untrusted surface.
