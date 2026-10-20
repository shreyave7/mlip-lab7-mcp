/**
 * Long-Term Memory
 *
 * A simple long-term memory for the agent:
 * - The agent can save notes with the `remember` tool
 * - Each new note is integrated into the memory by an LLM, which merges related
 *   entries, removes outdated ones, and keeps the memory within a length limit
 * - The memory is a Markdown file (easy to inspect and edit by hand)
 * - The memory is included in the system prompt of every new conversation
 *
 * The memory file is shared across all conversations and all users.
 */

import { generateText } from "ai";
import type { LanguageModel, ToolSet } from "ai";
import { z } from "zod";
import { memoryMaxWords, memoryModel } from "./config.ts";

/** Tool definition offered to the LLM next to the MCP tools */
export const rememberTool: ToolSet = {
  remember: {
    description: "Save a note to long-term memory. " +
      "The memory is available in all future conversations.",
    inputSchema: z.object({
      note: z.string().describe("The information to remember"),
    }),
  },
};

/** Long-term memory stored as a Markdown file */
export class Memory {
  constructor(
    readonly path: string,
    private readonly model: LanguageModel = memoryModel,
  ) {}

  /** Return the memory, or a placeholder if it is empty */
  load(): string {
    try {
      return Deno.readTextFileSync(this.path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return "(empty)";
      throw error;
    }
  }

  /** Integrate a note into the memory using the LLM and return a confirmation for the LLM */
  async remember(note: string): Promise<string> {
    const template = Deno.readTextFileSync(
      new URL("./prompts/memory_update.md", import.meta.url),
    );
    const prompt = template
      .replace("$MAX_WORDS", () => String(memoryMaxWords))
      .replace("$NOTE", () => note)
      .replace("$MEMORY", () => this.load());

    const response = await generateText({
      model: this.model,
      messages: [{ role: "user", content: prompt }],
    });
    const updatedMemory = stripCodeFence(response.text);
    if (!updatedMemory.trim()) {
      throw new Error("Memory update failed: LLM returned an empty memory");
    }

    Deno.writeTextFileSync(this.path, updatedMemory.trim() + "\n");
    return "Saved to memory.";
  }

  /** Delete the memory */
  clear(): void {
    try {
      Deno.removeSync(this.path);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
}

/** Remove a surrounding ```markdown ... ``` fence that LLMs sometimes add */
function stripCodeFence(text: string): string {
  const lines = text.trim().split("\n");
  if (lines.length >= 2 && lines[0].startsWith("```") && lines.at(-1)!.startsWith("```")) {
    return lines.slice(1, -1).join("\n");
  }
  return lines.join("\n");
}
