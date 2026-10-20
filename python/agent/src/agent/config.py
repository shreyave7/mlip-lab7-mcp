"""
Model Configuration

This file configures which LLM models to use for different tasks.
You can change the model string to use different providers (OpenAI, Anthropic, Google, etc.)
via LiteLLM, which provides a unified interface.
"""

from litellm import completion
from .rate_limiter import RateLimiter

#################################
# Model Configuration
#################################

# LiteLLM supports many providers - just change the model string:
# - OpenAI: "gpt-6-sol", "gpt-5.6", "gpt-5.5"
# - Anthropic: "anthropic/claude-opus-5-5", "anthropic/claude-sonnet-5", "anthropic/claude-haiku-4-5"
# - Google: "gemini/gemini-3.8-flash", "gemini/gemini-3.5-flash-lite"
# See: https://docs.litellm.ai/docs/providers

# Rate limiter: 5 calls per 60 seconds (1 minute)
rate_limiter = RateLimiter(max_calls=15, period=60)


@rate_limiter
def agent_llm(messages, tools):
    """
    Get the LLM completion function for the agent model.

    Rate limited to 5 calls per minute to avoid API throttling.
    Will automatically wait when limit is reached.

    Args:
        messages: List of conversation messages
        tools: List of available tools

    Returns:
        LLM completion response
    """
    has_tools = len(tools) > 0
    return completion(
                model="gemini/gemini-3.8-flash",
                messages=messages,
                tools=tools if has_tools else None,
                tool_choice="auto" if has_tools else None,
            )

# Memory function - by default uses same model as agent but without tool calling
def memory_llm(messages):
    return agent_llm(messages, tools=[])


# Benchmark functions - by default uses same model as agent but without tool calling
def benchmark_user_simulation_llm(messages):
    return agent_llm(messages, tools=[])


@rate_limiter
def benchmark_nl_evaluation_llm(messages):
    return agent_llm(messages, tools=[])



#################################
# Tau2 data configuration for benchmarking
#################################

TAU2_DOMAIN = "airline"  # "airline" | "mock"
TAU2_DOMAIN_DATA_PATH = f"../../../../data/{TAU2_DOMAIN}/"


#################################
# Long-term memory
#################################

# Markdown file with the agent's long-term memory (relative to the working directory).
# Shared across all conversations and users.
MEMORY_FILE = "memory.md"

# Separate memory for benchmark runs, cleared at the start of each run
BENCHMARK_MEMORY_FILE = "benchmark_memory.md"

# Length limit for the memory, enforced by the LLM when integrating new notes
MEMORY_MAX_WORDS = 1000
