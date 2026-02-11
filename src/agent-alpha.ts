import { ValueBetConfig, AvailableGamesConfig } from "./config.js"
import type {
  ValueBetConfig as ValueBetConfigType,
  AvailableGamesConfig as AvailableGamesConfigType,
  GlobalConfig as GlobalConfigType,
} from "./config.js"

export class AgentAlpha {
  private rawOpts: GlobalConfigType

  constructor(opts: GlobalConfigType) {
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
