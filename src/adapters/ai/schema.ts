import * as z from 'zod'

// ---------------------------------------------------------------------------
// Zod schema — runtime validation source of truth
// ---------------------------------------------------------------------------

/**
 * Zod schema for the structured output every AI client must return.
 *
 * This is the **single source of truth** for the `ProbabilityEstimate` shape.
 * The JSON Schema constant below is derived from this definition, and both
 * `AnthropicClient` (tool `input_schema`) and `ClaudeCliClient` (prompt +
 * response validation) consume it.
 */
export const ProbabilityEstimateSchema = z.object({
  yesProbability: z
    .number()
    .min(0)
    .max(1)
    .describe('Probability that the YES outcome occurs, between 0 and 1'),
  confidence: z
    .enum(['low', 'medium', 'high'])
    .describe('Your confidence in this estimate'),
  reasoning: z
    .string()
    .describe('Brief explanation of your reasoning'),
})

export type ProbabilityEstimate = z.infer<typeof ProbabilityEstimateSchema>

// ---------------------------------------------------------------------------
// JSON Schema — derived from the Zod definition above
// ---------------------------------------------------------------------------

/**
 * Standard JSON Schema (draft-07 compatible) for `ProbabilityEstimate`.
 *
 * Used by:
 *  - `AnthropicClient` as the tool `input_schema`
 *  - `ClaudeCliClient` injected into the prompt so the model knows the
 *    exact shape to return, and for response validation
 *  - Any future client that needs a schema definition
 *
 * Kept in sync with `ProbabilityEstimateSchema` above. If you change one,
 * change the other (or better yet, add a test that asserts parity).
 */
export const probabilityEstimateJsonSchema = {
  type: 'object' as const,
  properties: {
    yesProbability: {
      type: 'number' as const,
      minimum: 0,
      maximum: 1,
      description: 'Probability that the YES outcome occurs, between 0 and 1',
    },
    confidence: {
      type: 'string' as const,
      enum: ['low', 'medium', 'high'] as const,
      description: 'Your confidence in this estimate',
    },
    reasoning: {
      type: 'string' as const,
      description: 'Brief explanation of your reasoning',
    },
  },
  required: ['yesProbability', 'confidence', 'reasoning'] as const,
  additionalProperties: false,
} as const

/**
 * Pretty-printed JSON Schema string — ready to embed in prompts.
 *
 * Primarily consumed by `ClaudeCliClient` so the model receives the exact
 * schema definition inline rather than a prose description.
 */
export const probabilityEstimateJsonSchemaString: string =
  JSON.stringify(probabilityEstimateJsonSchema, null, 2)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate a raw value against `ProbabilityEstimateSchema`.
 *
 * Returns a fully validated `ProbabilityEstimate` with `yesProbability`
 * clamped to [0, 1]. Throws a `ZodError` if the input doesn't match.
 */
export function parseProbabilityEstimate(raw: unknown): ProbabilityEstimate {
  const parsed = ProbabilityEstimateSchema.parse(raw)
  // Belt-and-suspenders clamp (Zod min/max already enforce this, but
  // floating-point edge cases are cheap to guard against)
  parsed.yesProbability = Math.max(0, Math.min(1, parsed.yesProbability))
  return parsed
}