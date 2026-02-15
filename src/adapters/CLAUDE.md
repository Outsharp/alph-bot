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

### Configuration

- Default model: `claude-opus-4-6`
- Default temperature: `0.2` (low for more deterministic estimates)
- Both are configurable via `--ai-model` and `--ai-model-temperature`

### Output

Returns a `ProbabilityEstimate` object. The trading loop uses `yesProbability` to compute edge on both sides:
- YES edge = `yesProbability - (yesAsk / 100)`
- NO edge = `(1 - yesProbability) - (noAsk / 100)`

The side with more positive edge (if any) is selected for trading.