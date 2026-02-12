import { Configuration, PortfolioApi } from 'kalshi-typescript';
import { Logs, Severity } from '../log.js';
import type { Context } from '../ctx.js';
import { GlobalConfig } from '../config.js';

const demoRoot = 'https://demo-api.kalshi.co/trade-api/v2'
const prodRoot = 'https://api.elections.kalshi.com/trade-api/v2'

export class KalshiAdapter extends Logs {
  private readonly api: PortfolioApi;

  constructor(protected ctx: Context, apiKeyId: string, privateKeyPath: string) {
    super(ctx)

    const basePath = GlobalConfig.parse(ctx.opts).demo ? demoRoot : prodRoot

    this.api = new PortfolioApi(new Configuration({
      apiKey: apiKeyId,
      privateKeyPath: privateKeyPath,
      basePath: basePath
    }));
  }

  async checkBalance(): Promise<number> {
    const b = await this.api.getBalance()

    this.log(Severity.DBG, `Kalshi: current balance available ${(b.data.balance ?? 0) / 100}`)

    return b.data.balance ?? 0
  }
}
