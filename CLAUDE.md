# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent α is an automated trading bot for prediction markets (Kalshi) that uses real-time sports data from Shipp.ai and Claude AI for probability estimation. The bot analyzes live game events via a polling loop, identifies mispriced markets using AI-driven probability estimates, and executes trades with Kelly Criterion position sizing and multi-layered risk management.

## Commands

### Development
```bash
# Run the CLI (with tsx auto-execution via shebang)
./index.ts --help

# Or explicitly with tsx
yarn exec tsx index.ts --help

# Database migrations (pushes schema via drizzle-kit)
yarn migrate

# Run tests (vitest)
yarn test

# Run tests in watch mode
yarn test:watch
```

### Main Commands
```bash
# Value betting strategy (polls live events and trades)
./index.ts value-bet --game <game-id> --ai-provider-api-key <key>

# List available games for a sport
./index.ts available-games --sport NBA
```

All CLI arguments can be set via environment variables with the `AGENT_ALPHA_` prefix (see `.env.example`).

## Architecture

### Entry Point & CLI
- **index.ts**: Main entry point, uses yargs for CLI parsing with `dotenv/config` for env loading
- Two commands: `value-bet` and `available-games`
- Global options: `--demo`, `--paper`, `--db-filename`, `--shipp-api-key`
- All config validated via Zod schemas in `src/config.ts`

### Core Classes
- **AgentAlpha** (`src/agent-alpha.ts`): Top-level class that dispatches to commands. Creates `Context` and `ShippAdapter`, delegates trading to `TradingLoop`.
- **Context** (`src/ctx.ts`): Dependency injection container holding the Drizzle database connection and raw CLI opts. Shared across all classes.
- **Logs** (`src/log.ts`): Base class for structured logging using OpenTelemetry severity levels. All adapters and trading classes extend `Logs`.

### Configuration (`src/config.ts`)
Three Zod schemas:
- **GlobalConfig**: `demo`, `paper`, `db-filename`, `shipp-api-key`
- **ValueBetConfig**: Extends GlobalConfig with AI settings (`ai-model`, `ai-provider`, `ai-provider-api-key`, `ai-model-temperature`), Kalshi credentials (`kalshi-api-key-id`, `kalshi-private-key-path`), exchange selection, strategy params (`min-edge-pct`, `min-confidence`, `kelly-fraction`), risk limits (`max-total-exposure-usd`, `max-position-size-usd`, `max-single-market-percent`, `max-daily-loss-usd`, `max-daily-trades`, `min-account-balance-usd`), and `poll-interval-ms`
- **AvailableGamesConfig**: Extends GlobalConfig with `sport` selection

Shared enums: `Confidence` (low/medium/high), `AiProvider` (anthropic), `Sport` (NBA/NFL/NCAAFB/MLB/Soccer)

### Database (Drizzle ORM + libsql/SQLite)
Schema in `src/db/schema.ts` with five tables:
- **events**: Tracks game events (gameId, sport, desc)
- **orders**: Tracks trade orders — market info, side, size, entry/current/close prices, P&L, status, strategy, external order ID, timestamps, error messages
- **logs**: Structured log entries with severity and data
- **games**: Tracks games from Shipp — gameId (unique), sport, status (`scheduled`/`live`/`completed`), teams, venue, scheduled/actual start/end times, raw metadata JSON
- **connections**: Tracks Shipp connections for incremental polling — connectionId (unique), filterInstructions, sport, enabled flag, last run time, last event ID for cursor-based pagination

All primary keys use ULID (Universally Unique Lexicographically Sortable Identifier).

Drizzle is configured with `casing: 'snake_case'` — column names in the `games` and `connections` tables use explicit `text("snake_name")` for snake_case columns, while the original tables (`events`, `orders`, `logs`) use default camelCase field names.

### Trading System

**TradingLoop** (`src/trading/loop.ts`):
- Main polling loop for the `value-bet` command
- Accepts dependency injection via `TradingDeps` interface (shipp, kalshi, anthropic, riskManager) for testability
- Flow: look up game in DB → fetch Kalshi markets matching the game → poll Shipp for live events → for each market, get fresh prices → ask AI for probability estimate → compute edge (yes and no sides) → risk check → place order (paper or live)
- Accumulates all events across polls for growing context to AI
- Exits when game status becomes `completed` or `AbortSignal` fires
- Handles errors per-market without crashing the loop; uses exponential backoff on loop-level errors

**RiskManager** (`src/trading/risk-manager.ts`):
- Multi-check trade gate: edge threshold, confidence threshold, balance floor, daily trade count, daily loss limit, total exposure limit, single-market concentration limit
- Position sizing via Kelly Criterion with configurable fractional Kelly (`kelly-fraction`), capped at `max-position-size-usd`
- Queries the `orders` table for real-time stats (open positions, daily P&L, daily trade count)

### Adapters (`src/adapters/`)

All adapters extend `Logs` for structured logging.

**ShippAdapter** (`src/adapters/shipp.ts`):
- Wraps the Shipp.ai REST API (`https://api.shipp.ai/api/v1`) using axios
- `getSchedule()`: Fetches sport schedule, upserts games to DB with conflict handling
- `getOrCreateConnection()`: Creates or reuses Shipp connections (persisted in `connections` table)
- `getLiveEvents()`: Polls a connection with incremental cursor tracking (`since_event_id`), updates game status transitions (`scheduled` → `live` → `completed`), filters events by game ID
- Types defined in `src/adapters/shipp-types.ts`

**KalshiAdapter** (`src/adapters/kalshi.ts`):
- Wraps the Kalshi API via `kalshi-typescript` SDK
- Supports demo (`demo-api.kalshi.co`) and production (`api.elections.kalshi.com`) base URLs
- `searchMarkets()`: Finds markets by matching event titles against team names within a ±24h time window around scheduled game time. Maps sport to series ticker (e.g., NBA→`KXNBAGAME`, MLB→`KXMLBGAME`). Falls back to direct market search if event matching fails.
- `createOrder()`, `getMarket()`, `getBalance()`, `cancelOrder()`, `getOrder()`, `getOrderbook()`
- Soccer series tickers stored in `kalshi-soccer-series-tickers.json`

**AnthropicAdapter** (`src/adapters/anthropic.ts`):
- Uses `@anthropic-ai/sdk` for Claude API calls
- `estimateProbability()`: Sends game events and market info to Claude with a tool-use prompt (`estimate_probability` tool) to get structured output: `yesProbability` (0-1, clamped), `confidence`, and `reasoning`
- Uses forced tool choice (`tool_choice: { type: 'tool', name: 'estimate_probability' }`) for reliable structured output
- Default model: `claude-opus-4-6`, default temperature: `0.2`

### Module System
- ES modules (`"type": "module"` in package.json)
- All imports use `.js` extensions (required for ESM with TypeScript)
- TypeScript compiles to `dist/` with source maps, declarations, and declaration maps
- Yarn 4 with PnP (Plug'n'Play) — `.pnp.cjs` and `.pnp.loader.mjs` in root
- Requires Node.js `^24.13.1`

## Testing

Uses **vitest** (config in `vitest.config.ts`, 15s test timeout).

### Test Structure
- `tests/adapters/` — adapter unit tests (e.g., `anthropic.test.ts` mocks the SDK)
- `tests/trading/` — trading logic tests (`loop.test.ts`, `risk-manager.test.ts`)
- `tests/helpers/` — shared test infrastructure:
  - **`setup-db.ts`**: `createTestContext()` creates a `Context` with in-memory SQLite (manually creates all tables with raw SQL). `seedGame()` and `seedOrder()` for inserting test data.
  - **`mock-adapters.ts`**: Factory functions (`mockKalshi()`, `mockShipp()`, `mockAnthropic()`, `mockRiskManager()`) returning vi.fn()-based mocks. `makeDeps()` assembles a full `TradingDeps` object.
  - **`fixtures.ts`**: `makeMarket()`, `makeEvent()`, `makeConfig()` for building test data with sensible defaults and optional overrides.

### Testing Patterns
- The `TradingLoop` accepts a `TradingDeps` parameter for constructor injection, enabling full unit testing without real API calls
- Tests use `AbortSignal.timeout()` as a safety mechanism to prevent hanging
- Game completion is simulated by updating the `games` table status to `completed` during mock event polling
- In-memory SQLite tables are created with raw SQL matching the Drizzle schema column names (respecting the mixed casing: camelCase for original tables, snake_case for newer tables)

## Important Patterns

### Config Validation Flow
1. User provides options via CLI args or `AGENT_ALPHA_`-prefixed env vars
2. yargs parses and merges them
3. `AgentAlpha` constructor creates `Context` (which parses `GlobalConfig` for DB filename)
4. Command methods parse their specific config schema (e.g., `ValueBetConfig`)

### Database Access
```typescript
this.db = drizzle('file:' + dbFilename, { casing: 'snake_case' })
```
The `file:` prefix is prepended to the DB filename for libsql. Connection is initialized once in Context and shared everywhere.

### Adapter Base Class
All adapters and trading classes extend `Logs`, giving them structured logging + DB persistence:
```typescript
export class ShippAdapter extends Logs { ... }
export class TradingLoop extends Logs { ... }
export class RiskManager extends Logs { ... }
```

### Logging Severity Levels
Uses OpenTelemetry standard severities (1-24 scale):
- TRC=1, DBG=5, INF=9, ERR=17, FTL=21
- Logs are written to both stdout (via logfmt) and the `logs` DB table

### Trade Execution Flow
1. Poll Shipp for new live events
2. For each Kalshi market: get fresh prices → AI probability estimate → compute edge on both YES and NO sides → pick the side with more edge
3. RiskManager checks: edge ≥ min, confidence ≥ min, balance ≥ floor, daily trades < max, daily loss < max, exposure < max, single-market concentration < max
4. Kelly Criterion sizes the position (fractional Kelly, capped at max position size)
5. Order placed as paper (logged to DB) or live (submitted to Kalshi + logged to DB)

## TypeScript Configuration
- Target: ESNext with NodeNext module resolution
- Strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedSideEffectImports`, `moduleDetection: "force"`
- `jsx: "react-jsx"` enabled
- `noFallthroughCasesInSwitch` enabled
- Outputs: source maps, declarations, declaration maps
- `skipLibCheck: true`

## Key Dependencies
- **@anthropic-ai/sdk** — Claude API client
- **kalshi-typescript** — Kalshi prediction market SDK
- **drizzle-orm** + **@libsql/client** — ORM + SQLite driver
- **axios** — HTTP client for Shipp API
- **zod** — Runtime schema validation
- **yargs** — CLI argument parsing
- **id128** — ULID generation for primary keys
- **logfmt** — Structured log formatting
- **yaml** — YAML parsing
- **dotenv** — Environment variable loading
- **vitest** — Test runner (dev)
- **tsx** — TypeScript execution (dev)