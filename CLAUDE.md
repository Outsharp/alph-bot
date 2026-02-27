# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alph Bot is an automated trading bot for prediction markets (Kalshi) that uses real-time sports data from Shipp.ai and Claude AI for probability estimation. The bot analyzes live game events via a polling loop, identifies mispriced markets using AI-driven probability estimates, and executes trades with Kelly Criterion position sizing and multi-layered risk management.

Detailed documentation for each subsystem lives in co-located `CLAUDE.md` files:

- **`src/trading/CLAUDE.md`** — Trading loop, risk manager, value-bet strategy, trade execution flow
- **`src/adapters/CLAUDE.md`** — Shipp (live data), Kalshi (exchange), Anthropic (AI probability analyzer)
- **`src/db/CLAUDE.md`** — Database schema, tables, ULID keys, Drizzle ORM conventions
- **`tests/CLAUDE.md`** — Test infrastructure, helpers, fixtures, mocking patterns

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

### Enter Email for Free Shipp Account and Groq Tokens
Without shipp, you won't have access to live data as the game occurs

```bash
./index.ts create-account --email user@shipp.ai

# Afterwards, open the email from shipp and click `continue`
# copy the api key from the dashboard and save to .env
```
Click `continue` from the `Welcome to Shipp` email.

### Trade with Kalshi

An API Key is required
[Create an API Key](https://alph.bot/posts/kalshi-api-key/)

### Config

All CLI arguments can be set via environment variables with the `ALPH_BOT_` prefix (see `.env.example`).

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

### Module System
- ES modules (`"type": "module"` in package.json)
- All imports use `.js` extensions (required for ESM with TypeScript)
- TypeScript compiles to `dist/` with source maps, declarations, and declaration maps
- Yarn 4 with PnP (Plug'n'Play) — `.pnp.cjs` and `.pnp.loader.mjs` in root
- Requires Node.js `^24.13.1`

## Important Patterns

### Config Validation Flow
1. User provides options via CLI args or `ALPH_BOT_`-prefixed env vars
2. yargs parses and merges them
3. `AgentAlpha` constructor creates `Context` (which parses `GlobalConfig` for DB filename)
4. Command methods parse their specific config schema (e.g., `ValueBetConfig`)

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
