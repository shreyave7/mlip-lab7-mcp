import type { ModelMessage } from "ai";

export function logMessageToContext(message: ModelMessage): void {
  console.log(`\n📝 Adding to context [${message.role.toUpperCase()}]:`);

  if ("content" in message) {
    if (typeof message.content === "string") {
      // String content - show preview
      const preview = message.content.length > 200
        ? message.content.substring(0, 200) + "..."
        : message.content;
      console.log(`   ${preview}`);
      console.log(`   (${message.content.length} chars)`);
    } else if (Array.isArray(message.content)) {
      // Messages with content array (tool-call or tool-result)
      for (const item of message.content) {
        if ("type" in item) {
          if (item.type === "tool-call") {
            console.log(`   Tool Call: ${item.toolName}`);
            console.log(`   Args: ${JSON.stringify((item as any).args)}`);
          } else if (item.type === "tool-result") {
            console.log(`   Tool Result: ${item.toolName}`);
            if (
              "output" in item && typeof item.output === "object" &&
              item.output !== null && "value" in item.output
            ) {
              const value = String(item.output.value);
              const preview = value.length > 200
                ? value.substring(0, 200) + "..."
                : value;
              console.log(`   Result: ${preview}`);
              console.log(`   (${value.length} chars)`);
            }
          }
        }
      }
    }
  }
}
