import { ValueBetConfig, AvailableGamesConfig } from "./config.js"
import type { ValueBetConfig as ValueBetConfigType, AvailableGamesConfig as AvailableGamesConfigType } from "./config.js"

export class AgentAlpha {
  private rawOpts: unknown

  constructor(opts: unknown) {
    this.rawOpts = opts
  }

  async valueBet() {
    const opts: ValueBetConfigType = ValueBetConfig.parse(this.rawOpts)
    // execute based on actions
  }

  async availableGames() {
    const opts: AvailableGamesConfigType = AvailableGamesConfig.parse(this.rawOpts)
  }
}