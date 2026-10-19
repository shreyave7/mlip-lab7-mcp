/**
 * Evaluator for Tau2 Benchmark Tasks
 *
 * Evaluates agent performance against expected actions and natural language assertions.
 */

import { generateText, ModelMessage } from "ai";
import { nlEvaluationModel } from "../config.ts";
import { LLMJSONParser } from 'ai-json-fixer';

const parser = new LLMJSONParser();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface Task {
  id: string;
  description?: {
    purpose: string;
    notes?: string;
  };
  user_scenario?: any;
  ticket?: string;
  initial_state?: any;
  evaluation_criteria?: {
    actions?: ExpectedAction[];
    nl_assertions?: string[];
    env_assertions?: any[];
    communicate_info?: string[];
    reward_basis?: string[];
  };
}

export interface ExpectedAction {
  action_id: string;
  name: string;
  arguments: Record<string, any>;
  compare_args?: string[];
  info?: string;
}

export interface EvaluationResult {
  task_id: string;
  success: boolean;
  actions_matched: boolean;
  nl_assertions_passed: boolean;
  details: string[];
  conversation: ModelMessage[];
}

// ============================================================================
// EVALUATOR CLASS
// ============================================================================

export class Evaluator {
  /**
   * Evaluate a task against the conversation between agent and user.
   */
  async evaluateTask(
    task: Task,
    conversation: ModelMessage[],
  ): Promise<EvaluationResult> {
    const details: string[] = [];
    let actionsMatched = true;
    let nlAssertionsPassed = true;

    // Evaluate actions if specified
    if (task.evaluation_criteria?.actions) {
      const actionResult = this.evaluateActions(
        task.evaluation_criteria.actions,
        conversation,
      );
      actionsMatched = actionResult.passed;
      details.push(...actionResult.details);
    }

    // Evaluate NL assertions if specified
    if (task.evaluation_criteria?.nl_assertions) {
      const nlResult = await this.evaluateNLAssertions(
        task.evaluation_criteria.nl_assertions,
        conversation,
      );
      nlAssertionsPassed = nlResult.passed;
      details.push(...nlResult.details);
    }

    const success = actionsMatched && nlAssertionsPassed;

    return {
      task_id: task.id,
      success,
      actions_matched: actionsMatched,
      nl_assertions_passed: nlAssertionsPassed,
      details,
      conversation,
    };
  }

  /**
   * Evaluate if expected actions were performed by checking tool calls in conversation.
   */
  private evaluateActions(
    expectedActions: ExpectedAction[],
    conversation: ModelMessage[],
  ): { passed: boolean; details: string[] } {
    const results = expectedActions.map((expected) => {
      // Look for assistant messages with tool-call content
      const found = conversation.some((msg) =>
        msg.role === "assistant" && Array.isArray(msg.content) &&
        msg.content.some((item: any) =>
          item.type === "tool-call" &&
          item.toolName === expected.name &&
          this.matchArguments(item.input, expected.arguments, expected.compare_args)
        )
      );

      return {
        found,
        detail: found
          ? `✅ Action '${expected.name}' performed`
          : `❌ Action '${expected.name}' with args ${JSON.stringify(expected.arguments)} not performed`,
      };
    });

    return {
      passed: results.every((r) => r.found),
      details: results.map((r) => r.detail),
    };
  }

  /**
   * Check if actual arguments match expected arguments.
   * If compare_args specified, only compare those fields; otherwise compare all expected fields.
   */
  private matchArguments(
    actual: Record<string, any>,
    expected: Record<string, any>,
    compareArgs?: string[],
  ): boolean {
    const keysToCompare = compareArgs || Object.keys(expected);
    return keysToCompare.every((key) => actual[key] === expected[key]);
  }

  /**
   * Evaluate natural language assertions using LLM-as-a-judge.
   * This evaluates whether the conversation satisfies the expected outcomes.
   */
  private async evaluateNLAssertions(
    nlAssertions: string[],
    conversation: ModelMessage[],
  ): Promise<{ passed: boolean; details: string[] }> {
    if (nlAssertions.length === 0) {
      return { passed: true, details: [] };
    }

    // Format conversation for LLM
    const trajectoryStr = conversation
      .filter((m) => (m.role === "assistant" || m.role === "user") && typeof m.content === "string")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const systemPrompt = `TASK
- You will be given a list of expected outcomes and a conversation that was collected during a test case run.
- The conversation is between an agent and a customer.
- Your job is to evaluate whether the agent satisfies each of the expected outcomes.
- Grade each expected outcome individually.

FORMAT
- Your response should be a JSON object with the following fields:
- \`reasoning\`: a short explanation for your classification
- \`metExpectation\`: \`true\` if the agent satisfies the expected outcomes, \`false\` otherwise
- \`expectedOutcome\`: repeat the expectation from the input that you are grading

Example response structure:
{
    "results": [
        {
            "expectedOutcome": "<one of the expected outcomes from the input>",
            "reasoning": "<reasoning trace>",
            "metExpectation": <false or true>
        }
    ]
}`;

    const userPrompt = `conversation:
${trajectoryStr}

expectedOutcomes:
${JSON.stringify(nlAssertions)}`;

    try {
      const response = await generateText({
        model: nlEvaluationModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const resultData = parser.parse(response.text);
      const results = resultData.results || [];

      const details = results.map((result: any) =>
        result.metExpectation
          ? `✅ NL assertion: "${result.expectedOutcome}" - ${result.reasoning}`
          : `❌ NL assertion: "${result.expectedOutcome}" - ${result.reasoning}`
      );

      const allMet = results.every((result: any) => result.metExpectation);

      return { passed: allMet, details };
    } catch (error) {
      console.error(`Error evaluating NL assertions: ${error}`);
      return {
        passed: false,
        details: nlAssertions.map((a) => `⚠️  Failed to evaluate: "${a}"`),
      };
    }
  }
}
