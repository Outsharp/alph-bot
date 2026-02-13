import { eq } from 'drizzle-orm'
import type { Context } from '../ctx.js'
import type { ValueBetConfig } from '../config.js'
import { Logs, Severity } from '../log.js'
import { games, orders } from '../db/schema.js'
import { ShippAdapter } from '../adapters/shipp.js'
import { KalshiAdapter, type MarketWithPrices } from '../adapters/kalshi.js'
import { AnthropicAdapter, type ProbabilityEstimate } from '../adapters/anthropic.js'
import { RiskManager, type TradingStats } from './risk-manager.js'
import type { ShippEvent } from '../adapters/shipp-types.js'

export interface TradingDeps {
  shipp: ShippAdapter
  kalshi: KalshiAdapter
  anthropic: AnthropicAdapter
  riskManager: RiskManager
}

export class TradingLoop extends Logs {
  private readonly shipp: ShippAdapter
  private readonly kalshi: KalshiAdapter
  private readonly anthropic: AnthropicAdapter
  private readonly riskManager: RiskManager
  private readonly config: ValueBetConfig

  constructor(ctx: Context, config: ValueBetConfig, deps?: TradingDeps) {
    super(ctx)
    this.config = config

    if (deps) {
      this.shipp = deps.shipp
      this.kalshi = deps.kalshi
      this.anthropic = deps.anthropic
      this.riskManager = deps.riskManager
    } else {
      this.shipp = new ShippAdapter(ctx, config['shipp-api-key'])
      this.kalshi = new KalshiAdapter(
        ctx,
        config['kalshi-api-key-id'] ?? '',
        config['kalshi-private-key-path'] ?? '',
      )
      this.anthropic = new AnthropicAdapter(
        ctx,
        config['ai-provider-api-key'],
        config['ai-model'],
        config['ai-model-temperature'],
      )
      this.riskManager = new RiskManager(ctx, config, this.kalshi)
    }
  }

  async run(gameId: string, signal?: AbortSignal): Promise<void> {
    this.log(Severity.INF, `Starting trading loop for game ${gameId}`)

    // Look up game in DB
    let game = await this.ctx.db
      .select()
      .from(games)
      .where(eq(games.gameId, gameId))
      .get()

    // Pre-flight: if game not in DB, fetch schedule to populate it
    if (!game) {
      this.log(Severity.INF, 'Game not in DB, fetching schedule...')
      // Try common sports until we find the game
      for (const sport of ['NBA', 'NFL', 'NCAAFB', 'MLB', 'Soccer'] as const) {
        try {
          await this.shipp.getSchedule({ sport })
          game = await this.ctx.db
            .select()
            .from(games)
            .where(eq(games.gameId, gameId))
            .get()
          if (game) break
        } catch {
          // Sport may not be available, try next
        }
      }

      if (!game) {
        this.log(Severity.ERR, `Game ${gameId} not found after fetching schedules`)
        console.log(`Game ${gameId} not found. Run 'available-games' first to populate the database.`)
        return
      }
    }

    const sport = game.sport as 'NBA' | 'NFL' | 'NCAAFB' | 'MLB' | 'Soccer'

    // Check game status
    if (game.status === 'scheduled') {
      const startTime = game.scheduledStartTime
        ? new Date(game.scheduledStartTime * 1000).toLocaleString()
        : 'TBD'
      console.log(`Game ${gameId} is scheduled for ${startTime}. Waiting for it to start...`)
      this.log(Severity.INF, `Game scheduled for ${startTime}, will poll until live`)
    }

    if (game.status === 'completed') {
      console.log(`Game ${gameId} has already completed.`)
      return
    }

    // Search for Kalshi markets
    const home = game.homeTeam ?? 'Home'
    const away = game.awayTeam ?? 'Away'
    const scheduled = game.scheduledStartTime
      ? new Date(game.scheduledStartTime * 1000)
      : new Date()

    console.log(`Looking for markets: ${away} @ ${home}`)

    const markets = await this.kalshi.searchMarkets({ home, away, scheduled, sport })

    if (markets.length === 0) {
      this.log(Severity.INF, `No Kalshi markets found for ${away} @ ${home}`)
      return
    }

    // Main poll loop
    const allEvents: ShippEvent[] = []

    while (!signal?.aborted) {
      try {
        // Poll for new events
        const eventsResp = await this.shipp.getLiveEvents({
          gameId,
          sport,
          limit: 100,
        })

        // Check if game completed
        const freshGame = await this.ctx.db
          .select()
          .from(games)
          .where(eq(games.gameId, gameId))
          .get()

        if (eventsResp.data.length === 0 && freshGame?.status === 'completed') {
          this.log(Severity.INF, 'Game completed, exiting loop')
          console.log('Game completed. Exiting trading loop.')
          break
        }

        if (eventsResp.data.length === 0) {
          await sleep(this.config['poll-interval-ms'])
          continue
        }

        // Accumulate events
        allEvents.push(...eventsResp.data)
        this.log(Severity.DBG, `Accumulated ${allEvents.length} total events`)

        // Process each market
        for (const market of markets) {
          try {
            await this.processMarket(market, gameId, sport, allEvents)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            this.log(Severity.ERR, `Error processing market ${market.ticker}: ${msg}`)
          }
        }

        // Log stats summary
        const stats = await this.riskManager.getStats(gameId)
        this.logStats(stats)

        await sleep(this.config['poll-interval-ms'])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const backoff = this.config['poll-interval-ms'] * 2
        // @ts-ignore
        this.log(Severity.ERR, `Error in trading loop: ${msg}. Retrying in ${backoff / 1000}s\n${err?.stack ?? ''}`)
        await sleep(backoff)
      }
    }
  }

  private async processMarket(
    market: MarketWithPrices,
    gameId: string,
    sport: string,
    allEvents: ShippEvent[],
  ): Promise<void> {
    // Get fresh prices
    const fresh = await this.kalshi.getMarket(market.ticker)

    // Skip if market is no longer active
    if (fresh.status !== 'active') return

    // Get AI estimate
    const estimate = await this.anthropic.estimateProbability(
      sport,
      gameId,
      allEvents,
      {
        ticker: fresh.ticker,
        title: fresh.title,
        yesSubTitle: fresh.yesSubTitle,
        noSubTitle: fresh.noSubTitle,
      },
    )

    // Decide side: buy YES if our estimate > market ask, buy NO if (1 - estimate) > no ask
    const yesEdge = estimate.yesProbability - fresh.yesAsk / 100
    const noEdge = (1 - estimate.yesProbability) - fresh.noAsk / 100

    let side: 'yes' | 'no'
    let marketPriceCents: number

    if (yesEdge > noEdge && yesEdge > 0) {
      side = 'yes'
      marketPriceCents = fresh.yesAsk
    } else if (noEdge > 0) {
      side = 'no'
      marketPriceCents = fresh.noAsk
    } else {
      this.log(Severity.DBG, `No edge on ${market.ticker}: yesEdge=${yesEdge.toFixed(3)} noEdge=${noEdge.toFixed(3)}`)
      return
    }

    // Risk check
    const decision = await this.riskManager.checkTrade({
      marketTicker: fresh.ticker,
      gameId,
      side,
      estimatedProbability: side === 'yes' ? estimate.yesProbability : 1 - estimate.yesProbability,
      marketPriceCents,
      confidence: estimate.confidence,
    })

    if (!decision.approved) {
      console.log(`  SKIP ${fresh.ticker} ${side.toUpperCase()}: ${decision.rejectionReason}`)
      return
    }

    // Execute trade
    const metadata = JSON.stringify({ estimate, riskCheck: decision })

    if (this.config.paper) {
      // Paper mode — log but don't place real order
      console.log(
        `  PAPER ${side.toUpperCase()} ${decision.contractCount}x ${fresh.ticker} @ ${marketPriceCents}c` +
        ` | P(${side})=${(side === 'yes' ? estimate.yesProbability : 1 - estimate.yesProbability).toFixed(3)}` +
        ` | conf=${estimate.confidence}`,
      )

      await this.ctx.db.insert(orders).values({
        marketType: 'kalshi',
        marketId: fresh.ticker,
        marketTitle: fresh.title,
        side,
        size: decision.positionSizeCents,
        entryPrice: marketPriceCents,
        status: 'paper',
        openedAt: Date.now(),
        strategy: 'value-bet',
        gameId,
        metadata,
      }).run()
    } else {
      // Live mode — place real order
      console.log(
        `  LIVE ${side.toUpperCase()} ${decision.contractCount}x ${fresh.ticker} @ ${marketPriceCents}c`,
      )

      const order = await this.kalshi.createOrder({
        ticker: fresh.ticker,
        side,
        action: 'buy',
        count: decision.contractCount,
        type: 'market',
      })

      await this.ctx.db.insert(orders).values({
        marketType: 'kalshi',
        marketId: fresh.ticker,
        marketTitle: fresh.title,
        side,
        size: decision.positionSizeCents,
        entryPrice: marketPriceCents,
        status: 'open',
        openedAt: Date.now(),
        strategy: 'value-bet',
        gameId,
        metadata,
        externalOrderId: order.order_id,
        submittedAt: Date.now(),
      }).run()
    }
  }

  private logStats(stats: TradingStats): void {
    const summary = [
      `Balance: $${(stats.balanceCents / 100).toFixed(2)}`,
      `Open: ${stats.openPositionCount}`,
      `Exposure: $${(stats.totalExposureCents / 100).toFixed(2)}`,
      `Today: ${stats.dailyTradeCount} trades`,
      `PnL: $${(stats.dailyPnlCents / 100).toFixed(2)}`,
    ].join(' | ')

    console.log(`  [STATS] ${summary}`)
    this.log(Severity.INF, `Stats: ${summary}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
