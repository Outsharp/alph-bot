import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { games, orders } from '../../src/db/schema.js'
import type { Context } from '../../src/ctx.js'
import id128 from 'id128'

/**
 * Creates a Context with an in-memory SQLite database for testing.
 */
export async function createTestContext(overrides?: Partial<{ demo: boolean; paper: boolean }>): Promise<Context> {
  const db = drizzle(':memory:')

  // Create tables matching drizzle schema column names.
  // Fields with explicit text("snake_name") use snake_case; others use camelCase.
  await db.run(sql`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    sport TEXT NOT NULL,
    "desc" TEXT NOT NULL
  )`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    "marketType" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "marketTitle" TEXT NOT NULL,
    side TEXT NOT NULL,
    size REAL NOT NULL,
    "entryPrice" REAL NOT NULL,
    "currentPrice" REAL,
    pnl REAL,
    status TEXT NOT NULL,
    "openedAt" INTEGER NOT NULL,
    "closedAt" INTEGER,
    "closePrice" REAL,
    strategy TEXT,
    "gameId" TEXT,
    metadata TEXT NOT NULL,
    "externalOrderId" TEXT,
    "avgFillPrice" REAL,
    "submittedAt" INTEGER,
    "filledAt" INTEGER,
    "cancelledAt" INTEGER,
    "errorMessage" TEXT
  )`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    severity INTEGER NOT NULL,
    data TEXT
  )`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL UNIQUE,
    sport TEXT NOT NULL,
    status TEXT NOT NULL,
    home_team TEXT,
    away_team TEXT,
    venue TEXT,
    scheduled_start_time INTEGER,
    actual_start_time INTEGER,
    end_time INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata TEXT
  )`)

  await db.run(sql`CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL UNIQUE,
    filter_instructions TEXT NOT NULL,
    sport TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    name TEXT,
    description TEXT,
    created_at INTEGER NOT NULL,
    last_run_at INTEGER,
    last_event_id TEXT
  )`)

  // Construct a Context-like object without going through GlobalConfig.parse
  const ctx = {
    opts: { demo: overrides?.demo ?? false, paper: overrides?.paper ?? true, 'db-filename': ':memory:' },
    db,
  } as Context

  return ctx
}

/**
 * Insert a game record and return it.
 */
export async function seedGame(
  ctx: Context,
  overrides?: Partial<{
    gameId: string
    sport: string
    status: string
    homeTeam: string
    awayTeam: string
    scheduledStartTime: number
  }>,
) {
  const values = {
    id: id128.Ulid.generate().toCanonical(),
    gameId: overrides?.gameId ?? 'test-game-1',
    sport: overrides?.sport ?? 'NBA',
    status: overrides?.status ?? 'live',
    homeTeam: overrides?.homeTeam ?? 'Lakers',
    awayTeam: overrides?.awayTeam ?? 'Celtics',
    scheduledStartTime: overrides?.scheduledStartTime ?? Math.floor(Date.now() / 1000),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await ctx.db.insert(games).values(values).run()
  return values
}

/**
 * Insert an order record and return it.
 */
export async function seedOrder(
  ctx: Context,
  overrides?: Partial<{
    marketType: string
    marketId: string
    marketTitle: string
    side: string
    size: number
    entryPrice: number
    pnl: number
    status: string
    openedAt: number
    strategy: string
    gameId: string
    metadata: string
  }>,
) {
  const values = {
    id: id128.Ulid.generate().toCanonical(),
    marketType: overrides?.marketType ?? 'kalshi',
    marketId: overrides?.marketId ?? 'MKT-TEST',
    marketTitle: overrides?.marketTitle ?? 'Test Market',
    side: overrides?.side ?? 'yes',
    size: overrides?.size ?? 1000,
    entryPrice: overrides?.entryPrice ?? 50,
    pnl: overrides?.pnl ?? 0,
    status: overrides?.status ?? 'open',
    openedAt: overrides?.openedAt ?? Date.now(),
    strategy: overrides?.strategy ?? 'value-bet',
    gameId: overrides?.gameId ?? 'test-game-1',
    metadata: overrides?.metadata ?? '{}',
  }

  await ctx.db.insert(orders).values(values).run()
  return values
}
