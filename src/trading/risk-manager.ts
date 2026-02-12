import { and, eq, gte } from 'drizzle-orm'
import type { Context } from '../ctx.js'
import type { ValueBetConfig } from '../config.js'
import type { KalshiAdapter } from '../adapters/kalshi.js'
import { Logs, Severity } from '../log.js'
import { orders } from '../db/schema.js'

export interface TradeRequest {
  marketTicker: string
  gameId: string
  side: 'yes' | 'no'
  estimatedProbability: number
  marketPriceCents: number
  confidence: 'low' | 'medium' | 'high'
}

export interface TradeDecision {
  approved: boolean
  positionSizeCents: number
  contractCount: number
  rejectionReason?: string
  stats: TradingStats
}

export interface TradingStats {
  balanceCents: number
  openPositionCount: number
  totalExposureCents: number
  dailyTradeCount: number
  dailyPnlCents: number
}

const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 }

export class RiskManager extends Logs {
  constructor(
    ctx: Context,
    private readonly config: ValueBetConfig,
    private readonly kalshi: KalshiAdapter,
  ) {
    super(ctx)
  }

  async checkTrade(request: TradeRequest): Promise<TradeDecision> {
    const stats = await this.getStats(request.gameId)

    // 1. Edge threshold
    const marketProb = request.marketPriceCents / 100
    const edge = (request.estimatedProbability - marketProb) * 100
    if (edge < this.config['min-edge-pct']) {
      return this.reject(`Edge ${edge.toFixed(1)}% below minimum ${this.config['min-edge-pct']}%`, stats)
    }

    // 2. Confidence threshold
    const minConfRank = CONFIDENCE_RANK[this.config['min-confidence']] ?? 1
    const actualConfRank = CONFIDENCE_RANK[request.confidence] ?? 0
    if (actualConfRank < minConfRank) {
      return this.reject(`Confidence '${request.confidence}' below minimum '${this.config['min-confidence']}'`, stats)
    }

    // 3. Balance floor
    if (stats.balanceCents < this.config['min-account-balance-usd'] * 100) {
      return this.reject(
        `Balance $${(stats.balanceCents / 100).toFixed(2)} below minimum $${this.config['min-account-balance-usd']}`,
        stats,
      )
    }

    // 4. Daily trade count
    if (stats.dailyTradeCount >= this.config['max-daily-trades']) {
      return this.reject(`Daily trade limit reached (${stats.dailyTradeCount}/${this.config['max-daily-trades']})`, stats)
    }

    // 5. Daily loss limit
    const maxDailyLossCents = this.config['max-daily-loss-usd'] * 100
    if (stats.dailyPnlCents < 0 && Math.abs(stats.dailyPnlCents) >= maxDailyLossCents) {
      return this.reject(
        `Daily loss $${(Math.abs(stats.dailyPnlCents) / 100).toFixed(2)} exceeds limit $${this.config['max-daily-loss-usd']}`,
        stats,
      )
    }

    // 6. Total exposure
    const maxExposureCents = this.config['max-total-exposure-usd'] * 100
    if (stats.totalExposureCents >= maxExposureCents) {
      return this.reject(
        `Total exposure $${(stats.totalExposureCents / 100).toFixed(2)} exceeds limit $${this.config['max-total-exposure-usd']}`,
        stats,
      )
    }

    // 7. Single market exposure %
    const marketExposure = await this.getMarketExposure(request.marketTicker)
    if (stats.totalExposureCents > 0) {
      const marketPct = (marketExposure / stats.totalExposureCents) * 100
      if (marketPct >= this.config['max-single-market-percent']) {
        return this.reject(
          `Market exposure ${marketPct.toFixed(1)}% exceeds limit ${this.config['max-single-market-percent']}%`,
          stats,
        )
      }
    }

    // Position sizing via Kelly Criterion
    const p = request.estimatedProbability
    const q = 1 - p
    const b = (100 / request.marketPriceCents) - 1
    const kelly = (b * p - q) / b
    const adjustedKelly = Math.max(0, kelly * this.config['kelly-fraction'])
    let positionSizeCents = Math.floor(stats.balanceCents * adjustedKelly)

    // 8. Cap at max position size
    const maxPositionCents = this.config['max-position-size-usd'] * 100
    positionSizeCents = Math.min(positionSizeCents, maxPositionCents)

    const contractCount = Math.floor(positionSizeCents / request.marketPriceCents)

    if (contractCount <= 0) {
      return this.reject('Position size too small for any contracts', stats)
    }

    this.log(
      Severity.INF,
      `Trade approved: ${contractCount} contracts @ ${request.marketPriceCents}c, kelly=${(adjustedKelly * 100).toFixed(1)}%`,
    )

    return {
      approved: true,
      positionSizeCents,
      contractCount,
      stats,
    }
  }

  async getStats(gameId: string): Promise<TradingStats> {
    const balanceCents = await this.kalshi.getBalance()

    // Today's start of day in ms
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

    // Open positions
    const openOrders = await this.ctx.db
      .select({ size: orders.size })
      .from(orders)
      .where(eq(orders.status, 'open'))
      .all()

    const openPositionCount = openOrders.length
    const totalExposureCents = openOrders.reduce((sum, o) => sum + o.size, 0)

    // Daily stats (orders opened today)
    const dailyOrders = await this.ctx.db
      .select({ pnl: orders.pnl })
      .from(orders)
      .where(and(
        gte(orders.openedAt, todayStart),
      ))
      .all()

    const dailyTradeCount = dailyOrders.length
    const dailyPnlCents = dailyOrders.reduce((sum, o) => sum + (o.pnl ?? 0), 0)

    return {
      balanceCents,
      openPositionCount,
      totalExposureCents,
      dailyTradeCount,
      dailyPnlCents,
    }
  }

  private async getMarketExposure(marketTicker: string): Promise<number> {
    const marketOrders = await this.ctx.db
      .select({ size: orders.size })
      .from(orders)
      .where(and(
        eq(orders.marketId, marketTicker),
        eq(orders.status, 'open'),
      ))
      .all()

    return marketOrders.reduce((sum, o) => sum + o.size, 0)
  }

  private reject(reason: string, stats: TradingStats): TradeDecision {
    this.log(Severity.INF, `Trade rejected: ${reason}`)
    return {
      approved: false,
      positionSizeCents: 0,
      contractCount: 0,
      rejectionReason: reason,
      stats,
    }
  }
}
