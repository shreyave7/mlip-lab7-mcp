# Lab 7: A tool description is prompt text

**Start with [LAB7.md](LAB7.md).** You add one MCP tool to the airline agent below, then
see an attack hidden in a tool's *description* write a false fact into the agent's memory
and persist it into a later, clean session. The Python track (`python/`) is the lab.

---

# Agent with MCP Servers

This repository contains a very simple tool-calling agent with MCP support (Model Context Protocol)
to act as a airline customer service agent.

This project is based on the data and implementation of the [tau2-bench](https://github.com/sierra-research/tau2-bench) benchmark.

It contains both a TypeScript and a Python implementation. You can work with either.

## Prerequisites

Any model with modern OpenAI-compatible function calling abilities can be used. LiteLLM supports over 900 models (see `python/agent/supported_models.py`). You are welcome to use any models with tool calling abilities. Unless you otherwise have access to strong modern models, we strongly suggest to use the Gemini models through Vertex with the provided credits (see Canvas). You can set the used model in the `config.ts` or `config.py` file. Rate limits can be configured in the same file. Set up you API key as environment variable or in .env file.

## Project Structure

- `python/agent/` - Tool-calling agent with CLI and web UI and a benchmark implementation
- `python/mcp_airline/` - MCP server for airline domain (flights, reservations, user management), which also implements a web server to edit user profile data
- `data/` - Domain data (airline database, policies, tasks)

## Quick Start

1. Setup Environment: Create a `.env` or environment variable with your API key.
2. Start the MCP Airline Servers: The MCP servers are all implemented using the streaming http protocol, so when launched they are reachable over a URL in the format `http://localhost:[port]/mcp`. You can start multiple servers on different ports.
3. The MCP Inspector can be used to check that the server is running correctly. Run `npx @modelcontextprotocol/inspector http://localhost:3000/mcp`
4. Start the agent with the CLI or Web UI, passing the address of the MCP server as an argument.
5. Optionally, run the provided examples and evaluates success from the tau2 benchmark. For this, the user input is simulated with another LLM.


## Development Notes

- All MCP servers share data from the `data/` directory
- The airline database is loaded from `data/airline/db.json`
- The policy is in `data/airline/policy.md`
- Changes to the database through the web UI or MCP tools are in-memory only (not persisted)
