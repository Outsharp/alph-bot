
import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Ulid } from "id128";

export const events = sqliteTable("events", {
  id: text().$defaultFn(() => Ulid.generate().toCanonical()).primaryKey(),
  gameId: text().notNull(),
  sport: text().notNull(),
  desc: text().notNull(),
});

export const orders = sqliteTable("orders", {
  id: text().$defaultFn(() => Ulid.generate().toCanonical()).primaryKey(),

  marketType: text().notNull(),
  marketId: text().notNull(),
  marketTitle: text().notNull(),

  side: text().notNull(),

  size: real().notNull(),
  entryPrice: real().notNull(),
  currentPrice: real(),
  pnl: real(),

  status: text().notNull(),

  openedAt: int().notNull(),
  closedAt: int(),
  closePrice: real(),

  strategy: text(),
  gameId: text(),

  metadata: text().notNull(),

  externalOrderId: text(),
  avgFillPrice: real(),

  submittedAt: int(),
  filledAt: int(),
  cancelledAt: int(),

  errorMessage: text(),
});

export const logs = sqliteTable('logs', {
  id: text().$defaultFn(() => Ulid.generate().toCanonical()).primaryKey(),

  severity: int().notNull(),
  data: text(),
})

export const games = sqliteTable("games", {
  id: text().$defaultFn(() => Ulid.generate().toCanonical()).primaryKey(),
  gameId: text("game_id").notNull().unique(), // Shipp game identifier
  sport: text().notNull(),

  // Status tracking
  status: text().notNull(), // 'scheduled' | 'live' | 'completed'

  // Game details
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  venue: text(),
  scheduledStartTime: int("scheduled_start_time"), // Unix timestamp
  actualStartTime: int("actual_start_time"),
  endTime: int("end_time"),

  // Metadata
  createdAt: int("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: int("updated_at").notNull().$defaultFn(() => Date.now()),

  // Raw data from Shipp
  metadata: text(), // JSON string with sport-specific fields
});

export const connections = sqliteTable("connections", {
  id: text().$defaultFn(() => Ulid.generate().toCanonical()).primaryKey(),

  // Shipp connection details
  connectionId: text("connection_id").notNull().unique(), // ULID from Shipp
  filterInstructions: text("filter_instructions").notNull(),

  // Metadata
  sport: text().notNull(),
  enabled: int({ mode: 'boolean' }).notNull().default(true),
  name: text(),
  description: text(),

  // Tracking
  createdAt: int("created_at").notNull().$defaultFn(() => Date.now()),
  lastRunAt: int("last_run_at"),
  lastEventId: text("last_event_id"), // Track last event ULID for incremental polling
});
