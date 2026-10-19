import type { ToolSet } from 'ai';
import { MCPServerConnection, type MCPServerStatus } from "./mcp_client.ts";
import { convertMCPToolsToAISDK } from "./tool_converter.ts";

export class ToolManager {

  private mcpServers: MCPServerConnection[] = [];
  private tools: ToolSet = {};
  private toolToServerMap: Map<string, MCPServerConnection> = new Map();

  constructor() {
    // Start with hardcoded tools as fallback
    this.tools = {  };
  }

  /**
   * Add an MCP server and load its tools
   */
  async addMCPServer(config: string): Promise<void> {
    const server = new MCPServerConnection(config);

    try {
      await server.connect();

      // List tools from this server
      const mcpTools = await server.listTools();
      console.log(`   📋 Found ${mcpTools.length} tools from ${config}`);

      // Convert and merge tools
      const convertedTools = convertMCPToolsToAISDK(mcpTools);

      // Track which server provides which tool
      for (const toolName of Object.keys(convertedTools)) if (toolName!=="reset") {
        if (this.tools[toolName]) {
          console.warn(`   Tool '${toolName}' already exists, skipping`);
        } else {
          this.tools[toolName] = convertedTools[toolName];
          this.toolToServerMap.set(toolName, server);
        }
      }

      this.mcpServers.push(server);
      console.log(`   Connected to server ${config}, found ${Object.keys(convertedTools).length} tools: ${Object.keys(convertedTools).join(', ')}\n`);
    } catch (error) {
      console.error(`   ❌ Failed to connect to ${config}: ${error instanceof Error ? error.message : String(error)}\n`);
      throw error;
    }
  }

  /**
   * Get all available tools
   */
  getTools(): ToolSet {
    return this.tools;
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, input: Record<string, unknown>): Promise<string> {
    const mcpServer = this.toolToServerMap.get(toolName);

    if (mcpServer) {
      try {
        const result = await mcpServer.callTool(toolName, input);
        console.log(`   ✅ MCP tool result: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);
        return result;
      } catch (error) {
        throw new Error(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      const result = "Invalid tool call";
      return result;
    }
  }

  /**
   * Get status of all MCP servers
   */
  getServerStatus(): MCPServerStatus[] {
    return this.mcpServers.map(server => server.getStatus());
  }

  /**
   * Disconnect from all MCP servers
   */
  async disconnect(): Promise<void> {
    for (const server of this.mcpServers) {
      await server.disconnect();
    }
  }

  /**
   * For testing and evaluations, this will call a reset method on all connected MCP servers.
   * Returns true if all servers have the method and return true when called.
   */
  async resetAll(): Promise<boolean> {
    const results = await Promise.all(this.mcpServers.map(server => server.callTool("reset",{})));
    return results.every(result => result === "true");
  }
}
