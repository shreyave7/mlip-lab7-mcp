// Centralized tool definitions - single source of truth
import { TaskStatus, MockDatabase } from "./types.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
  outputSchema?: {
    type: string;
    properties?: Record<string, any>;
    items?: any;
    enum?: string[];
  };
  handler: (args: any, db: MockDatabase) => any;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "create_task",
    description: "Create a new task for a user",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The ID of the user creating the task"
        },
        title: {
          type: "string",
          description: "The title of the task"
        },
        description: {
          type: "string",
          description: "Optional description of the task"
        }
      },
      required: ["user_id", "title"]
    },
    outputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["pending", "completed"] }
      }
    },
    handler: (args, db) => {
      const { user_id, title, description } = args;
      return db.createTask(user_id, title, description);
    }
  },

  {
    name: "update_task_status",
    description: "Update the status of a task",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The ID of the task to update"
        },
        status: {
          type: "string",
          enum: ["pending", "completed"],
          description: "The new status of the task"
        }
      },
      required: ["task_id", "status"]
    },
    outputSchema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: { type: "string", enum: ["pending", "completed"] }
      }
    },
    handler: (args, db) => {
      const { task_id, status } = args as { task_id: string; status: TaskStatus };
      return db.updateTaskStatus(task_id, status);
    }
  },

  {
    name: "get_users",
    description: "Get all users in the database",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    },
    outputSchema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          name: { type: "string" },
          tasks: { type: "array", items: { type: "string" } }
        }
      }
    },
    handler: (args, db) => {
      return db.getUsers();
    }
  },

  {
    name: "transfer_to_human_agents",
    description: "Transfer the user to a human agent with a summary of the issue. Only use when the user explicitly asks for human help or when you cannot solve their issue with available tools.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "A summary of the user's issue"
        }
      },
      required: ["summary"]
    },
    outputSchema: {
      type: "string"
    },
    handler: (args, db) => {
      return "Transfer successful. Your issue has been escalated to a human agent with the following summary: " + args.summary;
    }
  },

  {
    name: "assert_number_of_tasks",
    description: "Check if the number of tasks for a user matches expected count",
    inputSchema: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "The ID of the user"
        },
        expected_number: {
          type: "number",
          description: "The expected number of tasks"
        }
      },
      required: ["user_id", "expected_number"]
    },
    outputSchema: {
      type: "boolean"
    },
    handler: (args, db) => {
      const { user_id, expected_number } = args;
      return db.assertNumberOfTasks(user_id, expected_number);
    }
  },

  {
    name: "assert_task_status",
    description: "Check if the status of a task matches expected status",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "The ID of the task"
        },
        expected_status: {
          type: "string",
          enum: ["pending", "completed"],
          description: "The expected status of the task"
        }
      },
      required: ["task_id", "expected_status"]
    },
    outputSchema: {
      type: "boolean"
    },
    handler: (args, db) => {
      const { task_id, expected_status } = args as { task_id: string; expected_status: TaskStatus };
      return db.assertTaskStatus(task_id, expected_status);
    }
  },

  {
    name: "get_database_state",
    description: "Get the current database state (for debugging)",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    },
    outputSchema: {
      type: "object",
      properties: {
        tasks: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string", enum: ["pending", "completed"] }
            }
          }
        },
        users: {
          type: "object",
          additionalProperties: {
            type: "object",
            properties: {
              user_id: { type: "string" },
              name: { type: "string" },
              tasks: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    },
    handler: (args, db) => {
      return db.getState();
    }
  }
];

// Helper functions to work with tools
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find(tool => tool.name === name);
}

export function getToolList() {
  return TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}

export function executeToolCall(name: string, args: any, db: MockDatabase): any {
  const tool = getToolByName(name);
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return tool.handler(args, db);
}