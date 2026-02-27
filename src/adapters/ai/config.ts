import * as z from 'zod'

/**
 * All supported AI providers / transports.
 *
 * - `anthropic`  — Anthropic Messages API via @anthropic-ai/sdk (requires API key)
 * - `claude-cli` — Local `claude` CLI binary (no API key needed; uses CLI auth)
 */
export const AiProviderEnum = z.enum(['anthropic', 'claude-cli'])
export type AiProviderEnum = z.infer<typeof AiProviderEnum>

/**
 * Raw (pre-refinement) AI config fields shared across commands.
 *
 * These are the individual fields that get merged into `ValueBetConfig`.
 * Refinement (e.g. "anthropic requires an API key") is applied via
 * `AiConfig` below.
 */
export const AiConfigBase = z.object({
  'ai-provider': AiProviderEnum.default('anthropic'),
  'ai-model': z.string().default('claude-opus-4-6'),
  'ai-model-temperature': z.number().min(0).max(2).default(0.2),
  'ai-provider-api-key': z.string().optional(),
})

/**
 * Refined AI config — applies cross-field validation rules:
 *
 * 1. `anthropic` provider **requires** `ai-provider-api-key`.
 * 2. `claude-cli` provider does **not** require an API key.
 */
export const AiConfig = AiConfigBase.superRefine((val, ctx) => {
  if (val['ai-provider'] === 'anthropic' && !val['ai-provider-api-key']) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ai-provider-api-key'],
      message:
        'The "anthropic" provider requires an API key. ' +
        'Pass --ai-provider-api-key or set ALPH_BOT_AI_PROVIDER_API_KEY.',
    })
  }
})

export type AiConfig = z.infer<typeof AiConfigBase>