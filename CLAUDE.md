# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent α is an automated trading bot for prediction markets (Kalshi & Polymarket) that uses real-time sports data from Shipp.ai and Claude AI for probability estimation. The bot analyzes live game events, identifies mispriced markets, and executes trades using configurable strategies and risk management.

## Commands

### Development
```bash
# Run the CLI (with tsx auto-execution via shebang)
./index.ts --help

# Or explicitly with tsx
yarn exec tsx index.ts --help

# Database migrations (uses drizzle-kit)
yarn migrate
```

### Main Commands
```bash
# Value betting strategy
./index.ts value-bet --game <game-id> --ai-provider-api-key <key>

# List available games
./index.ts available-games --sport NBA
```

All CLI arguments can be set via environment variables with the `AGENT_ALPHA_` prefix (see `.env.example`).

## Architecture

### Entry Point & CLI
- **index.ts**: Main entry point, uses yargs for CLI parsing
- Two primary commands: `value-bet` and `available-games`
- All options validated via Zod schemas in `src/config.ts`

### Core Classes
- **AgentAlpha** (`src/agent-alpha.ts`): Main application class that handles command dispatch
- **Context** (`src/ctx.ts`): Dependency injection container providing database and config to other classes
- **Logs** (`src/log.ts`): Structured logging using OpenTelemetry severity levels

### Configuration Pattern
Configuration is split into three Zod schemas in `src/config.ts`:
- `GlobalConfig`: Shared options (demo, paper, db-filename)
- `ValueBetConfig`: Extends GlobalConfig with trading strategy, AI, Kalshi, Shipp settings
- `AvailableGamesConfig`: Extends GlobalConfig with sport selection

The Context class parses GlobalConfig to initialize the database connection, then individual commands parse their specific configs.

### Database (Drizzle ORM + SQLite)
Schema defined in `src/db/schema.ts` with three tables:
- **events**: Tracks game events (gameId, sport, desc)
- **orders**: Tracks trade orders with market info, P&L, status, metadata
- **logs**: Structured logging with severity and data fields

All primary keys use ULID (Universally Unique Lexicographically Sortable Identifier) for time-ordered IDs.

### External Integrations
- **Shipp.ai**: Real-time sports data (see `.claude/skills/shipp/SKILL.md` for API details)
- **Kalshi**: Prediction market trading platform
- **Anthropic Claude**: AI model for probability estimation (defaults to claude-opus-4-6)
- **Polymarket**: Additional prediction market (planned support)

### Module System
- Uses ES modules (`"type": "module"` in package.json)
- All imports use `.js` extensions (required for ESM even in TypeScript)
- TypeScript compiles to `dist/` with source maps

## Important Patterns

### Config Validation Flow
1. User provides options via CLI args or env vars
2. yargs parses and merges them into `opts` object
3. `Context` constructor parses `GlobalConfig` to get db filename
4. Command methods (e.g., `valueBet()`) parse command-specific config schemas

### Database Access
The database connection is initialized once in the Context constructor and shared across the application:
```typescript
this.db = drizzle(dbFilename)  // Creates libsql connection
```

### Logging Severity Levels
Uses OpenTelemetry standard severities (1-24 scale):
- TRC=1, DBG=5, INF=9, ERR=17, FTL=21

## TypeScript Configuration
- Target: ESNext with NodeNext modules
- Strict mode enabled with additional strictness (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Isolated modules for faster compilation
