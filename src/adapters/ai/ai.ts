import type { Context } from '../../ctx.js'
import { Logs, Severity } from '../../log.js'
import type { ShippEvent } from '../shipp-types.js'
import type { AiClient, AiClientOptions, MarketDescriptor, ProbabilityEstimate } from './client.js'
import { AnthropicClient } from './anthropic.js'
import { ClaudeCliClient, assertClaudeCliReady } from './claude.js'

export type AiProvider = 'anthropic' | 'claude-cli'

export interface AiAdapterOptions {
  provider: AiProvider
  model: string
  temperature: number
  apiKey?: string | undefined
}

/**
 * Create the appropriate `AiClient` implementation for the given provider.
 *
 * This is the single place where provider → client mapping lives.
 * Adding a new provider means:
 *   1. Create a new `XyzClient` class implementing `AiClient`
 *   2. Add a case here
 *   3. Add the provider name to the `AiProvider` union + Zod enum in config.ts
 */
export async function createClient(opts: AiAdapterOptions): Promise<AiClient> {
  const clientOpts: AiClientOptions = {
    apiKey: opts.apiKey,
    model: opts.model,
    temperature: opts.temperature,
  }

  switch (opts.provider) {
    case 'anthropic':
      return new AnthropicClient(clientOpts)

    case 'claude-cli':
      await assertClaudeCliReady()
      return new ClaudeCliClient(clientOpts)

    default: {
      const _exhaustive: never = opts.provider
      throw new Error(`Unknown AI provider: ${String(_exhaustive)}`)
    }
  }
}

/**
 * High-level AI adapter used by the trading loop.
 *
 * Wraps any `AiClient` implementation and adds:
 *  - Structured logging (via the `Logs` base class)
 *  - Probability clamping to [0, 1] as a safety net
 *
 * Consumers never interact with `AiClient` directly — they go through
 * this adapter so logging and guardrails are always applied.
 */
export class AiAdapter extends Logs {
  constructor(
    ctx: Context,
    private readonly client: AiClient,
  ) {
    super(ctx)
  }

  /** The underlying client's name (e.g. "anthropic", "claude-cli"). */
  get providerName(): string {
    return this.client.name
  }

  /**
   * Convenience factory: parse options, build the right client, and return
   * a fully wired `AiAdapter`.
   */
  static async create(ctx: Context, opts: AiAdapterOptions): Promise<AiAdapter> {
    const client = await createClient(opts)
    return new AiAdapter(ctx, client)
  }

  async estimateProbability(
    sport: string,
    gameId: string,
    events: ShippEvent[],
    market: MarketDescriptor,
  ): Promise<ProbabilityEstimate> {
    this.log(
      Severity.INF,
      `[${this.client.name}] Estimating probability for ${market.ticker}: ${market.title}`,
    )

    const estimate = await this.client.estimateProbability(sport, gameId, events, market)

    // Safety clamp (individual clients should do this too, but belt-and-suspenders)
    estimate.yesProbability = Math.max(0, Math.min(1, estimate.yesProbability))

    this.log(
      Severity.INF,
      `[${this.client.name}] Estimate for ${market.ticker}: ` +
        `P(yes)=${estimate.yesProbability.toFixed(3)} confidence=${estimate.confidence}`,
    )

    return estimate
  }
}