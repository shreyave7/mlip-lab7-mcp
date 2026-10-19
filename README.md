# Lab 7 · Build and break an MCP assistant

**80 min · work together, explain on your own · Python 3.11+ · 3 TODOs · all data is fake**

**Mission:** A traveler at gate B6 (ORD) must reach C18 before NL204 boarding closes. Can they? Build the tools, plant a harmless instruction in the data, then try to filter it out.

```text
you ──question──► agent.py ──tools/call──► server.py ──► fixtures.json
                  (host)    ◄──JSON result── (MCP server: TODO 1, 2)
                     │
                  policy.py   decides what the model sees (TODO 3)
                     │
                  model       (any LLM with tool calling)
```

## Deliverables (pass/fail, show the TA)

- [ ] **D1 · Tools.** `clean` before vs after TODOs 1-2: the time and airport questions now get answered. `check` passes.
- [ ] **D2 · Injection.** Point to the instruction in the `attack` trace. Did the model follow it? Show `defend` removing it and `probe` getting past it.
- [ ] **D3 · Explain.** Trace one call: discover → select → invoke → result. Why is your filter not a *guarantee*?

## Setup (before class)

```bash
python3 lab.py setup
```

**Any LLM with tool calling works** (Gemini with course credits, OpenAI, a local Ollama model, ...). Set `LLM_MODEL` and `LLM_API_KEY` in `.env`; `.env.example` shows the base URL for each. Leave them blank and everything still runs, minus the model. Windows: use `py`.

## Workflow

| # | Min | For | Do | Run | Done when |
|---|---|---|---|---|---|
| 1 | 10 | D1 | Look around | `python3 lab.py inspect`<br>`python3 lab.py clean` | You see 3 tool schemas; 2 tools return `not_implemented` |
| 2 | 20 | D1 | **TODO 1, 2** in `connection_lab/server.py` | `python3 lab.py clean`<br>`python3 lab.py call airport_info code=O1D` | All 3 tools return `"ok": true`; the bad code returns `invalid_code` |
| 3 | 10 | D2 | Attack | `python3 lab.py attack` | MODEL-VISIBLE `notice` contains `BANANA BOARDING COMPLETE` |
| 4 | 15 | D2 | **TODO 3** in `connection_lab/policy.py` | `python3 lab.py defend` | `notice` is gone; `walk_minutes` is still there |
| 5 | 15 | D2, D3 | **Predict first.** Copy `ATTACK_NOTICE` from `server.py` onto the end of `"name"` in `connection_lab/fixtures.json` | `python3 lab.py probe` | You can explain why it got through. Then restore `"name"`. |
| 6 | 10 | all | Check, then demo to the TA | `python3 lab.py check` | 7 checks OK |

**Explore any time**
- `python3 lab.py call <tool> key=value`: one tool, no model
- `python3 lab.py chat [attack|defend]`: talk to the model
- **Stretch:** fetch real airport data from the [Wikipedia API](https://en.wikipedia.org/api/rest_v1/). What new risk does that add?

## Help

- **MCP Inspector** (optional, needs Node): `npx @modelcontextprotocol/inspector .venv/bin/python -m connection_lab.server` ([docs](https://modelcontextprotocol.io/docs/tools/inspector))
- [MCP Python SDK](https://py.sdk.modelcontextprotocol.io/v1/) · [MCP tools spec](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) · [OpenAI-style tool calling](https://platform.openai.com/docs/guides/function-calling) · [Gemini via the OpenAI API](https://ai.google.dev/gemini-api/docs/openai)
- Never commit `.env`.
