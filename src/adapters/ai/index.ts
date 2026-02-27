// AI module barrel export
//
// Consumers should import from here rather than reaching into individual files.
//
//   import { AiAdapter, type AiClient, type ProbabilityEstimate } from './adapters/ai/index.js'

export { AiAdapter, createClient, type AiProvider, type AiAdapterOptions } from './ai.js'
export { type AiClient, type AiClientOptions, type MarketDescriptor } from './client.js'
export { AnthropicClient } from './anthropic.js'
export { ClaudeCliClient, assertClaudeCliReady } from './claude.js'
export { SYSTEM_PROMPT, buildUserMessage } from './anthropic.js'
export {
  ProbabilityEstimateSchema,
  type ProbabilityEstimate,
  probabilityEstimateJsonSchema,
  probabilityEstimateJsonSchemaString,
  parseProbabilityEstimate,
} from './schema.js'