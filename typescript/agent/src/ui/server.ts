#!/usr/bin/env -S deno run --allow-all
import { ToolCallingAgent } from '../agent.ts';
import { ToolManager } from "../tool_manager.ts";

declare const Deno: any;

interface MCPServerStatus {
  config: string;
  transport: 'stdio' | 'http';
  status: 'connected' | 'failed';
  error?: string;
}

// All arguments are MCP server configurations
const mcpServers = Deno.args;
const mcpServerStatus: MCPServerStatus[] = [];

    const toolManager = new ToolManager();

 // Add each MCP server
  for (const server of mcpServers) {
      await toolManager.addMCPServer(server);
  }

  // Get updated status
  const statuses = toolManager.getServerStatus();
  mcpServerStatus.push(...statuses);


 let agent = new ToolCallingAgent(toolManager);

 const PORT = 8000;

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Serve the HTML file
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = await Deno.readTextFile('./src/ui/index.html');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Handle chat API with streaming
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    try {
      const { message } = await req.json();

      // Create a readable stream for SSE
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          const sendEvent = (type: string, data: any) => {
            const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(event));
          };

          // Capture console output and stream it
          const originalLog = console.log;
          console.log = (...args: any[]) => {
            const logMessage = args.join(' ');
            originalLog(...args);

            // Stream rate limit messages immediately
            if (logMessage.includes('⏳')) {
              sendEvent('waiting', { message: logMessage });
            }
            // Stream assistant responses
            if (logMessage.includes('🤖 Assistant:')) {
              const response = logMessage.replace('🤖 Assistant:', '').trim();
              sendEvent('response', { message: response });
            }
          };

          try {
            // Execute agent
            await agent.execute(message);

            // Send completion event
            sendEvent('done', {});
          } catch (error) {
            sendEvent('error', {
              message: error instanceof Error ? error.message : 'Unknown error'
            });
          } finally {
            // Restore console.log
            console.log = originalLog;
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Handle rate limit status API
  if (url.pathname === '/api/status' && req.method === 'GET') {
    const status = agent.getRateLimitStatus();
    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle rate limit config API
  if (url.pathname === '/api/rate-limit-config' && req.method === 'GET') {
    const config = agent.getRateLimitConfig();
    return new Response(JSON.stringify(config), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle MCP servers status API
  if (url.pathname === '/api/mcp-servers' && req.method === 'GET') {
    return new Response(JSON.stringify(mcpServerStatus), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Handle reset API
  if (url.pathname === '/api/reset' && req.method === 'POST') {
    agent = new ToolCallingAgent(agent.toolManager);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Not Found', { status: 404 });
}


console.log(`🌐 Server running at http://localhost:${PORT}\n`);
Deno.serve({ port: PORT }, handleRequest);
