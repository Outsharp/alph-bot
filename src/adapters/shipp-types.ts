import { Sport } from '../config.js';

// Base API response types

export interface ShippScheduleResponse {
  schedule: ShippScheduleGame[];
}

export interface ShippScheduleGame {
  game_id?: string;
  id?: string;
  home_team?: string;
  away_team?: string;
  start_time?: string;
  status?: string;
  venue?: string;
  // Flexible - sport-specific fields vary
  [key: string]: unknown;
}

export interface ShippConnectionCreateRequest {
  filter_instructions: string;
}

export interface ShippConnectionCreateResponse {
  connection_id: string; // ULID
  enabled: boolean;
  name?: string;
  description?: string;
}

export interface ShippConnectionRunRequest {
  since?: string; // ISO 8601 timestamp
  since_event_id?: string; // ULID
  limit?: number;
}

export interface ShippConnectionRunResponse {
  connection_id: string;
  data: ShippEvent[];
}

export interface ShippEvent {
  event_id?: string;
  id?: string;
  game_id?: string;
  wall_clock_start?: string;
  // Flexible - event shape varies by sport/feed
  [key: string]: unknown;
}

export interface ShippConnectionsListResponse {
  connections: Array<{
    connection_id: string;
    enabled: boolean;
    name?: string;
    description?: string;
  }>;
}

// Configuration for adapter methods

export interface GetScheduleOptions {
  sport: typeof Sport;
}

export interface GetLiveEventsOptions {
  gameId: string;
  sport: typeof Sport;
  since?: string;
  sinceEventId?: string;
  limit?: number;
}

export interface CreateConnectionOptions {
  filterInstructions: string;
  sport: typeof Sport;
  name?: string;
  description?: string;
}

// Game status enum
export type GameStatus = 'scheduled' | 'live' | 'completed';
