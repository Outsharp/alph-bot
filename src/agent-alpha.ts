import { ValueBetConfig, AvailableGamesConfig } from "./config.js"
import {
  type ValueBetConfig as ValueBetConfigType,
  type AvailableGamesConfig as AvailableGamesConfigType,
  GlobalConfig as GlobalConfigType,
} from "./config.js"

export class AgentAlpha {
  private rawOpts: GlobalConfigType

  constructor(opts: unknown) {
    this.rawOpts = GlobalConfigType.parse(opts)
  }

  async valueBet() {
    const opts: ValueBetConfigType = ValueBetConfig.parse(this.rawOpts)
    // execute based on actions
  }

  async availableGames() {
    const opts: AvailableGamesConfigType = AvailableGamesConfig.parse(this.rawOpts)
  }
}
