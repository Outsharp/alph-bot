import { ValueBetConfig, AvailableGamesConfig, GlobalConfig } from "./config.js"
import {
  type ValueBetConfig as ValueBetConfigType,
  type AvailableGamesConfig as AvailableGamesConfigType,
} from "./config.js"
import { Context } from "./ctx.js"
import { ShippAdapter } from "./adapters/shipp.js"

export class AgentAlpha {
  private ctx: Context
  private shipp: ShippAdapter

  constructor(opts: unknown) {
    this.ctx = new Context(opts)

    // Initialize Shipp adapter (will be used by both commands)
    const globalConfig = GlobalConfig.parse(opts)
    this.shipp = new ShippAdapter(this.ctx, globalConfig["shipp-api-key"])
  }

  async valueBet() {
    const opts: ValueBetConfigType = ValueBetConfig.parse(this.ctx.opts)

    // Poll live events for each specified game
    if (opts.game && opts.game.length > 0) {
      for (const gameId of opts.game) {
        const events = await this.shipp.getLiveEvents({
          gameId,
          sport: 'NBA', // TODO: infer from gameId or make configurable
          limit: 50,
        })

        // getLiveEvents() internally checks game status:
        // - If 'scheduled': polls normally, updates to 'live' on first event
        // - If 'live': polls normally
        // - If 'completed': skips API call, returns empty array

        if (events.data.length === 0) continue; // Skip if no events or game completed

        // TODO: Process events for trading logic
        // - Analyze events with Claude AI
        // - Query Kalshi market data
        // - Identify mispriced markets
        // - Execute trades with risk management
      }
    }
  }

  async availableGames() {
    const opts: AvailableGamesConfigType = AvailableGamesConfig.parse(this.ctx.opts)

    // Fetch schedule from Shipp
    const schedule = await this.shipp.getSchedule({
      sport: opts.sport,
    })

    // Display available games
    console.log(`\nAvailable ${opts.sport} games:`)
    console.log('─'.repeat(80))

    for (const game of schedule.schedule) {
      const gameId = game.game_id || game.id || 'unknown'
      const homeTeam = game.home || 'Home'
      const awayTeam = game.away || 'Away'
      const startTime = game.scheduled
        ? new Date(game.scheduled).toLocaleString()
        : 'TBD'
      const status = game.status || 'scheduled'

      console.log(`${gameId.padEnd(30)} ${awayTeam} @ ${homeTeam}`)
      console.log(`${' '.repeat(30)} Start: ${startTime} | Status: ${status}`)
      console.log()
    }

    console.log(`Total: ${schedule.schedule.length} games`)
    console.log('─'.repeat(80))
  }
}
