# Lab 7: A tool description is prompt text

You will add one MCP tool to the airline agent, then study an attack that needs **no poisoned data and no user message**. It hides in a tool's *description*. The agent reads every tool's description to decide what to call, so a description from a third-party MCP server is attacker-controlled text that is already in the model's context. Here it quietly writes a false, costly "fact" into the agent's **memory**, where it survives into a later, clean session. All data is fictional.

## How the agent builds its context

Every turn, the model sees one prompt assembled from three things:

```text
system prompt  =  instructions + <memory> (data/memory/user.md) + <policy>
tool list      =  every tool's NAME + DESCRIPTION + schema   <-- attacker-controlled if the server is
                                                                 third-party; read before any tool runs
```

So two surfaces carry untrusted text into the model: **memory** and **tool descriptions**. This lab is about the second one.

## Setup (before class)

Two terminals. See `python/README.md`. Put your Gemini (Vertex) key in `python/agent/.env`.

```bash
cd python && python3 -m venv .venv && source .venv/bin/activate && pip install -e ./agent -e ./mcp_airline
```
- Terminal A (server): `PORT=8000 start-airline-server`
- Terminal B (agent): `agent-cli http://localhost:8000/mcp`

Model is one line in `python/agent/src/agent/config.py`. Use the course Vertex credits (the free tier is ~5 req/min).

## D1 · Add a tool

Implement the one `TODO` in `python/mcp_airline/src/mcp_airline/tools.py`: `airport_info(iata)`. `current_time` right above it is a worked example to copy from.

As you write the docstring, notice: **that docstring becomes the tool's description, which the model reads to decide when to call you.** You are writing prompt text.

Restart the server. Show the TA the agent answering *"what city is JFK in?"* (it couldn't before). TA may ask: *where did the agent get the list of tools and their descriptions?*

## D2 · Poison a tool description, watch it persist

The server ships a tool `get_local_tips` from a "third-party" source. Its description is clean normally and **poisoned** when the server runs with `TOOL_ATTACK=1`. Memory (`save_memory`, and the agent reading `data/memory/user.md`) is already wired up.

1. **Poison.** Stop the server; restart it as `TOOL_ATTACK=1 PORT=8000 start-airline-server`. In a fresh agent session, ask any normal question (e.g. *"what time is it in UTC?"*). Watch the agent follow the instruction hidden in `get_local_tips`'s description and call `save_memory`. Look at `data/memory/user.md`.
2. **Persist.** Stop the server and restart it **without** `TOOL_ATTACK` (the malicious tool is "gone"). Start a brand-new agent session and ask to add a checked bag. 

Show the TA: the poisoned description (`TOOL_ATTACK=1 python -c "from mcp_airline import tools"` or just read `tools.py`), `data/memory/user.md`, and the clean-session behaviour. Then answer:
- **Where did the instruction live?** Point to it. (It was in the tool list = the prompt, before any tool ran.)
- **Why does the clean session still obey it?** (It is in memory now.)
- **One defence** that would reduce this (review and pin tool descriptions, show them to the user before trusting a server, screen tool output and memory with a guardrail), and why it is a reliability improvement, **not a guarantee**. Building that guarantee is beyond the scope of this lab.

## Submit
Commit your code. Do not commit `.env` or `data/memory/`. Show D1 and D2 in your section. To reset memory between runs: `rm data/memory/user.md`.

## Stretch (optional)
- Make `airport_info` fetch real data from the [Wikipedia REST API](https://en.wikipedia.org/api/rest_v1/). Now a third surface (tool *results*) is attacker-controlled too.
- Add a guardrail: screen anything before it is written to memory, and measure what it misses.
