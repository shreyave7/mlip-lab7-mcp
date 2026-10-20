"""
Tool-Calling Agent

This is the main agent implementation that:
- Maintains conversation history
- Calls the LLM to reason about the next step
- Executes tools when the LLM requests them
- Continues until the LLM provides a text response
"""

import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from .tool_manager import ToolManager
from .memory import Memory, REMEMBER_TOOL
from .config import TAU2_DOMAIN_DATA_PATH, MEMORY_FILE, agent_llm


@dataclass
class ToolCall:
    """Represents a tool call from the LLM"""
    id: str
    type: str
    function: Dict[str, Any]


@dataclass
class ModelMessage:
    """Represents a message in the conversation history"""
    role: str
    content: Optional[str] = None
    tool_calls: Optional[List[ToolCall]] = None
    tool_call_id: Optional[str] = None


def memory_note_allowed(note: str) -> bool:
    """Guardrail on what gets written to long-term memory. Starter returns True
    (screens nothing).

    TASK 3: return False for a note that should not be persisted, for example one
    that claims a fee waiver, an exemption, or staff status the user cannot grant
    themselves. This screens the OUTPUT side (what persists) rather than the tool
    descriptions Task 2 screens. A reworded note will still slip past; that is the
    point.
    """
    return True


class ToolCallingAgent:
    """
    A tool-calling agent that helps users by calling tools via MCP servers.

    The agent maintains a conversation history and repeatedly:
    1. Calls the LLM to decide what to do next
    2. Executes any tool calls the LLM requested
    3. Adds tool results back to the conversation

    This continues until the LLM provides a final text response without tool calls.
    """

    def __init__(
        self,
        tool_manager: ToolManager,
        max_steps: int = 5,
        memory_file: str = MEMORY_FILE
    ):
        """
        Initialize the agent.

        Args:
            tool_manager: Manager for MCP tools
            max_steps: Maximum reasoning steps before giving up
            memory_file: Markdown file holding the long-term memory
        """
        self.tool_manager = tool_manager
        self.max_steps = max_steps
        self.memory = Memory(memory_file)
        self.messages: List[Dict[str, Any]] = []
        self.logger = logging.getLogger("agent.messages")
        for handler in list(self.logger.handlers):
            self.logger.removeHandler(handler)
            handler.close()
        log_path = Path("messages.log")
        handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(message)s"))
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # Add system prompt to start the conversation
        self._add_to_context({
            "role": "system",
            "content": self._create_system_prompt()
        })

    def execute(self, task: str) -> str:
        """
        Execute a task using the tool-calling loop.

        Args:
            task: The user's request or question

        Returns:
            The agent's final response

        Raises:
            Exception: If max steps reached without completing the task
        """
        self._add_to_context({"role": "user", "content": task})

        # Agent loop
        for step in range(1, self.max_steps + 1):
            message = self._reason()
            text = message.get("content")
            tool_calls = message.get("tool_calls") or []

            # Empty response (neither text nor tool calls): try again
            if not text and not tool_calls:
                continue

            # Add the assistant message (text and/or tool calls) as one turn
            self._add_to_context(message)

            # Execute tool calls and add results
            for tool_call in tool_calls:
                result = self._act(tool_call)
                self._add_to_context(result)

            # Exit condition: text response without tool calls
            if not tool_calls:
                return text

        # Max steps reached
        raise RuntimeError(
            f"Maximum steps ({self.max_steps}) reached without completing the task"
        )

    def _reason(self) -> Dict[str, Any]:
        """
        Call the LLM to reason about the next step.

        Returns:
            The assistant message as a dictionary, with 'content' and/or 'tool_calls'.
            The message is kept as returned by the model, including provider-specific
            fields (e.g., Gemini thought signatures or thinking blocks) that must be
            sent back to the model in later calls.
        """
        tools = self.tool_manager.get_tools() + [REMEMBER_TOOL]

        try:
            response = agent_llm(
                self.messages,
                tools
            )

            return response.choices[0].message.model_dump(exclude_none=True)

        except Exception as e:
            self.logger.error(json.dumps({"error": str(e)}))
            raise RuntimeError("Failed to call LLM") from e

    def _act(self, tool_call: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a tool call.

        Args:
            tool_call: Tool call information from the LLM

        Returns:
            Tool message to add to conversation history
        """
        tool_name = tool_call["function"]["name"]
        tool_args_str = tool_call["function"]["arguments"]

        try:
            # Parse arguments (they come as a JSON string)
            tool_args = json.loads(tool_args_str) if isinstance(tool_args_str, str) else tool_args_str

            # Execute the tool (memory is handled by the agent, all others by MCP servers)
            if tool_name == "remember":
                if memory_note_allowed(tool_args["note"]):
                    result = self.memory.remember(tool_args["note"])
                else:
                    result = "Refused: the note was blocked by the memory guardrail (Lab 7 Task 3)."
            else:
                result = self.tool_manager.execute_tool(tool_name, tool_args)

            return {
                "role": "tool",
                "content": result,
                "tool_call_id": tool_call["id"]
            }

        except Exception as error:
            error_message = str(error)

            return {
                "role": "tool",
                "content": f"Error: {error_message}",
                "tool_call_id": tool_call["id"]
            }

    def _add_to_context(self, message: Dict[str, Any]) -> None:
        """
        Add a message to the conversation history.

        Args:
            message: Message dictionary to add
        """
        self.messages.append(message)
        self._log_message_to_context(message)

    def _log_message_to_context(self, message: Dict[str, Any]) -> None:
        """Persist message history to the log file."""
        recorded = {key: value for key, value in message.items() if value is not None}
        try:
            self.logger.info(json.dumps(recorded, ensure_ascii=False))
        except Exception:
            # Fallback: ensure logging doesn't break agent flow
            self.logger.info(str(recorded))

    def disconnect(self):
        """Disconnect from all MCP servers"""
        self.tool_manager.disconnect()

    def get_messages(self) -> List[Dict[str, Any]]:
        """Get the full conversation history"""
        return self.messages

    def _create_system_prompt(self) -> str:
        """
        Create the system prompt with instructions and policy.

        Returns:
            System prompt string
        """
        # Load policy from file
        policy_file = Path(__file__).parent / TAU2_DOMAIN_DATA_PATH / "policy.md"
        try:
            with open(policy_file, "r") as f:
                policy = f.read()
        except FileNotFoundError as exc:
            raise FileNotFoundError(
                f"Policy file not found at {policy_file}. "
                "Please ensure the policy is available before running the agent."
            ) from exc

        # Load system prompt template
        template_path = Path(__file__).parent / "prompts" / "system_prompt.txt"
        try:
            template = template_path.read_text(encoding="utf-8")
        except FileNotFoundError as exc:
            raise FileNotFoundError(
                f"System prompt template not found at {template_path}. "
                "Please ensure the template file is available before running the agent."
            ) from exc

        return template.replace("$POLICY", policy).replace("$MEMORY", self.memory.load())
