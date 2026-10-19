import { google } from "npm:@ai-sdk/google";
import { rateLimitedModel, RateLimiter } from "./rate_limiter.ts";

/////////////////////////////////
// Model Configuration
////////////////////////////////

// the following code can be changed to use different models
// the same or different models can be used for the different tasks; each model can have its own rate limit or share a rate limit
// by default, the same model with a shared rate limit is used for all tasks

const rateLimiter = new RateLimiter();

const defaultModel = rateLimitedModel(google("gemini-2.5-flash-lite"), rateLimiter)

//for the agent
export const agentModel = defaultModel

//for benchmarks
export const userSimulationModel = defaultModel
export const nlEvaluationModel = defaultModel


/////////////////////////////////
// Tau2 data configuration for benchmarking
/////////////////////////////////

export const tau2Domain = "airline" // "airline" | "mock"


export const tau2DomainDataPath = "../../data/" + tau2Domain + "/"
