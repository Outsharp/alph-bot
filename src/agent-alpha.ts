import { ValueBetConfig, AvailableGamesConfig, GlobalConfig, CreateAccountConfig, X402SetupConfig, X402PayConfig, X402BalanceConfig } from "./config.js"
import {
  type ValueBetConfig as ValueBetConfigType,
  type AvailableGamesConfig as AvailableGamesConfigType,
  type X402SetupConfig as X402SetupConfigType,
  type X402PayConfig as X402PayConfigType,
  type X402BalanceConfig as X402BalanceConfigType,
} from "./config.js"
import { Context } from "./ctx.js"
import { ShippAdapter } from "./adapters/shipp.js"
import { TradingLoop } from "./trading/loop.js"

export class AgentAlpha {
  private ctx: Context
  private shipp: ShippAdapter

  constructor(opts: unknown) {
    this.ctx = new Context(opts)

    // Initialize Shipp adapter (will be used by both commands)
    const globalConfig = GlobalConfig.parse(opts)
    this.shipp = new ShippAdapter(this.ctx, globalConfig["shipp-api-key"])
  }

  async createAccount() {
    const opts = CreateAccountConfig.parse(this.ctx.opts)

    await this.shipp.createAccount(opts.email)
  }

  async valueBet() {
    const opts: ValueBetConfigType = ValueBetConfig.parse(this.ctx.opts)

    if (!opts.game || opts.game.length === 0) {
      console.log('No game ID specified. Use --game <id> to specify a game.')
      return
    }

    // Single game per invocation (use first game ID)
    const gameId = opts.game[0]!

    const loop = await TradingLoop.create(this.ctx, opts)
    await loop.run(gameId)
  }

  async availableGames() {
    const opts: AvailableGamesConfigType = AvailableGamesConfig.parse(this.ctx.opts)

    // Fetch schedule from Shipp
    const schedule = await this.shipp.getSchedule({
      sport: opts.sport,
    })

    // Filter out completed games (API uses game_status field) and sort by schedule time desc
    const activeGames = schedule.schedule
      .filter(
        (game) => game.game_status !== 'finished'
      )
      .sort((a, b) => {
        const timeA = a.scheduled ? new Date(a.scheduled).getTime() : 0
        const timeB = b.scheduled ? new Date(b.scheduled).getTime() : 0
        return timeB - timeA
      })

    // Display available games
    console.log(`\nAvailable ${opts.sport} games:`)
    console.log('─'.repeat(80))

    for (const game of activeGames) {
      const gameId = game.game_id || game.id || 'unknown'
      const homeTeam = game.home || 'Home'
      const awayTeam = game.away || 'Away'
      const startTime = game.scheduled
        ? new Date(game.scheduled).toLocaleString()
        : 'TBD'
      const status = (game.game_status as string) || 'scheduled'

      console.log(`${gameId.padEnd(30)} ${awayTeam} @ ${homeTeam}`)
      console.log(`${' '.repeat(30)} Start: ${startTime} | Status: ${status}`)
      console.log()
    }

    console.log(`Total: ${activeGames.length} games`)
    console.log('─'.repeat(80))
  }

  async x402Setup() {
    const opts: X402SetupConfigType = X402SetupConfig.parse(this.ctx.opts)
    const { X402Setup } = await import('./adapters/x402-setup.js')
    const setup = new X402Setup(this.ctx)
    await setup.run(opts['x402-funding-amount'])
  }

  async x402Pay() {
    const opts: X402PayConfigType = X402PayConfig.parse(this.ctx.opts)
    const { X402Adapter } = await import('./adapters/x402.js')
    const adapter = new X402Adapter(this.ctx)
    const result = await adapter.pay(
      opts['x402-session-key'] as `0x${string}`,
      opts['x402-url'],
      opts['x402-method'],
      opts['x402-body'],
    )
    console.log(`\nHTTP ${result.status}`)
    console.log(JSON.stringify(result.data, null, 2))
  }

  async x402Balance() {
    const opts: X402BalanceConfigType = X402BalanceConfig.parse(this.ctx.opts)
    const { X402Adapter } = await import('./adapters/x402.js')
    const adapter = new X402Adapter(this.ctx)
    const { formatted } = await adapter.getBalance(opts['x402-session-key'] as `0x${string}`)
    console.log(`\nUSDC Balance on Base: ${formatted}`)
  }
}
