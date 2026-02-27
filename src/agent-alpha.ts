import { ValueBetConfig, AvailableGamesConfig, GlobalConfig, CreateAccountConfig } from "./config.js"
import {
  type ValueBetConfig as ValueBetConfigType,
  type AvailableGamesConfig as AvailableGamesConfigType,
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

    const loop = new TradingLoop(this.ctx, opts)
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
}
