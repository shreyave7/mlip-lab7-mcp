#!/usr/bin/env -S deno run --allow-all

import { Server } from "npm:@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "npm:express";
import { MockDatabase } from "./types.ts";
import { TOOLS, getToolList, executeToolCall } from "./tools.ts";

// Initialize the mock database with tau2-bench data
let db = MockDatabase.createFromTau2Bench();

// Create MCP server
const server = new Server(
  {
    name: "mock-domain-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools - derived from tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getToolList()
  };
});

// Handle tool calls - using centralized tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "reset") {
    db = MockDatabase.createFromTau2Bench();
    return { content: [{ type: "text", text: "true" }] };
  }

  try {
    const result = executeToolCall(name, args, db);
    
    return {
      content: [
        {
          type: "text",
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});


const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
    });

    res.on('close', () => {
        transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
});

const port = parseInt(process.env.PORT || '3000');
app.listen(port, () => {
    console.log(`MCP Server running on http://localhost:${port}/mcp`);
}).on('error', error => {
    console.error('Server error:', error);
    process.exit(1);
});