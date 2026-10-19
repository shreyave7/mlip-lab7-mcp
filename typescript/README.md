# Agent with MCP Servers

This repository contains a very simple tool-calling agent with MCP support (Model Context Protocol)
to act as a airline customer service agent.


## Prerequisites

- [Deno](https://deno.com/) -- runtime for TypeScript
- [Google API key](https://ai.google.dev) for Gemini model (set GOOGLE_GENERATIVE_AI_API_KEY in `.env` file in the agent directory). 

Alternatively this project can be run with other models and API keys by changing the model in `agent/src/config.ts`. Rate limites can be configured in the same file.

## Project Structure

- `agent/` - Tool-calling agent with web UI
- `mcp_airline/` - MCP server for airline domain (flights, reservations, user management)
- `mcp_taskmgr/` - additional MCP server for task management (very simple, mostly for testing)
- `data/` - Domain data (airline database, policies, tasks)

## Quick Start

### 1. Setup Environment

Create a `.env` file in the `agent/` directory:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

### 2. Start the MCP Airline Servers

The MCP servers are all implemented using the streaming http protocol, so when launched they are reachable over a URL in the format `http://localhost:[port]/mcp`


Each can be started with Deno on a different port:

```bash
cd mcp_airline
PORT=3000 deno task start:http
```

The MCP Inspector can be used to check that the server is running correctly. Run `npx @modelcontextprotocol/inspector http://localhost:3000/mcp`



Note, the Airline MCP server also has extra functionality to edit user data in the database (useful for indirect prompt injection attacks). Those can be reached in the browser at `http://localhost:3000/`. Login with user_id (e.g., `mia_li_3668`).

### 3. Start the Agent with UI

In a new terminal:

```bash
cd agent
deno task ui "http://localhost:3000/mcp"
```


This starts the agent UI on `http://localhost:8000` with the provided MCP server. You can interact with it there. It shows which MCP servers it is connected too. It also provides a lot of details on stdout for logging and debugging.

The following does the same with a command-line interface instead of the web interface:
```bash
cd agent
deno task start "http://localhost:3000/mcp"
```


You can add multiple MCP servers as arguments:
```bash
deno task ui "http://localhost:3000/mcp" "http://other-server/mcp"
```


## Running Tests/Benchmarks

This runs the provided examples and evaluates success from the tau2 benchmark. For this, the user input is simulated with another LLM.

```bash
cd agent
deno task benchmark "http://localhost:3000/mcp"
```

## Development Notes

- All MCP servers share data from the `data/` directory
- The airline database is loaded from `data/airline/db.json`
- Policy files are in `data/airline/policy.md`
- Changes to the database through the web UI or MCP tools are in-memory only (not persisted)
