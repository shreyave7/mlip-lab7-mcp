/**
 * BOILERPLATE CODE - NOT IMPORTANT FOR ASSIGNMENT
 *
 * This file converts MCP tool definitions (which use JSON Schema) into
 * AI SDK tool definitions (which use Zod schemas).
 *
 * MCP servers describe their tools using JSON Schema, but the AI SDK
 * (Vercel AI SDK) expects Zod schemas. This is just a format converter.
 *
 * The interesting agent logic is in agent.ts and tool_manager.ts.
 */

import type { ToolSet } from 'ai';
import { z } from 'zod';

/**
 * MCP Tool definition from the MCP protocol
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

/**
 * Convert a single JSON Schema property definition to a Zod schema
 * Handles: string, number, boolean, array, object, enum
 */
function jsonSchemaPropertyToZod(prop: any): z.ZodTypeAny {
  // Handle enum types
  if (prop.enum) {
    const zodEnum = z.enum(prop.enum as [string, ...string[]]);
    return prop.description ? zodEnum.describe(prop.description) : zodEnum;
  }

  // Map JSON Schema types to Zod types
  let zodType: z.ZodTypeAny;
  switch (prop.type) {
    case 'string':
      zodType = z.string();
      break;
    case 'number':
      zodType = z.number();
      break;
    case 'boolean':
      zodType = z.boolean();
      break;
    case 'array':
      zodType = z.array(z.any());
      break;
    case 'object':
      zodType = z.object({});
      break;
    default:
      zodType = z.any();
  }

  // Add description if provided
  return prop.description ? zodType.describe(prop.description) : zodType;
}

/**
 * Convert MCP tool definitions to AI SDK ToolSet format
 *
 * Takes an array of MCP tools (with JSON Schema) and returns a ToolSet
 * object suitable for use with the AI SDK (with Zod schemas).
 */
export function convertMCPToolsToAISDK(mcpTools: MCPTool[]): ToolSet {
  const toolSet: ToolSet = {};

  for (const tool of mcpTools) {
    const inputSchema = tool.inputSchema;
    const properties = inputSchema.properties || {};
    const required = inputSchema.required || [];

    // Build Zod object schema from JSON Schema properties
    const zodShape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(properties)) {
      let zodProp = jsonSchemaPropertyToZod(prop);
      // Mark as optional if not in required array
      if (!required.includes(key)) {
        zodProp = zodProp.optional();
      }
      zodShape[key] = zodProp;
    }

    // Add tool to set with converted schema
    toolSet[tool.name] = {
      description: tool.description || `Tool: ${tool.name}`,
      inputSchema: z.object(zodShape)
    };
  }

  return toolSet;
}
