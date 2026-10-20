import { google } from "@ai-sdk/google";
import { rateLimitedModel, RateLimiter } from "./rate_limiter.ts";

/////////////////////////////////
// Model Configuration
////////////////////////////////

// the following code can be changed to use different models
// the same or different models can be used for the different tasks; each model can have its own rate limit or share a rate limit
// by default, the same model with a shared rate limit is used for all tasks

const rateLimiter = new RateLimiter();

const defaultModel = rateLimitedModel(google("gemini-3.8-flash"), rateLimiter)

//for the agent
export const agentModel = defaultModel

//for integrating notes into the long-term memory
export const memoryModel = defaultModel

//for benchmarks
export const userSimulationModel = defaultModel
export const nlEvaluationModel = defaultModel


/////////////////////////////////
// Tau2 data configuration for benchmarking
/////////////////////////////////

export const tau2Domain = "airline" // "airline" | "mock"


export const tau2DomainDataPath = "../../data/" + tau2Domain + "/"


/////////////////////////////////
// Long-term memory
/////////////////////////////////

// Markdown file with the agent's long-term memory (relative to the working directory).
// Shared across all conversations and users.
export const memoryFile = "memory.md"

// Separate memory for benchmark runs, cleared at the start of each run
export const benchmarkMemoryFile = "benchmark_memory.md"

// Length limit for the memory, enforced by the LLM when integrating new notes
export const memoryMaxWords = 300
