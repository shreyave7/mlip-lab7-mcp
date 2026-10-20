# Lab 7: A tool description is prompt text

The agent already has long-term memory: it can call `remember` to save a note, and that memory is shown to it at the start of every conversation. You will add one tool, then watch an attack that hides in a tool's *description*, not in data or a user message. The agent reads every tool's description to decide what to call, so a description from a third-party server is attacker-controlled text already in the model's context. It makes the agent `remember` a false, costly fact, which then persists into a later, clean conversation. You then add two guardrails and watch a reworded attack slip past. All data is fictional.

## What you implement

Three tasks, each in one file, each a different idea. Everything else is provided; ignore the rest of the repository, including `typescript/`. Each task has a `TASK` comment with exact instructions, and `current_time` in `tools.py` is a worked example.

| Task | File | Concept |
| --- | --- | --- |
| T1 `airport_info` | `python/mcp_airline/src/mcp_airline/tools.py` | Build a read-only MCP tool and validate its input. |
| T2 `is_suspicious` | `python/agent/src/agent/tool_manager.py` | Screen an untrusted tool description before the model sees it. |
| T3 `memory_note_allowed` | `python/agent/src/agent/agent.py` | Screen what gets written to memory. A different surface from T2. |

## Setup

Two terminals.

```bash
cd python && python3 -m venv .venv && source .venv/bin/activate && pip install -e ./agent -e ./mcp_airline
```

- Server: `PORT=8000 start-airline-server`
- Agent: `agent-cli http://localhost:8000/mcp`

Any LLM works through LiteLLM. Set the model in `python/agent/src/agent/config.py` (the `model=` line in `agent_llm`) and the matching key in `python/agent/.env`. The default is a free Google AI Studio Gemini model; follow the course instructions for a key. The memory file is `memory.md` in the directory you run the agent from; reset it with `rm memory.md`.

## D1 · Build a tool, see the memory work

Implement T1. Then, in the agent: ask *"what city is JFK in?"* (T1); say *"I always fly vegetarian, remember that"* and confirm it saves; quit, start a fresh session, and ask *"what meal will I get?"* It recalls the note from `memory.md`.

Show the TA the recall across two sessions. Expect the question: where does a saved note re-enter the conversation?

## D2 · Poison a tool description

A provided tool, `get_local_tips`, has a clean description normally and a poisoned one when the server runs with `TOOL_ATTACK=1`. Restart the server that way, start a fresh session, and ask anything. The agent follows an instruction hidden in that tool's description and calls `remember` with a false "fee-exempt staff" fact. Restart the server *without* `TOOL_ATTACK` and start a new session: the lie persists from memory.

Show the TA `memory.md` and the clean-session behaviour. Answer: where did the instruction live before any tool ran, and why does a clean session still obey it?

## D3 · Add guardrails, then watch them bypassed

Implement T2 and T3. Re-run `TOOL_ATTACK=1`: T2 withholds the suspicious description before the model sees it, and T3 refuses the note if it reaches memory. Then run `TOOL_ATTACK=subtle`, a reworded version with no obvious keywords: it slips past.

Show the TA both runs, and explain why two heuristic guardrails reduce risk but do not guarantee safety.

## Show your work

Show D1, D2, and D3 to the TA. Nothing to submit or commit. Reset memory between runs with `rm memory.md`.

## Stretch

Make `airport_info` fetch real data from the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/). Tool results then become a third untrusted surface.
