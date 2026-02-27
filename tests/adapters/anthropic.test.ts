import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AnthropicClient } from '../../src/adapters/ai/anthropic.js'

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

describe('AnthropicClient', () => {
  let client: AnthropicClient

  beforeEach(() => {
    client = new AnthropicClient({ apiKey: 'test-key', model: 'claude-opus-4-6', temperature: 0.2 })
    mockCreate.mockReset()
  })

  const market = {
    ticker: 'MKT-TEST',
    title: 'Will Lakers win?',
    yesSubTitle: 'Lakers win',
    noSubTitle: 'Lakers lose',
  }

  const events = [{ event_id: 'evt-1', description: 'test event' }]

  it('has the correct name', () => {
    expect(client.name).toBe('anthropic')
  })

  it('throws if no API key is provided', () => {
    expect(() => new AnthropicClient({ model: 'claude-opus-4-6', temperature: 0.2 }))
      .toThrow('AnthropicClient requires an API key')
  })

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

    const result = await client.estimateProbability('NBA', 'game-1', events, market)
    expect(result.yesProbability).toBe(0.65)
    expect(result.confidence).toBe('high')
    expect(result.reasoning).toBe('Lakers leading by 10')
  })

  it('rejects probability above 1', async () => {
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

    await expect(
      client.estimateProbability('NBA', 'game-1', events, market),
    ).rejects.toThrow()
  })

  it('rejects negative probability', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'estimate_probability',
          input: {
            yesProbability: -0.3,
            confidence: 'low',
            reasoning: 'negative test',
          },
        },
      ],
    })

    await expect(
      client.estimateProbability('NBA', 'game-1', events, market),
    ).rejects.toThrow()
  })

  it('throws when no tool use block in response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'I think the probability is about 65%' },
      ],
    })

    await expect(
      client.estimateProbability('NBA', 'game-1', events, market),
    ).rejects.toThrow('AI did not return')
  })

  it('passes model, temperature, and system prompt to the SDK', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'estimate_probability',
          input: {
            yesProbability: 0.5,
            confidence: 'medium',
            reasoning: 'even odds',
          },
        },
      ],
    })

    await client.estimateProbability('NBA', 'game-1', events, market)

    expect(mockCreate).toHaveBeenCalledOnce()
    const callArgs = mockCreate.mock.calls[0]![0]
    expect(callArgs.model).toBe('claude-opus-4-6')
    expect(callArgs.temperature).toBe(0.2)
    expect(callArgs.system).toContain('sports analyst')
    expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'estimate_probability' })
    expect(callArgs.messages[0].content).toContain('Will Lakers win?')
  })
})