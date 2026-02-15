# Database Layer

## Overview

SQLite database via **Drizzle ORM** + **@libsql/client**. Schema defined in `schema.ts`, migrations pushed via `yarn migrate` (`drizzle-kit push`).

## Connection

Initialized once in `Context` (`src/ctx.ts`) and shared across all classes:

```typescript
this.db = drizzle('file:' + dbFilename, { casing: 'snake_case' })
```

The `file:` prefix is required by libsql. Default filename is `db.sqlite` (configurable via `--db-filename` or `ALPH_BOT_DB_FILENAME`).

## Drizzle Configuration

`drizzle.config.ts` at project root:
- Dialect: `sqlite`
- Casing: `snake_case` — Drizzle auto-converts camelCase field names to snake_case column names
- Schema path: `./src/db/schema.ts`
- DB URL from `DB_URL` env var, defaults to `db.sqlite`

## Primary Keys

All tables use **ULID** (Universally Unique Lexicographically Sortable Identifier) via the `id128` package:

```typescript
id: text().$defaultFn(() => id128.Ulid.generate().toCanonical()).primaryKey()
```

ULIDs are time-ordered, so rows are naturally sorted by creation time. They are stored as canonical text strings.

## Schema (5 Tables)

### `events`
Tracks raw game events ingested from Shipp.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| gameId | TEXT NOT NULL | Shipp game identifier |
| sport | TEXT NOT NULL | e.g. NBA, NFL |
| desc | TEXT NOT NULL | Event description |

### `orders`
Tracks all trade orders (paper and live).

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| marketType | TEXT NOT NULL | e.g. `kalshi` |
| marketId | TEXT NOT NULL | Market ticker |
| marketTitle | TEXT NOT NULL | Human-readable title |
| side | TEXT NOT NULL | `yes` or `no` |
| size | REAL NOT NULL | Position size in cents |
| entryPrice | REAL NOT NULL | Entry price in cents |
| currentPrice | REAL | Current market price |
| pnl | REAL | Realized P&L in cents |
| status | TEXT NOT NULL | `open`, `closed`, `paper`, etc. |
| openedAt | INT NOT NULL | Timestamp (ms) |
| closedAt | INT | Timestamp (ms) |
| closePrice | REAL | Exit price |
| strategy | TEXT | e.g. `value-bet` |
| gameId | TEXT | Associated Shipp game ID |
| metadata | TEXT NOT NULL | JSON blob (AI estimate, risk check) |
| externalOrderId | TEXT | Kalshi order ID |
| avgFillPrice | REAL | Average fill price |
| submittedAt | INT | Timestamp (ms) |
| filledAt | INT | Timestamp (ms) |
| cancelledAt | INT | Timestamp (ms) |
| errorMessage | TEXT | Error details if failed |

### `logs`
Structured log entries persisted alongside stdout output.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| severity | INT NOT NULL | OpenTelemetry severity (1-24) |
| data | TEXT | Log message |

### `games`
Tracks games fetched from Shipp schedules. Upserted by `ShippAdapter.getSchedule()`.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| game_id | TEXT NOT NULL UNIQUE | Shipp game identifier (natural key) |
| sport | TEXT NOT NULL | e.g. NBA, NFL, Soccer |
| status | TEXT NOT NULL | `scheduled`, `live`, or `completed` |
| home_team | TEXT | Home team name |
| away_team | TEXT | Away team name |
| venue | TEXT | Venue name |
| scheduled_start_time | INT | Unix timestamp (seconds) |
| actual_start_time | INT | Unix timestamp (seconds) |
| end_time | INT | Unix timestamp (seconds) |
| created_at | INT NOT NULL | `Date.now()` default |
| updated_at | INT NOT NULL | `Date.now()` default |
| metadata | TEXT | Full JSON from Shipp schedule response |

### `connections`
Tracks Shipp API connections for incremental event polling with cursor-based pagination.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| connection_id | TEXT NOT NULL UNIQUE | ULID from Shipp API |
| filter_instructions | TEXT NOT NULL | Natural language filter sent to Shipp |
| sport | TEXT NOT NULL | Sport this connection monitors |
| enabled | INT NOT NULL DEFAULT 1 | Boolean (0/1) |
| name | TEXT | Human-readable label |
| description | TEXT | Optional description |
| created_at | INT NOT NULL | `Date.now()` default |
| last_run_at | INT | Last poll timestamp |
| last_event_id | TEXT | Last event ULID for incremental polling |

## Column Naming Convention

There is a **mixed casing pattern** across tables due to the schema evolving over time:

- **Original tables** (`events`, `orders`, `logs`): Fields use default Drizzle camelCase names (e.g. `gameId`, `marketType`, `entryPrice`). With the `casing: 'snake_case'` Drizzle config, these are stored as `game_id`, `market_type`, `entry_price` in SQLite.
- **Newer tables** (`games`, `connections`): Fields use explicit column name overrides via `text("snake_name")` (e.g. `text("game_id")`, `text("home_team")`).

Both approaches result in snake_case column names in the actual SQLite database, but the distinction matters for:
1. **Test setup** — `tests/helpers/setup-db.ts` creates tables with raw SQL and must match the actual column names. Original tables use quoted camelCase identifiers (`"gameId"`) because they were defined before the `casing` config was added, while newer tables use plain snake_case.
2. **Raw SQL queries** — If writing raw SQL outside Drizzle, use the actual SQLite column names.

## Game Status Lifecycle

Games progress through statuses managed by `ShippAdapter`:

```
scheduled → live → completed
```

- `scheduled`: Set when game is first fetched from schedule API
- `live`: Set when first live events are received for the game
- `completed`: Set when Shipp indicates the game has finished

The `TradingLoop` checks game status to decide whether to continue polling or exit.

## Querying Patterns

- **Open positions**: `WHERE status = 'open'` on `orders`
- **Daily stats**: `WHERE openedAt >= todayStartMs` on `orders` (millisecond timestamps)
- **Market exposure**: `WHERE marketId = ? AND status = 'open'` on `orders`
- **Game lookup**: `WHERE gameId = ?` on `games` (unique constraint)
- **Connection reuse**: `WHERE filterInstructions = ?` on `connections`
- **Incremental polling**: Read `lastEventId` from `connections`, pass as `since_event_id` to Shipp API
