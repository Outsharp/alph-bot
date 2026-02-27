import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import type { ShippEvent } from '../shipp-types.js'
import type { AiClient, AiClientOptions, MarketDescriptor } from './client.js'
import type { ProbabilityEstimate } from './schema.js'
import { probabilityEstimateJsonSchema, parseProbabilityEstimate } from './schema.js'

const estimateProbabilityTool: Anthropic.Tool = {
  name: 'estimate_probability',
  description: 'Provide a probability estimate for this market outcome based on the game events so far.',
  input_schema: {
    ...probabilityEstimateJsonSchema,
    required: [...probabilityEstimateJsonSchema.required],
  },
}

/**
 * Read a file from the project root, returning its contents or an empty string
 * if the file does not exist.
 */
function readProjectFile(filename: string): string {
  try {
    return readFileSync(resolve(process.cwd(), filename), 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Load SOUL.md and STRATEGY.md (falling back to STRATEGY.example.md) from the
 * project root. These are prepended to every AI prompt so the model embodies
 * the Alph identity and follows the active trading strategy.
 */
function loadContextFiles(): string {
  const soul = readProjectFile('SOUL.md')
  const strategy = readProjectFile('STRATEGY.md') || readProjectFile('STRATEGY.example.md')

  const parts: string[] = []
  if (soul) parts.push(soul.trim())
  if (strategy) parts.push(strategy.trim())
  return parts.length > 0 ? parts.join('\n\n---\n\n') + '\n\n---\n\n' : ''
}

const CONTEXT_PREFIX = loadContextFiles()

export const SYSTEM_PROMPT = `${CONTEXT_PREFIX}You are a sports analyst estimating probabilities for prediction market outcomes. You will be given live game events and a market question. Analyze the game state and provide your best probability estimate.

Be calibrated: use base rates, current score, time remaining, and momentum. Do not be overconfident. If you lack information to make a strong estimate, set confidence to "low".

Always use the estimate_probability tool to provide your response.`

export function buildUserMessage(
  sport: string,
  gameId: string,
  events: ShippEvent[],
  market: MarketDescriptor,
): string {
  const eventsText = events
    .map((e, i) => `${i + 1}. ${JSON.stringify(e)}`)
    .join('\n')

  return `Sport: ${sport}
Game ID: ${gameId}
Total events so far: ${events.length}

Game events:
${eventsText}

Market: ${market.title}
YES: ${market.yesSubTitle}
NO: ${market.noSubTitle}
Ticker: ${market.ticker}

Based on these game events, what is the probability that YES occurs?`
}

/**
 * AI client backed by the Anthropic Messages API (@anthropic-ai/sdk).
 * Requires an API key.
 *
 * The tool `input_schema` is derived from the canonical JSON Schema in
 * `schema.ts`, and responses are validated through the shared Zod schema
 * via `parseProbabilityEstimate()`.
 */
export class AnthropicClient implements AiClient {
  readonly name = 'anthropic'

  private readonly client: Anthropic
  private readonly model: string
  private readonly temperature: number

  constructor(opts: AiClientOptions) {
    if (!opts.apiKey) {
      throw new Error('AnthropicClient requires an API key. Pass --ai-provider-api-key or set ALPH_BOT_AI_PROVIDER_API_KEY.')
    }
    this.client = new Anthropic({ apiKey: opts.apiKey })
    this.model = opts.model
    this.temperature = opts.temperature
  }

  async estimateProbability(
    sport: string,
    gameId: string,
    events: ShippEvent[],
    market: MarketDescriptor,
  ): Promise<ProbabilityEstimate> {
    const userMessage = buildUserMessage(sport, gameId, events, market)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: this.temperature,
      system: SYSTEM_PROMPT,
      tools: [estimateProbabilityTool],
      tool_choice: { type: 'tool', name: 'estimate_probability' },
      messages: [{ role: 'user', content: userMessage }],
    })

    // Extract tool use from response
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    )

    if (!toolUse) {
      throw new Error('AI did not return a probability estimate (no tool_use block in response)')
    }

    return parseProbabilityEstimate(toolUse.input)
  }
}