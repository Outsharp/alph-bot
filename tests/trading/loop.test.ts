import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TradingLoop } from '../../src/trading/loop.js'
import { createTestContext, seedGame } from '../helpers/setup-db.js'
import { makeConfig, makeMarket, makeEvent } from '../helpers/fixtures.js'
import { makeDeps } from '../helpers/mock-adapters.js'
import type { Context } from '../../src/ctx.js'
import type { ValueBetConfig } from '../../src/config.js'
import type { TradingDeps } from '../../src/trading/loop.js'
import { orders, games } from '../../src/db/schema.js'
import { eq } from 'drizzle-orm'

describe('TradingLoop', () => {
  let ctx: Context
  let config: ValueBetConfig
  let deps: TradingDeps

  beforeEach(async () => {
    ctx = await createTestContext()
    config = makeConfig()
    deps = makeDeps()
  })

  function createLoop() {
    return new TradingLoop(ctx, config, deps)
  }

  function safetySignal(ms = 10_000) {
    return AbortSignal.timeout(ms)
  }

  it('exits for completed game', async () => {
    await seedGame(ctx, { status: 'completed' })
    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())
    expect(vi.mocked(deps.kalshi.searchMarkets)).not.toHaveBeenCalled()
  })

  it('exits when no markets', async () => {
    await seedGame(ctx, { status: 'live' })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([])
    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())
    expect(vi.mocked(deps.shipp.getLiveEvents)).not.toHaveBeenCalled()
  })

  it('paper mode full cycle', async () => {
    await seedGame(ctx, { status: 'live' })
    const market = makeMarket({ yesAsk: 40, noAsk: 62 })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([market])
    vi.mocked(deps.kalshi.getMarket).mockResolvedValue(market)

    let callCount = 0
    vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { connection_id: 'conn-1', data: [makeEvent()] }
      }
      // On second call, mark game completed and return empty
      await ctx.db
        .update(games)
        .set({ status: 'completed' })
        .where(eq(games.gameId, 'test-game-1'))
        .run()
      return { connection_id: 'conn-1', data: [] }
    })

    vi.mocked(deps.ai.estimateProbability).mockResolvedValue({
      yesProbability: 0.65,
      confidence: 'high',
      reasoning: 'test',
    })

    vi.mocked(deps.riskManager.checkTrade).mockResolvedValue({
      approved: true,
      positionSizeCents: 5000,
      contractCount: 10,
      stats: { balanceCents: 50000, openPositionCount: 0, totalExposureCents: 0, dailyTradeCount: 0, dailyPnlCents: 0 },
    })

    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())

    const allOrders = await ctx.db.select().from(orders).all()
    expect(allOrders).toHaveLength(1)
    expect(allOrders[0]!.status).toBe('paper')
    expect(allOrders[0]!.side).toBe('yes')
    expect(allOrders[0]!.marketId).toBe('MKT-TEST')
    expect(allOrders[0]!.entryPrice).toBe(40)
    expect(allOrders[0]!.metadata).toBeTruthy()
    const meta = JSON.parse(allOrders[0]!.metadata)
    expect(meta.estimate.yesProbability).toBe(0.65)
  })

  it('skips trade when no edge', async () => {
    await seedGame(ctx, { status: 'live' })
    const market = makeMarket({ yesAsk: 65, noAsk: 37 })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([market])
    vi.mocked(deps.kalshi.getMarket).mockResolvedValue(market)

    let callCount = 0
    vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { connection_id: 'conn-1', data: [makeEvent()] }
      }
      await ctx.db.update(games).set({ status: 'completed' }).where(eq(games.gameId, 'test-game-1')).run()
      return { connection_id: 'conn-1', data: [] }
    })

    // AI returns prob ≈ market price → no edge
    vi.mocked(deps.ai.estimateProbability).mockResolvedValue({
      yesProbability: 0.63, // yesEdge = 0.63-0.65 = -0.02, noEdge = 0.37-0.37 = 0
      confidence: 'high',
      reasoning: 'no edge',
    })

    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())

    const allOrders = await ctx.db.select().from(orders).all()
    expect(allOrders).toHaveLength(0)
  })

  it('skips trade when risk rejects', async () => {
    await seedGame(ctx, { status: 'live' })
    const market = makeMarket({ yesAsk: 40, noAsk: 62 })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([market])
    vi.mocked(deps.kalshi.getMarket).mockResolvedValue(market)

    let callCount = 0
    vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { connection_id: 'conn-1', data: [makeEvent()] }
      }
      await ctx.db.update(games).set({ status: 'completed' }).where(eq(games.gameId, 'test-game-1')).run()
      return { connection_id: 'conn-1', data: [] }
    })

    vi.mocked(deps.riskManager.checkTrade).mockResolvedValue({
      approved: false,
      positionSizeCents: 0,
      contractCount: 0,
      rejectionReason: 'Balance too low',
      stats: { balanceCents: 5000, openPositionCount: 0, totalExposureCents: 0, dailyTradeCount: 0, dailyPnlCents: 0 },
    })

    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())

    const allOrders = await ctx.db.select().from(orders).all()
    expect(allOrders).toHaveLength(0)
  })

  it('error in one market does not crash', async () => {
    await seedGame(ctx, { status: 'live' })
    const market1 = makeMarket({ ticker: 'MKT-BAD' })
    const market2 = makeMarket({ ticker: 'MKT-GOOD', yesAsk: 40, noAsk: 62 })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([market1, market2])

    vi.mocked(deps.kalshi.getMarket).mockImplementation(async (ticker: string) => {
      if (ticker === 'MKT-BAD') throw new Error('Market unavailable')
      return makeMarket({ ticker, yesAsk: 40, noAsk: 62 })
    })

    let callCount = 0
    vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { connection_id: 'conn-1', data: [makeEvent()] }
      }
      await ctx.db.update(games).set({ status: 'completed' }).where(eq(games.gameId, 'test-game-1')).run()
      return { connection_id: 'conn-1', data: [] }
    })

    vi.mocked(deps.riskManager.checkTrade).mockResolvedValue({
      approved: true,
      positionSizeCents: 5000,
      contractCount: 10,
      stats: { balanceCents: 50000, openPositionCount: 0, totalExposureCents: 0, dailyTradeCount: 0, dailyPnlCents: 0 },
    })

    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())

    const allOrders = await ctx.db.select().from(orders).all()
    expect(allOrders).toHaveLength(1)
    expect(allOrders[0]!.marketId).toBe('MKT-GOOD')
  })

  it('exits when game completes mid-run', async () => {
    await seedGame(ctx, { status: 'live' })
    const market = makeMarket({ yesAsk: 40, noAsk: 62 })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([market])
    vi.mocked(deps.kalshi.getMarket).mockResolvedValue(market)

    let callCount = 0
    vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { connection_id: 'conn-1', data: [makeEvent()] }
      }
      await ctx.db.update(games).set({ status: 'completed' }).where(eq(games.gameId, 'test-game-1')).run()
      return { connection_id: 'conn-1', data: [] }
    })

    vi.mocked(deps.riskManager.checkTrade).mockResolvedValue({
      approved: true,
      positionSizeCents: 5000,
      contractCount: 10,
      stats: { balanceCents: 50000, openPositionCount: 0, totalExposureCents: 0, dailyTradeCount: 0, dailyPnlCents: 0 },
    })

    const loop = createLoop()
    // This should complete cleanly without hanging
    await loop.run('test-game-1', safetySignal())
    expect(callCount).toBe(2)
  })

  it('buys YES when yesEdge > noEdge', async () => {
    await seedGame(ctx, { status: 'live' })
    const market = makeMarket({ yesAsk: 40, noAsk: 62 })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([market])
    vi.mocked(deps.kalshi.getMarket).mockResolvedValue(market)

    let callCount = 0
    vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
      callCount++
      if (callCount === 1) return { connection_id: 'conn-1', data: [makeEvent()] }
      await ctx.db.update(games).set({ status: 'completed' }).where(eq(games.gameId, 'test-game-1')).run()
      return { connection_id: 'conn-1', data: [] }
    })

    // P(yes)=0.60, yesAsk=40c → yesEdge=0.20, noEdge=(0.40-0.62)=-0.22
    vi.mocked(deps.ai.estimateProbability).mockResolvedValue({
      yesProbability: 0.60,
      confidence: 'high',
      reasoning: 'yes edge',
    })

    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())

    const allOrders = await ctx.db.select().from(orders).all()
    expect(allOrders).toHaveLength(1)
    expect(allOrders[0]!.side).toBe('yes')
  })

  it('buys NO when noEdge > yesEdge', async () => {
    await seedGame(ctx, { status: 'live' })
    const market = makeMarket({ yesAsk: 70, noAsk: 32 })
    vi.mocked(deps.kalshi.searchMarkets).mockResolvedValue([market])
    vi.mocked(deps.kalshi.getMarket).mockResolvedValue(market)

    let callCount = 0
    vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
      callCount++
      if (callCount === 1) return { connection_id: 'conn-1', data: [makeEvent()] }
      await ctx.db.update(games).set({ status: 'completed' }).where(eq(games.gameId, 'test-game-1')).run()
      return { connection_id: 'conn-1', data: [] }
    })

    // P(yes)=0.25, yesAsk=70c → yesEdge=0.25-0.70=-0.45, noEdge=0.75-0.32=0.43
    vi.mocked(deps.ai.estimateProbability).mockResolvedValue({
      yesProbability: 0.25,
      confidence: 'high',
      reasoning: 'no edge',
    })

    const loop = createLoop()
    await loop.run('test-game-1', safetySignal())

    const allOrders = await ctx.db.select().from(orders).all()
    expect(allOrders).toHaveLength(1)
    expect(allOrders[0]!.side).toBe('no')
  })
})
