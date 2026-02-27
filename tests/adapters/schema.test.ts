import { describe, it, expect } from 'vitest'
import {
  ProbabilityEstimateSchema,
  probabilityEstimateJsonSchema,
  probabilityEstimateJsonSchemaString,
  parseProbabilityEstimate,
} from '../../src/adapters/ai/schema.js'

describe('ProbabilityEstimateSchema (Zod)', () => {
  it('accepts a valid estimate', () => {
    const result = ProbabilityEstimateSchema.parse({
      yesProbability: 0.65,
      confidence: 'high',
      reasoning: 'Lakers leading by 10',
    })
    expect(result.yesProbability).toBe(0.65)
    expect(result.confidence).toBe('high')
    expect(result.reasoning).toBe('Lakers leading by 10')
  })

  it('accepts boundary values 0 and 1', () => {
    expect(ProbabilityEstimateSchema.parse({
      yesProbability: 0,
      confidence: 'low',
      reasoning: 'impossible',
    }).yesProbability).toBe(0)

    expect(ProbabilityEstimateSchema.parse({
      yesProbability: 1,
      confidence: 'high',
      reasoning: 'certain',
    }).yesProbability).toBe(1)
  })

  it('accepts all confidence levels', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      const result = ProbabilityEstimateSchema.parse({
        yesProbability: 0.5,
        confidence: level,
        reasoning: `testing ${level}`,
      })
      expect(result.confidence).toBe(level)
    }
  })

  it('rejects yesProbability above 1', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      yesProbability: 1.5,
      confidence: 'high',
      reasoning: 'over',
    })).toThrow()
  })

  it('rejects yesProbability below 0', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      yesProbability: -0.1,
      confidence: 'low',
      reasoning: 'under',
    })).toThrow()
  })

  it('rejects invalid confidence value', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      yesProbability: 0.5,
      confidence: 'extreme',
      reasoning: 'bad enum',
    })).toThrow()
  })

  it('rejects non-string reasoning', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      yesProbability: 0.5,
      confidence: 'medium',
      reasoning: 42,
    })).toThrow()
  })

  it('rejects missing yesProbability', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      confidence: 'high',
      reasoning: 'no prob',
    })).toThrow()
  })

  it('rejects missing confidence', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      yesProbability: 0.5,
      reasoning: 'no confidence',
    })).toThrow()
  })

  it('rejects missing reasoning', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      yesProbability: 0.5,
      confidence: 'low',
    })).toThrow()
  })

  it('rejects completely empty object', () => {
    expect(() => ProbabilityEstimateSchema.parse({})).toThrow()
  })

  it('rejects non-numeric yesProbability', () => {
    expect(() => ProbabilityEstimateSchema.parse({
      yesProbability: 'not a number',
      confidence: 'low',
      reasoning: 'bad type',
    })).toThrow()
  })
})

describe('probabilityEstimateJsonSchema', () => {
  it('has type "object"', () => {
    expect(probabilityEstimateJsonSchema.type).toBe('object')
  })

  it('defines all three required properties', () => {
    const required = [...probabilityEstimateJsonSchema.required]
    expect(required).toContain('yesProbability')
    expect(required).toContain('confidence')
    expect(required).toContain('reasoning')
    expect(required).toHaveLength(3)
  })

  it('sets additionalProperties to false', () => {
    expect(probabilityEstimateJsonSchema.additionalProperties).toBe(false)
  })

  it('defines yesProbability as a number with bounds', () => {
    const prop = probabilityEstimateJsonSchema.properties.yesProbability
    expect(prop.type).toBe('number')
    expect(prop.minimum).toBe(0)
    expect(prop.maximum).toBe(1)
  })

  it('defines confidence as a string enum', () => {
    const prop = probabilityEstimateJsonSchema.properties.confidence
    expect(prop.type).toBe('string')
    expect([...prop.enum]).toEqual(['low', 'medium', 'high'])
  })

  it('defines reasoning as a string', () => {
    const prop = probabilityEstimateJsonSchema.properties.reasoning
    expect(prop.type).toBe('string')
  })

  it('has descriptions on every property', () => {
    for (const key of Object.keys(probabilityEstimateJsonSchema.properties) as Array<keyof typeof probabilityEstimateJsonSchema.properties>) {
      expect(probabilityEstimateJsonSchema.properties[key].description).toBeTruthy()
    }
  })
})

describe('probabilityEstimateJsonSchemaString', () => {
  it('is valid JSON', () => {
    const parsed = JSON.parse(probabilityEstimateJsonSchemaString)
    expect(parsed).toBeTruthy()
  })

  it('round-trips to the same object', () => {
    const parsed = JSON.parse(probabilityEstimateJsonSchemaString)
    expect(parsed).toEqual(probabilityEstimateJsonSchema)
  })

  it('is pretty-printed (contains newlines)', () => {
    expect(probabilityEstimateJsonSchemaString).toContain('\n')
  })
})

describe('Zod ↔ JSON Schema parity', () => {
  it('required fields match Zod shape keys', () => {
    const zodKeys = Object.keys(ProbabilityEstimateSchema.shape).sort()
    const jsonSchemaRequired = [...probabilityEstimateJsonSchema.required].sort()
    expect(jsonSchemaRequired).toEqual(zodKeys)
  })

  it('property names match Zod shape keys', () => {
    const zodKeys = Object.keys(ProbabilityEstimateSchema.shape).sort()
    const jsonSchemaKeys = Object.keys(probabilityEstimateJsonSchema.properties).sort()
    expect(jsonSchemaKeys).toEqual(zodKeys)
  })

  it('confidence enum values match between Zod and JSON Schema', () => {
    const zodOptions = ProbabilityEstimateSchema.shape.confidence.options
    const jsonSchemaEnum = [...probabilityEstimateJsonSchema.properties.confidence.enum]
    expect(jsonSchemaEnum).toEqual(zodOptions)
  })
})

describe('parseProbabilityEstimate()', () => {
  it('returns a valid estimate from clean input', () => {
    const result = parseProbabilityEstimate({
      yesProbability: 0.72,
      confidence: 'high',
      reasoning: 'Strong lead in Q4',
    })
    expect(result).toEqual({
      yesProbability: 0.72,
      confidence: 'high',
      reasoning: 'Strong lead in Q4',
    })
  })

  it('strips extra properties', () => {
    const result = parseProbabilityEstimate({
      yesProbability: 0.5,
      confidence: 'medium',
      reasoning: 'even match',
      extraField: 'should be stripped',
      anotherOne: 123,
    })
    expect(result).toEqual({
      yesProbability: 0.5,
      confidence: 'medium',
      reasoning: 'even match',
    })
    expect((result as Record<string, unknown>)['extraField']).toBeUndefined()
  })

  it('clamps yesProbability at the boundaries', () => {
    // The Zod schema rejects out-of-range, but parseProbabilityEstimate
    // also has a belt-and-suspenders clamp. Values within [0,1] that parse
    // successfully should be returned as-is.
    expect(parseProbabilityEstimate({
      yesProbability: 0,
      confidence: 'low',
      reasoning: 'zero',
    }).yesProbability).toBe(0)

    expect(parseProbabilityEstimate({
      yesProbability: 1,
      confidence: 'high',
      reasoning: 'one',
    }).yesProbability).toBe(1)
  })

  it('throws on out-of-range yesProbability', () => {
    expect(() => parseProbabilityEstimate({
      yesProbability: 1.01,
      confidence: 'high',
      reasoning: 'too high',
    })).toThrow()

    expect(() => parseProbabilityEstimate({
      yesProbability: -0.01,
      confidence: 'low',
      reasoning: 'too low',
    })).toThrow()
  })

  it('throws on null input', () => {
    expect(() => parseProbabilityEstimate(null)).toThrow()
  })

  it('throws on undefined input', () => {
    expect(() => parseProbabilityEstimate(undefined)).toThrow()
  })

  it('throws on a string input', () => {
    expect(() => parseProbabilityEstimate('not an object')).toThrow()
  })

  it('throws on an array input', () => {
    expect(() => parseProbabilityEstimate([0.5, 'high', 'reason'])).toThrow()
  })

  it('throws on invalid confidence', () => {
    expect(() => parseProbabilityEstimate({
      yesProbability: 0.5,
      confidence: 'very-high',
      reasoning: 'bad enum',
    })).toThrow()
  })

  it('preserves floating-point precision', () => {
    const result = parseProbabilityEstimate({
      yesProbability: 0.123456789,
      confidence: 'medium',
      reasoning: 'precise',
    })
    expect(result.yesProbability).toBe(0.123456789)
  })

  it('handles empty reasoning string', () => {
    const result = parseProbabilityEstimate({
      yesProbability: 0.5,
      confidence: 'low',
      reasoning: '',
    })
    expect(result.reasoning).toBe('')
  })
})