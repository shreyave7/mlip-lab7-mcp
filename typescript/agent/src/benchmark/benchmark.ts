#!/usr/bin/env -S deno run --allow-all
/**
 * Tau2 Benchmark Runner
 *
 * Loads tasks from tau2-bench and runs evaluations using the agent with MCP server support.
 */

import { generateText, ModelMessage } from "ai";
import { ToolCallingAgent } from "../agent.ts";
import { ToolManager } from "../tool_manager.ts";
import dotenv from "dotenv";
import { tau2DomainDataPath, userSimulationModel } from "../config.ts";
import assert from "node:assert";
import { Evaluator, Task, EvaluationResult } from "./evaluator.ts";

dotenv.config();

declare const Deno: any;

// ============================================================================
// USER SIMULATOR
// ============================================================================

class UserSimulator {
  private readonly model = userSimulationModel;

  // this is the conversation from the user's side, which is similar to the agent's but will not see the internal tool messages of the agent
  private readonly userConversationHistory: ModelMessage[];

  constructor(
    simulationSystemPrompt: string,
    private userScenario: string,
  ) {
    simulationSystemPrompt;

    const systemPrompt = `${simulationSystemPrompt}

<scenario>
${this.userScenario}
</scenario>`;

    this.userConversationHistory = [{
      role: "system" as const,
      content: systemPrompt,
    }];
  }

  async generateUserResponse(agentMessage: string): Promise<string> {
    this.userConversationHistory.push({
      role: "user",
      content: agentMessage,
    });

    const response = await generateText({
      model: this.model,
      messages: this.userConversationHistory,
    });

    const userResponse = response.text;

    // Add user response to history
    this.userConversationHistory.push({
      role: "user",
      content: userResponse,
    });

    return userResponse;
  }
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

// runs the full conversation between agent and user simulator
class Orchestrator {
  // returns the full conversation from the agent's side (inc. tool calls)
  async run(
    agent: ToolCallingAgent,
    userSim: UserSimulator,
    maxTurns: number = 6,
  ): Promise<ModelMessage[]> {
    const greeting = "Hi! How can I help you today?";
    let lastUserMessage = await userSim.generateUserResponse(greeting);

    // Main conversation loop
    for (let turn = 0; turn < maxTurns; turn++) {
      try {
      const agentResponse = await agent.execute(lastUserMessage);

      // User's turn
      lastUserMessage = await userSim.generateUserResponse(agentResponse);

      if (this.isStopSignal(lastUserMessage)) {
        break;
      }
      } catch (error) {
        console.error(`Error during orchestrator run: ${error}`);
        break;
      }
    }
    return agent.getMessages();
  }

  private isStopSignal(message: string): boolean {
    return message.includes("###STOP###") ||
      message.includes("###TRANSFER###") ||
      message.includes("###OUT-OF-SCOPE###");
  }
}

// ============================================================================
// TASK UTILITIES
// ============================================================================

/**
 * Format user scenario from task data into a readable string.
 */
function formatUserScenario(task: Task): string {
  if (!task.user_scenario) {
    return "";
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(task.user_scenario)) {
    if (value !== null && value !== undefined) {
      lines.push(`${key}: ${value}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

/**
 * Filter tasks based on benchmark requirements.
 * Currently filters out tasks with initial_state and tasks without user_scenario.
 */
function filterTasks(tasks: Task[]): Task[] {
  let filtered = tasks;

  // Filter out tasks with initial_state
  const withoutInitialState = filtered.filter((t) => !t.initial_state);
  if (filtered.length !== withoutInitialState.length) {
    console.log(`🚫 Filtered out ${filtered.length - withoutInitialState.length} tasks with initial_state`);
  }
  filtered = withoutInitialState;

  // Filter out tasks without user_scenario
  const withUserScenario = filtered.filter((t) => t.user_scenario);
  if (filtered.length !== withUserScenario.length) {
    console.log(`🚫 Filtered out ${filtered.length - withUserScenario.length} tasks without user_scenario`);
  }
  filtered = withUserScenario;

  return filtered;
}

// ============================================================================
// FILE I/O
// ============================================================================

async function loadTasks(tasksPath: string): Promise<Task[]> {
  const content = await Deno.readTextFile(tasksPath);
  return JSON.parse(content);
}

async function loadTextFile(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

interface BenchmarkConfig {
  tasksPath: string;
  policyPath: string;
  simulationGuidelinesPath: string;
  mcpServers: string[];
  taskFilter?: string;
}

/**
 * Run a single task through the full agent-user simulation and evaluation pipeline.
 */
async function runSingleTask(
  task: Task,
  toolManager: ToolManager,
  simulationGuidelines: string,
  orchestrator: Orchestrator,
  evaluator: Evaluator
): Promise<EvaluationResult> {
  // Reset MCP servers before each task
  assert(await toolManager.resetAll(), "Failed to reset MCP servers");

  // Create agent
  const agent = new ToolCallingAgent(toolManager);

  // Create user simulator
  const userScenario = formatUserScenario(task);
  const userSim = new UserSimulator(simulationGuidelines, userScenario);

  // Run conversation
  const conversation = await orchestrator.run(agent, userSim);

  // Evaluate results
  return await evaluator.evaluateTask(task, conversation);
}

/**
 * Print a summary of benchmark results.
 */
function printSummary(results: EvaluationResult[]) {
  console.log(`\n${"=".repeat(80)}`);
  console.log("SUMMARY");
  console.log(`${"=".repeat(80)}`);

  const passed = results.filter((r) => r.success).length;
  const total = results.length;

  console.log(`\nTotal: ${total} tasks`);
  console.log(`Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${total - passed}\n`);

  for (const result of results) {
    const icon = result.success ? "✅" : "❌";
    console.log(`${icon} ${result.task_id}`);
  }

  console.log("");
}

/**
 * Main benchmark runner function.
 */
async function runBenchmark(config: BenchmarkConfig) {
  console.log("🚀 Starting Tau2 Benchmark\n");

  // Load resources
  let tasks = await loadTasks(config.tasksPath);
  const policy = await loadTextFile(config.policyPath);
  const simulationGuidelines = await loadTextFile(config.simulationGuidelinesPath);

  console.log(`📋 Loaded ${tasks.length} tasks`);

  // Initialize tool manager
  const toolManager = new ToolManager();
  for (const server of config.mcpServers) {
    await toolManager.addMCPServer(server);
  }

  // Filter tasks
  tasks = filterTasks(tasks);

  // Apply user filter if specified
  const tasksToRun = config.taskFilter
    ? tasks.filter((t) => t.id.includes(config.taskFilter!))
    : tasks;

  console.log(`🎯 Running ${tasksToRun.length} tasks\n`);

  // Initialize shared components
  const orchestrator = new Orchestrator();
  const evaluator = new Evaluator();
  const results: EvaluationResult[] = [];

  // Run each task
  for (let i = 0; i < tasksToRun.length; i++) {
    const task = tasksToRun[i];

    // Print task header
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Task ${i + 1}/${tasksToRun.length}: ${task.id}`);
    console.log(`${"=".repeat(80)}`);
    if (task.description) {
      console.log(`Purpose: ${task.description.purpose}`);
    }

    try {
      // Run task
      const result = await runSingleTask(
        task,
        toolManager,
        simulationGuidelines,
        orchestrator,
        evaluator
      );
      results.push(result);

      // Print result
      console.log(`\n📊 Evaluation Result:`);
      console.log(`   Success: ${result.success ? "✅" : "❌"}`);
      for (const detail of result.details) {
        console.log(`   ${detail}`);
      }

    } catch (error) {
      console.error(`\n❌ Error running task: ${error}`);
      results.push({
        task_id: task.id,
        success: false,
        actions_matched: false,
        nl_assertions_passed: false,
        details: [`Error: ${error}`],
        conversation: [],
      });
      throw error;
    }
  }

  // Print summary
  printSummary(results);
}

// ============================================================================
// CLI
// ============================================================================

if (import.meta.main) {
  const args = Deno.args;

  if (args.length === 0) {
    console.log("Usage: benchmark.ts [MCP_SERVER...]");
    console.log("");
    console.log("Example:");
    console.log(
      '  deno run -A benchmark.ts "http://localhost:3000/mcp"',
    );
    console.log("");
    console.log("Environment variables:");
    console.log("  TASK_FILTER - Filter tasks by ID substring");
    Deno.exit(1);
  }

  const config: BenchmarkConfig = {
    tasksPath: tau2DomainDataPath + "tasks.json",
    policyPath: tau2DomainDataPath + "policy.md",
    simulationGuidelinesPath:
      "src/benchmark/simulation_guidelines.md",
    mcpServers: args,
    taskFilter: Deno.env.get("TASK_FILTER"),
  };

  await runBenchmark(config);
}
