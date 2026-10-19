#!/usr/bin/env -S deno run --allow-all

import { Server } from "npm:@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk/types.js";
import express from "npm:express";
import type { Request, Response } from "npm:express";
import { AirlineDatabase } from "./types.ts";
import { TOOLS, getToolList, executeToolCall } from "./tools.ts";

// Initialize the airline database with tau2-bench data
let db = AirlineDatabase.createFromTau2Bench();

// Create MCP server
const server = new Server(
  {
    name: "airline-domain-server",
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
    db = AirlineDatabase.createFromTau2Bench();
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

// MCP endpoint - POST for messages
app.post('/mcp', async (req: Request, res: Response) => {
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


// Web UI endpoints
app.get('/', async (_req: Request, res: Response) => {
    try {
        const html = await Deno.readTextFile('./ui/index.html');
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        res.status(500).send('Failed to load UI');
    }
});

app.post('/api/login', async (req: Request, res: Response) => {
    try {
        const { user_id } = req.body;

        if (!user_id || typeof user_id !== 'string') {
            return res.status(400).json({ error: 'user_id is required' });
        }

        // Check if user exists (this validates the user_id)
        const user = db.getUser(user_id);

        res.json({ success: true, user_id: user.user_id });
    } catch (error) {
        res.status(404).json({
            error: error instanceof Error ? error.message : 'User not found'
        });
    }
});

app.get('/api/profile/:userId', async (req: Request, res: Response) => {
    try {
        const user_id = req.params.userId;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id is required' });
        }

        const user = db.getUser(user_id);
        res.json(user);
    } catch (error) {
        res.status(404).json({
            error: error instanceof Error ? error.message : 'User not found'
        });
    }
});

app.put('/api/profile/:userId', async (req: Request, res: Response) => {
    try {
        const user_id = req.params.userId;
        if (!user_id) {
            return res.status(400).json({ error: 'user_id is required' });
        }

        const updates = req.body;
        const user = db.getUser(user_id);

        // Update name fields if provided
        if (updates.name) {
            if (updates.name.first_name !== undefined) {
                user.name.first_name = updates.name.first_name;
            }
            if (updates.name.last_name !== undefined) {
                user.name.last_name = updates.name.last_name;
            }
        }

        // Update address fields if provided
        if (updates.address) {
            if (updates.address.address1 !== undefined) {
                user.address.address1 = updates.address.address1;
            }
            if (updates.address.address2 !== undefined) {
                user.address.address2 = updates.address.address2;
            }
            if (updates.address.city !== undefined) {
                user.address.city = updates.address.city;
            }
            if (updates.address.state !== undefined) {
                user.address.state = updates.address.state;
            }
            if (updates.address.zip !== undefined) {
                user.address.zip = updates.address.zip;
            }
            if (updates.address.country !== undefined) {
                user.address.country = updates.address.country;
            }
        }

        // Update email if provided
        if (updates.email !== undefined) {
            user.email = updates.email;
        }

        // Update saved passengers if provided
        if (updates.saved_passengers !== undefined) {
            user.saved_passengers = updates.saved_passengers;
        }

        // Update payment methods if provided
        if (updates.payment_methods !== undefined) {
            user.payment_methods = updates.payment_methods;
        }

        res.json({ success: true, user });
    } catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Update failed'
        });
    }
});

const port = parseInt(Deno.env.get("PORT") || '3000');
app.listen(port, () => {
    console.log(`✈️  MCP Server running on http://localhost:${port}/mcp`);
    console.log(`✈️  Web UI running on http://localhost:${port}/`);
}).on('error', (error: Error) => {
    console.error('Server error:', error);
    Deno.exit(1);
});
