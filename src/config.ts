import * as z from 'zod'

export const Confidence = z.enum(['low', 'medium', 'high'])

export const AiProvider = z.enum(['anthropic'])

export const Sport = z.enum(['NBA', 'NFL', 'NCAAFB', 'MLB', 'Soccer'])

export const GlobalConfig = z.object({
  demo: z.boolean().default(false),
  paper: z.boolean().default(false),
  'db-filename': z.string().default('db.sql'),
  'shipp-api-key': z.string().optional(),
})

export const ValueBetConfig = GlobalConfig.extend({
  game: z.array(z.string()).optional(),
  'event-contract-exchange': z.array(z.string()).optional(),

  // kalshi
  'kalshi-api-key-id': z.string().optional(),
  'kalshi-private-key-path': z.string().optional(),

  // ai
  'ai-model': z.string().default('claude-opus-4-6'),
  'ai-provider': AiProvider.default('anthropic'),
  'ai-provider-api-key': z.string(),
  'ai-model-temperature': z.number().min(0).max(2).default(0.2),

  // strategy
  'min-edge-pct': z.number().min(0).default(5),
  'min-confidence': Confidence.default('medium'),
  'kelly-fraction': z.coerce.number().min(0).max(1).default(0.25),

  // risk
  'max-total-exposure-usd': z.number().min(0).default(10000),
  'max-position-size-usd': z.number().min(0).default(1000),
  'max-single-market-percent': z.number().min(0).max(100).default(20),
  'max-daily-loss-usd': z.number().min(0).default(500),
  'max-daily-trades': z.number().int().min(0).default(50),
  'min-account-balance-usd': z.number().min(0).default(100),
  'poll-interval-ms': z.number().int().min(0).default(5000),
})

export const AvailableGamesConfig = GlobalConfig.extend({
  sport: Sport.default('NBA'),
})

export type GlobalConfig = z.infer<typeof GlobalConfig>
export type ValueBetConfig = z.infer<typeof ValueBetConfig>
export type AvailableGamesConfig = z.infer<typeof AvailableGamesConfig>