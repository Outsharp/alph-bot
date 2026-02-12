import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Ulid } from "id128";

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
