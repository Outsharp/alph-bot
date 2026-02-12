import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Ulid } from "id128";

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
