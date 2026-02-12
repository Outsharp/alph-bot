import type { MarketWithPrices } from '../../src/adapters/kalshi.js'
import type { ShippEvent } from '../../src/adapters/shipp-types.js'
import type { ValueBetConfig } from '../../src/config.js'

export function makeMarket(overrides?: Partial<MarketWithPrices>): MarketWithPrices {
  return {
    ticker: 'MKT-TEST',
    eventTicker: 'EVT-TEST',
    title: 'Will Lakers win?',
    yesSubTitle: 'Lakers win',
    noSubTitle: 'Lakers lose',
    status: 'active',
    yesBid: 48,
    yesAsk: 50,
    noBid: 48,
    noAsk: 52,
    lastPrice: 49,
    volume: 1000,
    openInterest: 500,
    closeTime: new Date(Date.now() + 3600_000).toISOString(),
    ...overrides,
  }
}

export function makeEvent(overrides?: Partial<ShippEvent>): ShippEvent {
  return {
    event_id: 'evt-1',
    game_id: 'test-game-1',
    wall_clock_start: new Date().toISOString(),
    description: 'LeBron James made a 3-point shot',
    ...overrides,
  }
}

export function makeConfig(overrides?: Partial<ValueBetConfig>): ValueBetConfig {
  return {
    demo: false,
    paper: true,
    'db-filename': ':memory:',
    'ai-model': 'claude-opus-4-6',
    'ai-provider': 'anthropic',
    'ai-provider-api-key': 'test-key',
    'ai-model-temperature': 0.2,
    'min-edge-pct': 5,
    'min-confidence': 'medium',
    'kelly-fraction': 0.25,
    'max-total-exposure-usd': 10000,
    'max-position-size-usd': 1000,
    'max-single-market-percent': 20,
    'max-daily-loss-usd': 500,
    'max-daily-trades': 50,
    'min-account-balance-usd': 100,
    'poll-interval-ms': 10,
    ...overrides,
  }
}
