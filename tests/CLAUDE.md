# Testing

Uses **vitest** (config in `vitest.config.ts`, 15s test timeout).

## Test Structure

- `tests/adapters/` — adapter unit tests (e.g., `anthropic.test.ts` mocks the SDK)
- `tests/trading/` — trading logic tests (`loop.test.ts`, `risk-manager.test.ts`)
- `tests/helpers/` — shared test infrastructure

## Test Helpers

### `helpers/setup-db.ts` — In-Memory Database

- **`createTestContext()`**: Creates a `Context` with an in-memory SQLite database. Manually creates all five tables (`events`, `orders`, `logs`, `games`, `connections`) using raw SQL. Bypasses `GlobalConfig.parse` — constructs the Context-like object directly.
- **`seedGame()`**: Inserts a game record with sensible defaults (gameId `test-game-1`, sport `NBA`, status `live`, Lakers vs Celtics). Returns the inserted values. Accepts partial overrides.
- **`seedOrder()`**: Inserts an order record with defaults (market `MKT-TEST`, side `yes`, status `open`, size 1000). Returns the inserted values. Accepts partial overrides.

**Important casing note**: The raw SQL in `createTestContext()` must match the actual Drizzle schema column names. The original tables (`events`, `orders`, `logs`) use camelCase column names (e.g., `"gameId"`, `"marketType"`, `"entryPrice"`), while the newer tables (`games`, `connections`) use snake_case column names (e.g., `game_id`, `home_team`, `connection_id`). If new columns are added to the Drizzle schema, the raw SQL here must be updated to match.

### `helpers/mock-adapters.ts` — Mock Factories

Factory functions that return `vi.fn()`-based mocks typed as the real adapter interfaces:

- **`mockKalshi()`**: Returns mock `KalshiAdapter` — `getBalance` returns 50000 (i.e., $500), `searchMarkets` returns `[]`, `createOrder` returns a filled order stub.
- **`mockShipp()`**: Returns mock `ShippAdapter` — `getLiveEvents` returns empty data, `getSchedule` returns empty schedule.
- **`mockAnthropic()`**: Returns mock `AnthropicAdapter` — `estimateProbability` returns `{ yesProbability: 0.65, confidence: 'high', reasoning: 'test reasoning' }`.
- **`mockRiskManager()`**: Returns mock `RiskManager` — `checkTrade` returns approved with 10 contracts at 5000 cents, `getStats` returns zeroed-out stats with 50000 balance.
- **`makeDeps(overrides?)`**: Assembles a full `TradingDeps` object from the above mocks with optional partial overrides.

### `helpers/fixtures.ts` — Test Data Builders

Builder functions with sensible defaults and optional partial overrides:

- **`makeMarket()`**: Returns a `MarketWithPrices` — ticker `MKT-TEST`, yesAsk 50, noAsk 52, active status.
- **`makeEvent()`**: Returns a `ShippEvent` — event_id `evt-1`, game_id `test-game-1`, with a description.
- **`makeConfig()`**: Returns a `ValueBetConfig` — paper mode enabled, in-memory DB, all risk/strategy params at defaults. This is the canonical test config.

## Testing Patterns

### Dependency Injection for TradingLoop

`TradingLoop` accepts an optional `TradingDeps` parameter in its constructor. In production, adapters are created from config. In tests, mock deps are injected:

```typescript
const deps = makeDeps()
const loop = new TradingLoop(ctx, config, deps)
```

This enables full unit testing of the trading loop without any real API calls.

### AbortSignal Safety

Tests wrap `loop.run()` calls with `AbortSignal.timeout()` to prevent infinite hangs if the loop fails to exit:

```typescript
function safetySignal(ms = 10_000) {
  return AbortSignal.timeout(ms)
}
await loop.run('test-game-1', safetySignal())
```

### Simulating Game Completion

The polling loop exits when the game status becomes `completed`. Tests simulate this by having the mock `getLiveEvents` update the `games` table on its second call:

```typescript
vi.mocked(deps.shipp.getLiveEvents).mockImplementation(async () => {
  callCount++
  if (callCount === 1) {
    return { connection_id: 'conn-1', data: [makeEvent()] }
  }
  // Mark game completed so loop exits
  await ctx.db.update(games).set({ status: 'completed' }).where(eq(games.gameId, 'test-game-1')).run()
  return { connection_id: 'conn-1', data: [] }
})
```

### Anthropic SDK Mocking

The `anthropic.test.ts` file uses `vi.mock()` to replace the entire `@anthropic-ai/sdk` module with a mock class. The mock exposes `messages.create` as a `vi.fn()` that can be configured per-test to return different tool_use responses.

## Running Tests

```bash
# Run all tests once
yarn test

# Run tests in watch mode
yarn test:watch

# Run a specific test file
yarn exec vitest run tests/trading/loop.test.ts
```
