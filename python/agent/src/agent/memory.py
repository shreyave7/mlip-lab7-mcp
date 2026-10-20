"""
Long-Term Memory

A simple long-term memory for the agent:
- The agent can save notes with the `remember` tool
- Each new note is integrated into the memory by an LLM, which merges related
  entries, removes outdated ones, and keeps the memory within a length limit
- The memory is a Markdown file (easy to inspect and edit by hand)
- The memory is included in the system prompt of every new conversation

The memory file is shared across all conversations and all users.
"""

from pathlib import Path

from .config import MEMORY_MAX_WORDS, memory_llm


# Tool definition in OpenAI format, offered to the LLM next to the MCP tools
REMEMBER_TOOL = {
    "type": "function",
    "function": {
        "name": "remember",
        "description": (
            "Save a note to long-term memory. "
            "The memory is available in all future conversations."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "note": {
                    "type": "string",
                    "description": "The information to remember"
                }
            },
            "required": ["note"]
        }
    }
}


class Memory:
    """Long-term memory stored as a Markdown file."""

    def __init__(self, path: str):
        """
        Initialize the memory.

        Args:
            path: Path of the Markdown file holding the memory
        """
        self.path = Path(path)

    def load(self) -> str:
        """Return the memory, or a placeholder if it is empty."""
        if not self.path.exists():
            return "(empty)"
        return self.path.read_text(encoding="utf-8")

    def remember(self, note: str) -> str:
        """
        Integrate a note into the memory using the LLM.

        Args:
            note: The information to remember

        Returns:
            Confirmation message for the LLM
        """
        template_path = Path(__file__).parent / "prompts" / "memory_update.md"
        prompt = (
            template_path.read_text(encoding="utf-8")
            .replace("$MAX_WORDS", str(MEMORY_MAX_WORDS))
            .replace("$NOTE", note)
            .replace("$MEMORY", self.load())
        )

        response = memory_llm([{"role": "user", "content": prompt}])
        updated_memory = _strip_code_fence(response.choices[0].message.content or "")
        if not updated_memory.strip():
            raise RuntimeError("Memory update failed: LLM returned an empty memory")

        self.path.write_text(updated_memory.strip() + "\n", encoding="utf-8")
        return "Saved to memory."

    def clear(self) -> None:
        """Delete the memory."""
        self.path.unlink(missing_ok=True)


def _strip_code_fence(text: str) -> str:
    """Remove a surrounding ```markdown ... ``` fence that LLMs sometimes add."""
    lines = text.strip().splitlines()
    if len(lines) >= 2 and lines[0].startswith("```") and lines[-1].startswith("```"):
        lines = lines[1:-1]
    return "\n".join(lines)
