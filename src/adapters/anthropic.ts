import Anthropic from '@anthropic-ai/sdk'
import type { Context } from '../ctx.js'
import { Logs, Severity } from '../log.js'
import type { ShippEvent } from './shipp-types.js'

export interface ProbabilityEstimate {
  yesProbability: number    // 0-1
  confidence: 'low' | 'medium' | 'high'
  reasoning: string
}

const estimateProbabilityTool: Anthropic.Tool = {
  name: 'estimate_probability',
  description: 'Provide a probability estimate for this market outcome based on the game events so far.',
  input_schema: {
    type: 'object' as const,
    properties: {
      yesProbability: {
        type: 'number',
        description: 'Probability that the YES outcome occurs, between 0 and 1',
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'Your confidence in this estimate',
      },
      reasoning: {
        type: 'string',
        description: 'Brief explanation of your reasoning',
      },
    },
    required: ['yesProbability', 'confidence', 'reasoning'],
  },
}

const SYSTEM_PROMPT = `You are a sports analyst estimating probabilities for prediction market outcomes. You will be given live game events and a market question. Analyze the game state and provide your best probability estimate.

Be calibrated: use base rates, current score, time remaining, and momentum. Do not be overconfident. If you lack information to make a strong estimate, set confidence to "low".

Always use the estimate_probability tool to provide your response.`

export class AnthropicAdapter extends Logs {
  private readonly client: Anthropic
  private readonly model: string
  private readonly temperature: number

  constructor(ctx: Context, apiKey: string, model: string, temperature: number) {
    super(ctx)
    this.client = new Anthropic({ apiKey })
    this.model = model
    this.temperature = temperature
  }

  async estimateProbability(
    sport: string,
    gameId: string,
    events: ShippEvent[],
    market: { ticker: string; title: string; yesSubTitle: string; noSubTitle: string },
  ): Promise<ProbabilityEstimate> {
    this.log(Severity.INF, `Estimating probability for ${market.ticker}: ${market.title}`)

    const eventsText = events
      .map((e, i) => `${i + 1}. ${JSON.stringify(e)}`)
      .join('\n')

    const userMessage = `Sport: ${sport}
Game ID: ${gameId}
Total events so far: ${events.length}

Game events:
${eventsText}

Market: ${market.title}
YES: ${market.yesSubTitle}
NO: ${market.noSubTitle}
Ticker: ${market.ticker}

Based on these game events, what is the probability that YES occurs?`

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
      this.log(Severity.ERR, 'No tool use in AI response')
      throw new Error('AI did not return a probability estimate')
    }

    const input = toolUse.input as {
      yesProbability: number
      confidence: 'low' | 'medium' | 'high'
      reasoning: string
    }

    const estimate: ProbabilityEstimate = {
      yesProbability: Math.max(0, Math.min(1, input.yesProbability)),
      confidence: input.confidence,
      reasoning: input.reasoning,
    }

    this.log(
      Severity.INF,
      `Estimate for ${market.ticker}: P(yes)=${estimate.yesProbability.toFixed(3)} confidence=${estimate.confidence}`,
    )

    return estimate
  }
}
