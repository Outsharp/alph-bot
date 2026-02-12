import { ValueBetConfig, AvailableGamesConfig } from "./config.js"
import {
  type ValueBetConfig as ValueBetConfigType,
  type AvailableGamesConfig as AvailableGamesConfigType,
  GlobalConfig as GlobalConfigType,
} from "./config.js"
import { Context } from "./ctx.js"

export class AgentAlpha {
  private ctx: Context

  constructor(opts: unknown) {
    this.ctx = new Context(opts)
  }

  async valueBet() {
    const opts: ValueBetConfigType = ValueBetConfig.parse(this.ctx.opts)
    // execute based on actions
  }

  async availableGames() {
    const opts: AvailableGamesConfigType = AvailableGamesConfig.parse(this.ctx.opts)
  }
}
