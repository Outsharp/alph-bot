import { vi } from 'vitest'
import type { KalshiAdapter } from '../../src/adapters/kalshi.js'
import type { ShippAdapter } from '../../src/adapters/shipp.js'
import type { AnthropicAdapter } from '../../src/adapters/anthropic.js'
import type { RiskManager } from '../../src/trading/risk-manager.js'
import type { TradingDeps } from '../../src/trading/loop.js'

export function mockKalshi() {
  return {
    searchMarkets: vi.fn().mockResolvedValue([]),
    getMarket: vi.fn(),
    getBalance: vi.fn().mockResolvedValue(50000),
    createOrder: vi.fn().mockResolvedValue({ order_id: 'order-1', status: 'filled', fill_count: 1, initial_count: 1 }),
    getOrderbook: vi.fn(),
    cancelOrder: vi.fn(),
    getOrder: vi.fn(),
    log: vi.fn(),
  } as unknown as KalshiAdapter
}

export function mockShipp() {
  return {
    getSchedule: vi.fn().mockResolvedValue({ schedule: [] }),
    getLiveEvents: vi.fn().mockResolvedValue({ connection_id: 'conn-1', data: [] }),
    getOrCreateConnection: vi.fn().mockResolvedValue('conn-1'),
    updateGameStatus: vi.fn(),
    listConnections: vi.fn(),
    log: vi.fn(),
  } as unknown as ShippAdapter
}

export function mockAnthropic() {
  return {
    estimateProbability: vi.fn().mockResolvedValue({
      yesProbability: 0.65,
      confidence: 'high' as const,
      reasoning: 'test reasoning',
    }),
    log: vi.fn(),
  } as unknown as AnthropicAdapter
}

export function mockRiskManager() {
  return {
    checkTrade: vi.fn().mockResolvedValue({
      approved: true,
      positionSizeCents: 5000,
      contractCount: 10,
      stats: {
        balanceCents: 50000,
        openPositionCount: 0,
        totalExposureCents: 0,
        dailyTradeCount: 0,
        dailyPnlCents: 0,
      },
    }),
    getStats: vi.fn().mockResolvedValue({
      balanceCents: 50000,
      openPositionCount: 0,
      totalExposureCents: 0,
      dailyTradeCount: 0,
      dailyPnlCents: 0,
    }),
    log: vi.fn(),
  } as unknown as RiskManager
}

export function makeDeps(overrides?: Partial<TradingDeps>): TradingDeps {
  return {
    shipp: mockShipp(),
    kalshi: mockKalshi(),
    anthropic: mockAnthropic(),
    riskManager: mockRiskManager(),
    ...overrides,
  }
}
