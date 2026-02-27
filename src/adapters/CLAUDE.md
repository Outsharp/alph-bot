# Adapters

All adapters live in `src/adapters/` and extend the `Logs` base class (`src/log.ts`), giving them structured logging to both stdout (logfmt) and the `logs` database table.

## ShippAdapter (`shipp.ts`)

Real-time sports data feed from [Shipp.ai](https://platform.shipp.ai). Wraps the REST API at `https://api.shipp.ai/api/v1` using an axios instance with automatic API key injection via request interceptor.

### Key Methods

- **`getSchedule(options)`** — Fetches the schedule for a sport (NBA, NFL, NCAAFB, MLB, Soccer). Upserts every game into the `games` DB table with `onConflictDoUpdate` keyed on `gameId`. This is the entry point for the `available-games` command and also used by the trading loop to bootstrap a game record before polling.

- **`getOrCreateConnection(options)`** — Manages Shipp connections for incremental event streaming. Checks the `connections` DB table first; if a matching `filterInstructions` row exists, reuses that `connectionId`. Otherwise creates a new connection via `POST /connections/create` and persists it.

- **`getLiveEvents(options)`** — The main polling method used by the trading loop. Flow:
  1. Short-circuits if the game's DB status is `completed`
  2. Builds a filter instruction string and calls `getOrCreateConnection()`
  3. Loads the last `since_event_id` cursor from the `connections` table for incremental polling
  4. Calls `POST /connections/{connectionId}` with the cursor
  5. Filters returned events to only those matching the target `game_id`
  6. Transitions game status (`scheduled` → `live` when first events arrive)
  7. Updates the connection's `lastEventId` cursor for the next poll

- **`updateGameStatus(gameId, status)`** — Transitions a game through `scheduled` → `live` → `completed`, setting `actualStartTime` or `endTime` timestamps as appropriate.

- **`listConnections()`** — Lists all Shipp connections (debugging/monitoring).

### Types (`shipp-types.ts`)

Defines all request/response interfaces and the `GameStatus` type. Event shapes are intentionally flexible (`[key: string]: unknown`) since they vary by sport and feed. Key fields on `ShippEvent`: `event_id`, `id`, `game_id`, `wall_clock_start`.

`GetScheduleOptions` takes a `sport` (from the `Sport` Zod enum). `GetLiveEventsOptions` takes `gameId`, `sport`, and optional `since`/`sinceEventId`/`limit`.

## KalshiAdapter (`kalshi.ts`)

Prediction market exchange integration via the `kalshi-typescript` SDK. Manages four API clients: `OrdersApi`, `MarketApi`, `EventsApi`, `PortfolioApi`.

### Configuration

- **Demo mode**: `https://demo-api.kalshi.co/trade-api/v2` (when `--demo` flag is set)
- **Production**: `https://api.elections.kalshi.com/trade-api/v2`
- Auth: API key ID (`--kalshi-api-key-id`) + private key file path (`--kalshi-private-key-path`)

### Key Methods

- **`searchMarkets(options)`** — The market discovery engine. Given home/away team names, scheduled time, and sport:
  1. Maps sport to Kalshi series ticker(s) via `sportToSeriesTicker()` (e.g., `NBA` → `KXNBAGAME`, `MLB` → `KXMLBGAME`, `Soccer` → tickers from `kalshi-soccer-series-tickers.json`)
  2. Fetches events with nested markets in a ±24h window around the scheduled game time
  3. Matches events by splitting the event title on `"vs"` and comparing against home/away names (uses `startsWith` matching on lowercased strings)
  4. Falls back to a direct market search if no event-level matches are found, matching team names against market title/subtitle fields
  5. Returns `MarketWithPrices[]` — normalized objects with ticker, title, subtitles, bid/ask/last for both YES and NO sides, volume, open interest, close time

- **`createOrder(options)`** — Places an order. Supports `market` (default) and `limit` types, `yes`/`no` sides, `buy`/`sell` actions. Returns the Kalshi `Order` object.

- **`getMarket(ticker)`** — Fetches a single market with current prices. Used by the trading loop to get fresh bid/ask before each trade decision.

- **`getBalance()`** — Returns account balance in cents from the portfolio API.

- **`getOrderbook(ticker, depth?)`**, **`cancelOrder(orderId)`**, **`getOrder(orderId)`** — Supporting methods for order management.

### Sport → Series Ticker Mapping

| Sport    | Series Ticker(s)         |
|----------|--------------------------|
| NBA      | `KXNBAGAME`              |
| NFL      | `KXNFLGAME`              |
| MLB      | `KXMLBGAME`              |
| NCAAMB   | `KXNCAAMBGAME`           |
| NCAAFB   | *(empty — not mapped)*   |
| Soccer   | Multiple (from JSON file) |

## AnthropicAdapter (`anthropic.ts`)

AI-powered probability estimation using Claude. This is the "brain" that analyzes live game state and predicts market outcomes.

### How It Works

`estimateProbability()` sends a structured prompt to Claude with:
- The sport, game ID, and full accumulated event history (all events serialized as JSON)
- The target market's ticker, title, YES subtitle, and NO subtitle

The prompt uses **forced tool use** — a custom tool called `estimate_probability` with `tool_choice: { type: 'tool', name: 'estimate_probability' }` — to guarantee structured output every time. The tool schema requires:
- `yesProbability` (number, 0–1) — clamped to [0, 1] on the adapter side
- `confidence` (`low` | `medium` | `high`)
- `reasoning` (string explanation)

### System Prompt Behavior

The system prompt instructs Claude to act as a calibrated sports analyst: use base rates, current score, time remaining, and momentum. It explicitly warns against overconfidence and instructs low confidence when information is insufficient.

The system prompt and user-message builder are exported from `anthropic.ts` (`SYSTEM_PROMPT`, `buildUserMessage()`) so other clients can reuse them.

### Output

Returns a `ProbabilityEstimate` object. The trading loop uses `yesProbability` to compute edge on both sides:
- YES edge = `yesProbability - (yesAsk / 100)`
- NO edge = `(1 - yesProbability) - (noAsk / 100)`

The side with more positive edge (if any) is selected for trading.

## AI Module Architecture (`ai/`)

The AI subsystem lives in `src/adapters/ai/` and follows a **client ↔ adapter** pattern that makes providers plug-and-play.

### Key Files

| File | Purpose |
|------|---------|
| `client.ts` | `AiClient` interface, `ProbabilityEstimate`, `MarketDescriptor`, `AiClientOptions` types |
| `ai.ts` | `AiAdapter` facade (extends `Logs`), `createClient()` factory, `AiAdapterOptions` type |
| `anthropic.ts` | `AnthropicClient` — implements `AiClient` via `@anthropic-ai/sdk` (requires API key) |
| `claude.ts` | `ClaudeCliClient` — implements `AiClient` by shelling out to the `claude` CLI (no API key) |
| `config.ts` | `AiProviderEnum` Zod schema, `AiConfig` with cross-field refinement |
| `index.ts` | Barrel re-exports for the module |

### `AiClient` Interface (`client.ts`)

The contract every AI provider must implement:

```typescript
interface AiClient {
  readonly name: string
  estimateProbability(
    sport: string,
    gameId: string,
    events: ShippEvent[],
    market: MarketDescriptor,
  ): Promise<ProbabilityEstimate>
}
```

Clients are **stateless** and **do not extend `Logs`** — they are pure transport wrappers. Logging and safety clamping are handled by the `AiAdapter` facade that wraps them.

### `AiAdapter` Facade (`ai.ts`)

The high-level class consumed by the trading loop. It:

1. Wraps any `AiClient` implementation
2. Extends `Logs` for structured logging (stdout + DB)
3. Applies belt-and-suspenders probability clamping to `[0, 1]`
4. Exposes `AiAdapter.create(ctx, opts)` — an async factory that picks the right client via `createClient()`

The trading loop never touches `AiClient` directly; it always goes through `AiAdapter`.

### `createClient()` Factory (`ai.ts`)

Maps `AiProvider` → `AiClient`:

| Provider | Client | API Key Required? |
|----------|--------|-------------------|
| `anthropic` | `AnthropicClient` | **Yes** — `--ai-provider-api-key` or `ALPH_BOT_AI_PROVIDER_API_KEY` |
| `claude-cli` | `ClaudeCliClient` | **No** — uses the CLI's own auth (`claude auth login`) |

For `claude-cli`, the factory calls `assertClaudeCliReady()` before constructing the client, which checks that the `claude` binary is on `PATH` and authenticated.

### `AnthropicClient` (`anthropic.ts`)

Uses the `@anthropic-ai/sdk` Messages API with **forced tool use** (`tool_choice: { type: 'tool', name: 'estimate_probability' }`) to guarantee structured output. Exports `SYSTEM_PROMPT` and `buildUserMessage()` so other clients can reuse the same prompt structure.

### `ClaudeCliClient` (`claude.ts`)

Shells out to the locally installed `claude` CLI via `node:child_process.execFile`. Uses `--print --output-format text --model <model> --prompt <prompt>`. The prompt asks for a raw JSON response, which is parsed with fallback handling for markdown fences and embedded JSON.

`assertClaudeCliReady()` performs two pre-flight checks:
1. `claude --version` — is the binary installed?
2. `claude auth status` — is the user authenticated?

### Configuration

- **`--ai-provider`**: `anthropic` (default) or `claude-cli`
- **`--ai-model`**: Model name passed to the provider (default: `claude-opus-4-6`)
- **`--ai-model-temperature`**: Sampling temperature (default: `0.2`)
- **`--ai-provider-api-key`**: Required for `anthropic`, ignored for `claude-cli`

Cross-field validation in `ValueBetConfig` (via Zod `.superRefine()`) ensures `anthropic` always has an API key while `claude-cli` does not require one.

### Adding a New Provider

1. Create `src/adapters/ai/my-provider.ts` with a class implementing `AiClient`
2. Add the provider name to the `AiProvider` union in `ai.ts` and the Zod enum in `config.ts`
3. Add a `case` in `createClient()` in `ai.ts`
4. If the provider needs an API key, add validation in the `.superRefine()` block in `src/config.ts`
5. Add the choice to `--ai-provider` in `index.ts` CLI options