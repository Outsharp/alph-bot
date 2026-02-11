
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
