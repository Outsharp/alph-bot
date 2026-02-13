import {
  Configuration,
  OrdersApi,
  MarketApi,
  EventsApi,
  PortfolioApi,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type Market,
  type Order,
  type GetMarketsStatusEnum,
  type EventData,
} from 'kalshi-typescript';
import { Logs, Severity } from '../log.js';
import type { Context } from '../ctx.js';
import { GlobalConfig } from '../config.js';
import soccerSeriesTickers from './kalshi-soccer-series-tickers.json' with {type: 'json'}

const DEMO_BASE = 'https://demo-api.kalshi.co/trade-api/v2'
const PROD_BASE = 'https://api.elections.kalshi.com/trade-api/v2'

function sportToSeriesTicker(sport: string): string[] {
  sport = sport.toLowerCase()

  if (sport == 'nba') {
    return ['KXNBAGAME']
  } else if (sport == 'soccer') {
    return soccerSeriesTickers
  } else if (sport == 'nfl') {
    return ['KXNFLGAME']
  } else if (sport == 'ncaafb') {
    return ['']
  } else if (sport == 'mlb') {
    return ['KXMLBGAME']
  } else if (sport == 'ncaamb') {
    return ['KXNCAAMBGAME']
  }

  return []
}

export interface SearchMarketsOptions {
  /** Home team name to match in event/market titles */
  home: string
  /** Away team name to match in event/market titles */
  away: string
  /** Scheduled game time — used to filter markets closing around this time */
  scheduled: Date

  sport: string
  /** Only return active/open markets (default: true) */
  activeOnly?: boolean
  /** Max results (default: 100) */
  limit?: number
}

export interface MarketWithPrices {
  ticker: string
  eventTicker: string
  title: string
  yesSubTitle: string
  noSubTitle: string
  status: string
  /** Best yes bid in cents */
  yesBid: number
  /** Best yes ask in cents */
  yesAsk: number
  /** Best no bid in cents */
  noBid: number
  /** Best no ask in cents */
  noAsk: number
  /** Last trade price in cents */
  lastPrice: number
  volume: number
  openInterest: number
  closeTime: string
}

export interface CreateOrderOptions {
  ticker: string
  side: 'yes' | 'no'
  action: 'buy' | 'sell'
  count: number
  type?: 'limit' | 'market'
  /** Price in cents (1-99) for limit orders */
  yesPrice?: number
  /** Price in cents (1-99) for limit orders */
  noPrice?: number
  timeInForce?: 'fill_or_kill' | 'good_till_canceled' | 'immediate_or_cancel'
  clientOrderId?: string
}

export class KalshiAdapter extends Logs {
  private readonly orders: OrdersApi;
  private readonly markets: MarketApi;
  private readonly events: EventsApi;
  private readonly portfolio: PortfolioApi;

  constructor(protected ctx: Context, apiKeyId: string, privateKeyPath: string) {
    super(ctx)

    const basePath = GlobalConfig.parse(ctx.opts).demo ? DEMO_BASE : PROD_BASE

    const config = new Configuration({
      apiKey: apiKeyId,
      privateKeyPath: privateKeyPath,
      basePath: basePath,
    });

    this.orders = new OrdersApi(config);
    this.markets = new MarketApi(config);
    this.events = new EventsApi(config);
    this.portfolio = new PortfolioApi(config);
  }

  /**
   * Search for markets related to a specific game.
   * Fetches open events with nested markets, then filters by team names
   * and scheduled time window.
   */
  async searchMarkets(options: SearchMarketsOptions): Promise<MarketWithPrices[]> {
    const { home, away, scheduled, sport, activeOnly = true, limit = 200 } = options;

    // Use a ±24h window around the scheduled time to find relevant markets
    const windowMs = 24 * 60 * 60
    const minCloseTs = Math.floor(scheduled.getTime() / 1000) - windowMs
    const maxCloseTs = Math.floor(scheduled.getTime() / 1000) + windowMs

    this.log(Severity.INF, `Searching Kalshi markets for ${away} @ ${home}`)

    const tickers = sportToSeriesTicker(sport)

    const matched: MarketWithPrices[] = []

    const homeLower = home.toLowerCase()
    const awayLower = away.toLowerCase()

    for (const t of tickers) {
      this.log(Severity.DBG, `Getting Kalshi events for ticker: ${t}`)

      // Fetch events with nested markets in the time window
      const eventsResp = await this.events.getEvents(
        limit,        // limit
        undefined,    // cursor
        true,         // withNestedMarkets
        undefined,    // withMilestones
        activeOnly ? 'open' as const : undefined,
        t,    // seriesTicker
        minCloseTs,   // minCloseTs
      )

      for (const event of eventsResp.data.events) {
        // Check if event title mentions either team
        const eventTitle = (event.title ?? '').toLowerCase()
        const eventSubTitle = (event.sub_title ?? '').toLowerCase()
        const eventText = `${eventTitle} ${eventSubTitle}`

        const matchesHome = eventText.includes(homeLower)
        const matchesAway = eventText.includes(awayLower)

        if (!matchesHome && !matchesAway) continue

        // Process markets within this event
        const markets = event.markets ?? []
        for (const m of markets) {
          // Filter by close time window
          if (m.close_time) {
            const closeTs = new Date(m.close_time).getTime() / 1000
            if (closeTs < minCloseTs || closeTs > maxCloseTs) continue
          }

          // Skip non-active markets if requested
          if (activeOnly && m.status !== 'active') continue

          matched.push(toMarketWithPrices(m))
        }
      }
    }

    // If no matches from events, fall back to searching markets directly
    if (matched.length === 0) {
      this.log(Severity.INF, 'No event matches, falling back to market search')

      const marketsResp = await this.markets.getMarkets(
        limit,
        undefined,     // cursor
        undefined,     // eventTicker
        undefined,     // seriesTicker
        undefined,     // minCreatedTs
        undefined,     // maxCreatedTs
        undefined,     // minUpdatedTs
        maxCloseTs,    // maxCloseTs
        minCloseTs,    // minCloseTs
        undefined,     // minSettledTs
        undefined,     // maxSettledTs
        activeOnly ? 'open' as GetMarketsStatusEnum : undefined,
      )

      for (const m of marketsResp.data.markets) {
        const title = `${m.title} ${m.subtitle} ${m.yes_sub_title} ${m.no_sub_title}`.toLowerCase()
        if (title.includes(homeLower) || title.includes(awayLower)) {
          matched.push(toMarketWithPrices(m))
        }
      }
    }

    this.log(Severity.INF, `Found ${matched.length} markets for ${away} @ ${home}`)
    return matched
  }

  /**
   * Create an order on Kalshi.
   */
  async createOrder(options: CreateOrderOptions): Promise<Order> {
    this.log(Severity.INF,
      `Creating order: ${options.action} ${options.count} ${options.side} on ${options.ticker}` +
      (options.yesPrice ? ` @ ${options.yesPrice}c` : '')
    )

    const request: CreateOrderRequest = {
      ticker: options.ticker,
      side: options.side,
      action: options.action,
      count: options.count,
      type: options.type ?? 'market',
      ...(options.yesPrice !== undefined ? { yes_price: options.yesPrice } : {}),
      ...(options.noPrice !== undefined ? { no_price: options.noPrice } : {}),
      ...(options.timeInForce !== undefined ? { time_in_force: options.timeInForce } : {}),
      ...(options.clientOrderId !== undefined ? { client_order_id: options.clientOrderId } : {}),
    }

    const response = await this.orders.createOrder(request)

    const order = response.data.order
    this.log(Severity.INF,
      `Order created: ${order.order_id} status=${order.status} filled=${order.fill_count}/${order.initial_count}`
    )

    return order
  }

  /**
   * Get the current orderbook for a market.
   */
  async getOrderbook(ticker: string, depth: number = 10) {
    const resp = await this.markets.getMarketOrderbook(ticker, depth)
    return resp.data.orderbook
  }

  /**
   * Get current account balance in cents.
   */
  async getBalance(): Promise<number> {
    const resp = await this.portfolio.getBalance()
    const balance = resp.data.balance ?? 0

    this.log(Severity.DBG, `Kalshi balance: $${(balance / 100).toFixed(2)}`)
    return balance
  }

  /**
   * Get a single market by ticker with current prices.
   */
  async getMarket(ticker: string): Promise<MarketWithPrices> {
    const resp = await this.markets.getMarket(ticker)
    return toMarketWithPrices(resp.data.market)
  }

  /**
   * Cancel an existing order.
   */
  async cancelOrder(orderId: string): Promise<void> {
    this.log(Severity.INF, `Cancelling order ${orderId}`)
    await this.orders.cancelOrder(orderId)
  }

  /**
   * Get an existing order by ID.
   */
  async getOrder(orderId: string): Promise<Order> {
    const resp = await this.orders.getOrder(orderId)
    return resp.data.order
  }
}

function toMarketWithPrices(m: Market): MarketWithPrices {
  return {
    ticker: m.ticker,
    eventTicker: m.event_ticker,
    title: m.title,
    yesSubTitle: m.yes_sub_title,
    noSubTitle: m.no_sub_title,
    status: m.status,
    yesBid: m.yes_bid,
    yesAsk: m.yes_ask,
    noBid: m.no_bid,
    noAsk: m.no_ask,
    lastPrice: m.last_price,
    volume: m.volume,
    openInterest: m.open_interest,
    closeTime: m.close_time,
  }
}
