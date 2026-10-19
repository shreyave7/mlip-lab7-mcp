/**
 * BOILERPLATE CODE - NOT IMPORTANT FOR ASSIGNMENT
 *
 * This file is a thin wrapper around the MCP SDK that handles:
 * - Connecting to MCP servers (via stdio or HTTP)
 * - Listing available tools from servers
 * - Calling tools with arguments
 * - Managing connection lifecycle
 *
 * This is standard integration code for working with MCP servers.
 * The interesting agent logic is in agent.ts and tool_manager.ts.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  ListToolsResultSchema,
  CallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { MCPTool } from './tool_converter.ts';

export interface MCPServerStatus {
  config: string;
  transport: 'stdio' | 'http';
  status: 'connected' | 'failed';
  error?: string;
}

/**
 * Manages connection to a single MCP server
 * Simple wrapper around the MCP SDK Client
 */
export class MCPServerConnection {
  private client: Client;
  private transport: StdioClientTransport | StreamableHTTPClientTransport;
  private readonly configString: string;
  private readonly transportType: 'stdio' | 'http';
  private isConnected = false;
  private error?: string;

  constructor(configString: string) {
    this.configString = configString;
    // Detect transport type from config string
    this.transportType = configString.startsWith('http://') || configString.startsWith('https://')
      ? 'http'
      : 'stdio';

    // Initialize MCP SDK client
    this.client = new Client(
      { name: 'react-agent-client', version: '1.0.0' },
      { capabilities: {} }
    );

    // Create appropriate transport (HTTP or stdio process)
    if (this.transportType === 'http') {
      this.transport = new StreamableHTTPClientTransport(new URL(configString));
    } else {
      const [command, ...args] = configString.split(/\s+/);
      this.transport = new StdioClientTransport({ command, args });
    }
  }

  /** Connect to the MCP server */
  async connect(): Promise<void> {
    try {
      await this.client.connect(this.transport);
      this.isConnected = true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** Request list of available tools from the server */
  async listTools(): Promise<MCPTool[]> {
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const response = await this.client.request(
      { method: 'tools/list', params: {} },
      ListToolsResultSchema
    );

    return response.tools as MCPTool[];
  }

  /** Call a tool on the server with given arguments */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    console.log(`Calling tool ${name} with args:`, args);
    if (!this.isConnected) {
      throw new Error('Client not connected');
    }

    const response = await this.client.request(
      {
        method: 'tools/call',
        params: { name, arguments: args }
      },
      CallToolResultSchema
    );

    // Extract text content from response
    return response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
  }

  /** Close connection to the server */
  async disconnect(): Promise<void> {
    await this.client.close();
    await this.transport.close();
    this.isConnected = false;
  }

  /** Get current connection status */
  getStatus(): MCPServerStatus {
    return {
      config: this.configString,
      transport: this.transportType,
      status: this.isConnected ? 'connected' : 'failed',
      error: this.error
    };
  }
}
