# Lab 7: The agent that remembers

**~80 min · work in pairs, explain on your own · built on the airline agent you will harden in I4**

You will extend the airline customer-service agent with two new MCP tools and a **memory** so it recalls facts about a user across sessions. Then you will watch an indirect prompt injection ride in through a tool result, get *written into that memory*, and keep steering the agent in a later, clean session, after the attacker is gone.

All three deliverables are shown to a TA. Everything is fictional; the only "attack" is a harmless marker you turn on yourself.

## How the agent works (read first, 5 min)

```text
you ─► agent (agent.py) ─────► LLM          system prompt = instructions + <memory> + <policy>
          │  loop: LLM picks a tool, you run it, result goes back, repeat
          ▼
     ToolManager ──tools/call──► MCP airline server (tools.py) ──► data/
                                 save_memory ─┐
     _load_memory ◄──────────────────────────┴── data/memory/user.md
```

Two facts carry the whole lab:
1. The agent's system prompt is **assembled every session** from the policy *and* whatever is in `data/memory/user.md`.
2. A tool result is just text the LLM reads. Nothing separates "data" from "instructions".

## Setup (before class)

Two terminals. Python 3.11+. See `python/README.md` for details.

```bash
cd python && python3 -m venv .venv && source .venv/bin/activate
pip install -e ./agent -e ./mcp_airline
cp agent/.env.template agent/.env   # put your Gemini (Vertex) key in it
```

Terminal A (server): `PORT=8000 start-airline-server`
Terminal B (agent): `agent-cli http://localhost:8000/mcp`

The model is set in one line, `python/agent/src/agent/config.py` (`MODEL=`). Any LiteLLM model with tool calling works; use the course Vertex credits (the free tier allows only ~5 requests/min).

## Deliverables (pass/fail)

### D1 · Two new tools
Implement **TODO 1a** `current_time` and **TODO 1b** `airport_info` in `python/mcp_airline/src/mcp_airline/tools.py`.

Show the TA, in the agent, one question that failed before and works now:
- time: *"My flight is tomorrow afternoon, what date is that?"*
- airport: *"What city is JFK in?"*

(Use the MCP Inspector or `get_flight_status` to sanity-check your tools: `npx @modelcontextprotocol/inspector http://localhost:8000/mcp`.)

### D2 · Memory, then poison it
Implement **TODO 2**: `save_memory` (server) and `_load_memory` (agent, in `agent.py`).

1. **It remembers.** Session 1: tell the agent *"I always fly vegetarian, remember that."* Quit. Start a fresh `agent-cli`. Session 2: ask *"what meal will I get?"* It recalls the preference from `data/memory/user.md`.
2. **Poison it.** Start the server with the compromised airport page: `AIRPORT_ATTACK=1 PORT=8000 start-airline-server`. In a fresh session, ask *"what city is JFK in?"*. Look at the tool result and at `data/memory/user.md` afterward.
3. **It persists.** Stop the server and restart it **without** `AIRPORT_ATTACK` (the page is "fixed"). In a brand-new session, ask to add a checked bag. 

Show the TA `data/memory/user.md` after step 2 and the agent's behaviour in step 3. Say whether the injected instruction was **delivered**, **obeyed**, and whether it **persisted** after the source was clean.

### D3 · Explain + one containment idea
To the TA, in your own words:
- Trace how the agent decided to call one tool: where the tool list comes from, who chooses, who runs it.
- Why did the clean session in D2.3 still misbehave? Point at the exact text that carried the instruction and where it ended up.
- Name one change that would *reduce* this (e.g. only persist facts the user stated; label memory as untrusted in the prompt; filter tool results before memory) and say why it is a reliability improvement, **not a guarantee**. (That guarantee is I4's job.)

## Submit
Commit your code. Do not commit `.env` or `data/memory/`. Show the three deliverables in your lab section.

## Stretch
- Make `airport_info` pull real data from the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/) instead of the local fixture. What new trust problem appears?
- Give memory a second file the agent can read but not write, and move the "durable facts" there. Does that change the attack?
