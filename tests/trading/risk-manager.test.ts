import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RiskManager, type TradeRequest } from '../../src/trading/risk-manager.js'
import { createTestContext, seedOrder } from '../helpers/setup-db.js'
import { makeConfig } from '../helpers/fixtures.js'
import { mockKalshi } from '../helpers/mock-adapters.js'
import type { Context } from '../../src/ctx.js'
import type { KalshiAdapter } from '../../src/adapters/kalshi.js'

describe('RiskManager', () => {
  let ctx: Context
  let kalshi: KalshiAdapter
  let rm: RiskManager

  beforeEach(async () => {
    ctx = await createTestContext()
    kalshi = mockKalshi()
    rm = new RiskManager(ctx, makeConfig(), kalshi)
  })

  function request(overrides?: Partial<TradeRequest>): TradeRequest {
    return {
      marketTicker: 'MKT-TEST',
      gameId: 'test-game-1',
      side: 'yes',
      estimatedProbability: 0.70,
      marketPriceCents: 50,
      confidence: 'high',
      ...overrides,
    }
  }

  it('approves trade with sufficient edge', async () => {
    // 70% estimated vs 50c market = 20% edge
    const decision = await rm.checkTrade(request())
    expect(decision.approved).toBe(true)
    expect(decision.contractCount).toBeGreaterThan(0)
  })

  it('rejects below min-edge-pct', async () => {
    // 54% estimated vs 50c market = 4% edge (min is 5%)
    const decision = await rm.checkTrade(request({ estimatedProbability: 0.54 }))
    expect(decision.approved).toBe(false)
    expect(decision.rejectionReason).toContain('Edge')
  })

  it('rejects low confidence when min is medium', async () => {
    const decision = await rm.checkTrade(request({ confidence: 'low' }))
    expect(decision.approved).toBe(false)
    expect(decision.rejectionReason).toContain('Confidence')
  })

  it('rejects below balance floor', async () => {
    // Balance $50 < min $100
    vi.mocked(kalshi.getBalance).mockResolvedValue(5000) // 50 dollars in cents
    const decision = await rm.checkTrade(request())
    expect(decision.approved).toBe(false)
    expect(decision.rejectionReason).toContain('Balance')
  })

  it('rejects at daily trade limit', async () => {
    // Seed 50 orders opened today
    for (let i = 0; i < 50; i++) {
      await seedOrder(ctx, { openedAt: Date.now() })
    }
    const decision = await rm.checkTrade(request())
    expect(decision.approved).toBe(false)
    expect(decision.rejectionReason).toContain('Daily trade')
  })

  it('rejects at daily loss limit', async () => {
    // Seed orders with pnl summing to > -$500
    for (let i = 0; i < 6; i++) {
      await seedOrder(ctx, { pnl: -10000, openedAt: Date.now() })
    }
    const decision = await rm.checkTrade(request())
    expect(decision.approved).toBe(false)
    expect(decision.rejectionReason).toContain('Daily loss')
  })

  it('rejects at total exposure limit', async () => {
    // Seed open orders > $10k total size
    for (let i = 0; i < 11; i++) {
      await seedOrder(ctx, { size: 100000, status: 'open' })
    }
    const decision = await rm.checkTrade(request())
    expect(decision.approved).toBe(false)
    expect(decision.rejectionReason).toContain('exposure')
  })

  it('caps position at max-position-size', async () => {
    // High balance, high edge should hit max cap
    vi.mocked(kalshi.getBalance).mockResolvedValue(10_000_00) // $10k
    const decision = await rm.checkTrade(request({ estimatedProbability: 0.90, marketPriceCents: 50 }))
    expect(decision.approved).toBe(true)
    expect(decision.positionSizeCents).toBeLessThanOrEqual(1000 * 100) // max-position-size-usd * 100
  })

  it('Kelly math is correct', async () => {
    // p=0.7, price=50c → b = (100/50)-1 = 1, kelly = (1*0.7-0.3)/1 = 0.4, adjusted = 0.4*0.25 = 0.1
    // balance=500*100=50000, position = floor(50000*0.1) = 5000
    // contracts = floor(5000/50) = 100
    const decision = await rm.checkTrade(request({ estimatedProbability: 0.70, marketPriceCents: 50 }))
    expect(decision.approved).toBe(true)
    // floor(50000 * ((1*0.7-0.3)/1) * 0.25) = floor(50000 * 0.1) = 4999 (floating point)
    expect(decision.positionSizeCents).toBe(4999)
    expect(decision.contractCount).toBe(Math.floor(4999 / 50))
  })

  it('rejects zero-contract position', async () => {
    // Use low kelly-fraction so position size rounds to 0 contracts
    vi.mocked(kalshi.getBalance).mockResolvedValue(10001) // $100.01, barely above floor
    const lowKellyRm = new RiskManager(ctx, makeConfig({ 'kelly-fraction': 0.01 }), kalshi)
    // p=0.60, price=50c → edge=10%, b=1, kelly=0.2, adj=0.002
    // pos=floor(10001*0.002)=20, contracts=floor(20/50)=0
    const decision = await lowKellyRm.checkTrade(request({
      estimatedProbability: 0.60,
      marketPriceCents: 50,
    }))
    expect(decision.approved).toBe(false)
    expect(decision.rejectionReason).toContain('Position size too small')
  })

  it('getStats aggregates correctly', async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const yesterday = todayStart.getTime() - 86400_000

    // Open orders
    await seedOrder(ctx, { status: 'open', size: 5000 })
    await seedOrder(ctx, { status: 'open', size: 3000 })

    // Closed order today
    await seedOrder(ctx, { status: 'closed', size: 2000, pnl: 500, openedAt: Date.now() })

    // Closed order yesterday
    await seedOrder(ctx, { status: 'closed', size: 1000, pnl: -200, openedAt: yesterday })

    const stats = await rm.getStats('test-game-1')
    expect(stats.balanceCents).toBe(50000) // from mock
    expect(stats.openPositionCount).toBe(2)
    expect(stats.totalExposureCents).toBe(8000) // 5000 + 3000
    // Daily orders: the 2 open orders (openedAt=Date.now()) + 1 closed today = 3 today, 1 yesterday
    expect(stats.dailyTradeCount).toBe(3)
    expect(stats.dailyPnlCents).toBe(500) // only today's closed order has pnl
  })
})
