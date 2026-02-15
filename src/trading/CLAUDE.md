# Trading System

The trading system lives in `src/trading/` and implements the core value-betting strategy. It is composed of two main classes that work together: `TradingLoop` orchestrates the polling and decision-making, while `RiskManager` gates every trade through multi-layered risk checks and sizes positions using Kelly Criterion.

Both classes extend `Logs` (from `src/log.ts`) for structured logging with DB persistence.

## TradingLoop (`loop.ts`)

The main polling loop powering the `value-bet` command. One loop instance runs per game.

### Dependency Injection

The constructor accepts an optional `TradingDeps` object for testability:

```typescript
interface TradingDeps {
  shipp: ShippAdapter
  kalshi: KalshiAdapter
  anthropic: AnthropicAdapter
  riskManager: RiskManager
}
```

When `deps` is omitted (production path), the loop constructs real adapter instances from config. When provided (test path), it uses the injected mocks. This is the primary seam for unit testing the loop without real API calls.

### Run Flow

`run(gameId, signal?)` executes the full lifecycle:

1. **Game lookup** — Finds the game in the `games` DB table. If missing, iterates all supported sports fetching schedules from Shipp to populate it.
2. **Status check** — Exits immediately if status is `completed`. Logs a waiting message if `scheduled`.
3. **Market discovery** — Calls `kalshi.searchMarkets()` with the game's home/away teams and scheduled time. Exits if no markets found.
4. **Poll loop** — Repeats until the game completes or `AbortSignal` fires:
   - Poll Shipp for new live events via `shipp.getLiveEvents()`
   - If no events and game is completed → exit
   - If no events → sleep `poll-interval-ms` and retry
   - Accumulate events into a growing `allEvents` array (AI gets full game context each call)
   - For each discovered market, call `processMarket()`
   - Log trading stats summary
   - Sleep `poll-interval-ms`
5. **Error handling** — Per-market errors are caught and logged without crashing the loop. Loop-level errors trigger a 2× backoff sleep before retrying.

### Market Processing (`processMarket`)

For a single market on each poll cycle:

1. **Fresh prices** — Fetches current market state from Kalshi. Skips if market is no longer `active`.
2. **AI estimate** — Sends all accumulated game events + market info to Claude. Gets back `yesProbability`, `confidence`, and `reasoning`.
3. **Edge computation** — Calculates edge on both sides:
   - `yesEdge = estimatedProbability - (yesAsk / 100)`
   - `noEdge = (1 - estimatedProbability) - (noAsk / 100)`
   - Picks the side with greater positive edge. Skips if neither side has positive edge.
4. **Risk check** — Passes the trade request to `RiskManager.checkTrade()`. Skips if rejected.
5. **Order execution**:
   - **Paper mode** (`config.paper = true`): Logs the trade, inserts an order row with status `paper`
   - **Live mode**: Submits a market order to Kalshi via `kalshi.createOrder()`, inserts an order row with status `open` and the external order ID

## RiskManager (`risk-manager.ts`)

Multi-check trade gate that approves or rejects every trade before execution. Also responsible for position sizing.

### Trade Check Pipeline (`checkTrade`)

Receives a `TradeRequest` and runs these checks in order. Any failure short-circuits with a rejection:

1. **Edge threshold** — `(estimatedProbability - marketPrice) * 100` must be ≥ `min-edge-pct` (default: 5%)
2. **Confidence threshold** — AI confidence (`low`/`medium`/`high`) must meet or exceed `min-confidence` (default: `medium`)
3. **Balance floor** — Kalshi account balance must be ≥ `min-account-balance-usd` (default: $100)
4. **Daily trade count** — Today's trade count must be < `max-daily-trades` (default: 50)
5. **Daily loss limit** — Today's realized P&L must not exceed `max-daily-loss-usd` (default: $500)
6. **Total exposure limit** — Sum of all open order sizes must be < `max-total-exposure-usd` (default: $10,000)
7. **Single-market concentration** — Exposure in this specific market as a percentage of total exposure must be < `max-single-market-percent` (default: 20%)

### Kelly Criterion Position Sizing

After all checks pass, the position is sized using fractional Kelly:

```
b = (100 / marketPriceCents) - 1      // implied odds
kelly = (b * p - q) / b                // full Kelly fraction
adjustedKelly = max(0, kelly * kellyFraction)  // fractional Kelly (default 0.25)
positionSizeCents = floor(balance * adjustedKelly)
```

The position is then capped at `max-position-size-usd`. Contract count is `floor(positionSizeCents / marketPriceCents)`. If contract count rounds to zero, the trade is rejected.

### Stats Aggregation (`getStats`)

Queries live trading state from the database:

- **balanceCents** — From Kalshi API (`kalshi.getBalance()`)
- **openPositionCount / totalExposureCents** — From `orders` table where `status = 'open'`
- **dailyTradeCount / dailyPnlCents** — From `orders` table where `openedAt >= todayStartMs`

Stats are used both for risk checks and for the summary line logged each poll cycle.

## Value-Bet Strategy Overview

The value-bet strategy is the only trading strategy currently implemented. The core thesis:

1. **Information edge** — Real-time game events from Shipp provide context that prediction markets may not have fully priced in yet.
2. **AI probability estimation** — Claude analyzes the full event stream and produces a calibrated probability estimate for each market outcome.
3. **Edge detection** — The difference between Claude's estimate and the market price is the "edge." Trades are only placed when edge exceeds the configured minimum.
4. **Risk-adjusted sizing** — Kelly Criterion ensures position sizes are proportional to edge magnitude and confidence, while hard limits prevent catastrophic exposure.
5. **Continuous monitoring** — The polling loop re-evaluates every market each cycle as new events arrive, allowing the system to react to changing game dynamics.

## Configuration Defaults (for reference)

| Parameter | Default | Description |
|---|---|---|
| `min-edge-pct` | 5 | Minimum edge % to trade |
| `min-confidence` | medium | Minimum AI confidence |
| `kelly-fraction` | 0.25 | Fractional Kelly multiplier |
| `max-total-exposure-usd` | 10,000 | Total open exposure cap |
| `max-position-size-usd` | 1,000 | Single position cap |
| `max-single-market-percent` | 20 | Max % of exposure in one market |
| `max-daily-loss-usd` | 500 | Daily loss stop |
| `max-daily-trades` | 50 | Daily trade count limit |
| `min-account-balance-usd` | 100 | Balance floor before halting |
| `poll-interval-ms` | 5,000 | Polling frequency |