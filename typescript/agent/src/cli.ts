#!/usr/bin/env -S deno run --allow-all
import { ToolCallingAgent } from './agent.ts';
import { ToolManager } from "./tool_manager.ts";

declare const Deno: any;

async function readUserInput(prompt: string): Promise<string> {
  const buf = new Uint8Array(1024);
  await Deno.stdout.write(new TextEncoder().encode(prompt));
  const n = await Deno.stdin.read(buf);
  if (n === null) {
    return '';
  }
  return new TextDecoder().decode(buf.subarray(0, n)).trim();
}

async function main() {
  // All arguments are MCP server configurations
  const mcpServers = Deno.args;
  const toolManager = new ToolManager();

  try {

    // Log MCP server configurations
    if (mcpServers.length > 0) {
      for (const server of mcpServers) 
        await toolManager.addMCPServer(server)
    } else {
      console.log('No MCP servers configured\n');
    }

    const agent = new ToolCallingAgent(toolManager);

    // Interactive loop
    while (true) {
      console.log('\n' + '='.repeat(60));
      const userInput = await readUserInput('\n💬 You: ');

      // Check for exit commands
      if (!userInput || userInput.toLowerCase() === 'quit' || userInput.toLowerCase() === 'exit') {
        console.log('\n👋 Goodbye!\n');
        break;
      }

      // Execute the user's task
      await agent.execute(userInput);

      console.log('\n✅ Response completed');
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
