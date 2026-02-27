import type { ShippEvent } from '../shipp-types.js'
import type { ProbabilityEstimate } from './schema.js'

// Re-export so consumers can import from either location
export type { ProbabilityEstimate } from './schema.js'

/**
 * Market descriptor passed to AI clients for probability estimation.
 */
export interface MarketDescriptor {
  ticker: string
  title: string
  yesSubTitle: string
  noSubTitle: string
}

/**
 * Options used to construct any AI client.
 */
export interface AiClientOptions {
  /** API key for the provider (not required for CLI-based clients). */
  apiKey?: string | undefined
  /** Model identifier (e.g. "claude-opus-4-6", "claude-sonnet-4-20250514"). */
  model: string
  /** Sampling temperature. */
  temperature: number
}

/**
 * The contract every AI client must implement.
 *
 * An AiClient is a thin, stateless wrapper around a single AI provider/transport.
 * It knows how to turn game events + a market question into a `ProbabilityEstimate`.
 *
 * Implementations:
 *  - `AnthropicClient`  — uses the @anthropic-ai/sdk (API key required)
 *  - `ClaudeCliClient`  — shells out to the `claude` CLI (no API key required)
 */
export interface AiClient {
  /** Human-readable name shown in logs (e.g. "anthropic", "claude-cli"). */
  readonly name: string

  /**
   * Estimate the probability that the YES outcome of `market` occurs,
   * given the live `events` for the game identified by `sport` + `gameId`.
   */
  estimateProbability(
    sport: string,
    gameId: string,
    events: ShippEvent[],
    market: MarketDescriptor,
  ): Promise<ProbabilityEstimate>
}