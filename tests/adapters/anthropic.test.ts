import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AnthropicAdapter } from '../../src/adapters/anthropic.js'
import { createTestContext } from '../helpers/setup-db.js'
import type { Context } from '../../src/ctx.js'

const mockCreate = vi.fn()

// Mock the Anthropic SDK with a proper constructor
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
      constructor() {}
    },
  }
})

describe('AnthropicAdapter', () => {
  let ctx: Context
  let adapter: AnthropicAdapter

  beforeEach(async () => {
    ctx = await createTestContext()
    adapter = new AnthropicAdapter(ctx, 'test-key', 'claude-opus-4-6', 0.2)
    mockCreate.mockReset()
  })

  const market = {
    ticker: 'MKT-TEST',
    title: 'Will Lakers win?',
    yesSubTitle: 'Lakers win',
    noSubTitle: 'Lakers lose',
  }

  const events = [{ event_id: 'evt-1', description: 'test event' }]

  it('returns parsed estimate', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'estimate_probability',
          input: {
            yesProbability: 0.65,
            confidence: 'high',
            reasoning: 'Lakers leading by 10',
          },
        },
      ],
    })

    const result = await adapter.estimateProbability('NBA', 'game-1', events, market)
    expect(result.yesProbability).toBe(0.65)
    expect(result.confidence).toBe('high')
    expect(result.reasoning).toBe('Lakers leading by 10')
  })

  it('clamps probability to [0,1]', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'estimate_probability',
          input: {
            yesProbability: 1.5,
            confidence: 'medium',
            reasoning: 'over-confident',
          },
        },
      ],
    })

    const result = await adapter.estimateProbability('NBA', 'game-1', events, market)
    expect(result.yesProbability).toBe(1.0)
  })

  it('throws when no tool use', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'I think the probability is about 65%' },
      ],
    })

    await expect(
      adapter.estimateProbability('NBA', 'game-1', events, market),
    ).rejects.toThrow('AI did not return')
  })
})
