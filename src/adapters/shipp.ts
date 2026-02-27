import axios, { type AxiosInstance } from 'axios';
import type { Context } from '../ctx.js';
import { Logs, Severity } from '../log.js';
import { connections, games } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import id128 from 'id128';
import type {
  ShippScheduleResponse,
  ShippConnectionCreateRequest,
  ShippConnectionCreateResponse,
  ShippConnectionRunRequest,
  ShippConnectionRunResponse,
  ShippConnectionsListResponse,
  GetScheduleOptions,
  GetLiveEventsOptions,
  CreateConnectionOptions,
  GameStatus,
} from './shipp-types.js';

export class ShippAdapter extends Logs {
  private readonly baseUrl = 'https://api.shipp.ai/api/v1';
  private readonly apiKey: string | undefined;
  private readonly client: AxiosInstance;

  constructor(ctx: Context, apiKey?: string) {
    super(ctx);
    this.apiKey = apiKey;

    // Create axios instance with base config
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30s timeout for live data
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to append API key to all requests
    this.client.interceptors.request.use((config) => {
      if (this.apiKey) {
        config.params = { ...config.params, api_key: this.apiKey };
      }
      return config;
    });

    // Add response interceptor for error logging (never log API key)
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const safeUrl = error.config?.url || 'unknown';
        const status = error.response?.status || 'network_error';
        this.log(Severity.ERR, `Shipp API error: ${status} ${safeUrl}`);
        throw error;
      }
    );
  }

  async createAccount(email: string) {
    await this.client.post('/account/create', { email })
  }

  /**
   * Get schedule for a sport (one-off lookup, no connection needed)
   * Automatically upserts games to database with 'scheduled' status
   * Used by: AgentAlpha.availableGames()
   */
  async getSchedule(options: GetScheduleOptions): Promise<ShippScheduleResponse> {
    if (!this.apiKey) {
      this.log(Severity.ERR, 'Shipp API key not configured');
      throw new Error('ALPH_BOT_SHIPP_API_KEY is required for Shipp integration');
    }

    this.log(Severity.INF, `Fetching schedule for ${options.sport}`);

    const response = await this.client.get<ShippScheduleResponse>(
      `/sports/${options.sport}/schedule`
    );

    this.log(Severity.DBG, `Retrieved ${response.data.schedule.length} games`);

    // Upsert games to database with 'scheduled' status
    for (const game of response.data.schedule) {
      const gameId = game.game_id;
      if (!gameId) continue;

      const startTime = game.scheduled
        ? new Date(game.scheduled).valueOf() / 1_000
        : undefined;

      await this.ctx.db
        .insert(games)
        .values({
          id: id128.Ulid.generate().toCanonical(),
          gameId,
          sport: options.sport,
          status: (game.game_status as GameStatus) || 'scheduled',
          homeTeam: game.home,
          awayTeam: game.away,
          venue: game.venue,
          scheduledStartTime: startTime,
          metadata: JSON.stringify(game),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: games.gameId,
          set: {
            status: (game.game_status as GameStatus) || 'scheduled',
            homeTeam: game.home,
            awayTeam: game.away,
            venue: game.venue,
            scheduledStartTime: startTime,
            metadata: JSON.stringify(game),
            updatedAt: Date.now(),
          },
        })
        .run();
    }

    return response.data;
  }

  /**
   * Get or create a connection for a specific sport/game filter
   * Returns existing connection if found, creates new one otherwise
   */
  async getOrCreateConnection(options: CreateConnectionOptions): Promise<string> {
    // Check if connection already exists for this sport/filter
    const existing = await this.ctx.db
      .select()
      .from(connections)
      .where(eq(connections.filterInstructions, options.filterInstructions))
      .get();

    if (existing) {
      this.log(Severity.DBG, `Reusing connection ${existing.connectionId}`);
      return existing.connectionId;
    }

    // Create new connection
    this.log(Severity.INF, `Creating connection: ${options.filterInstructions}`);

    const request: ShippConnectionCreateRequest = {
      filter_instructions: options.filterInstructions,
    };

    const response = await this.client.post<ShippConnectionCreateResponse>(
      '/connections/create',
      request
    );

    // Persist to database
    const connectionId = response.data.connection_id;
    await this.ctx.db.insert(connections).values({
      id: id128.Ulid.generate().toCanonical(),
      connectionId,
      filterInstructions: options.filterInstructions,
      sport: options.sport,
      enabled: response.data.enabled,
      name: options.name,
      description: options.description,
      createdAt: Date.now(),
    }).run();

    this.log(Severity.INF, `Created connection ${connectionId}`);
    return connectionId;
  }

  /**
   * Poll live events from a connection with incremental tracking
   * Checks game status and skips polling if game is completed
   * Used by: AgentAlpha.valueBet() for continuous monitoring
   */
  async getLiveEvents(options: GetLiveEventsOptions): Promise<ShippConnectionRunResponse> {
    // Check game status first - skip if completed
    const game = await this.ctx.db
      .select()
      .from(games)
      .where(eq(games.gameId, options.gameId))
      .get();

    if (game?.status === 'completed') {
      this.log(Severity.INF, `Skipping completed game ${options.gameId}`);
      return {
        connection_id: '',
        data: [],
      };
    }

    // Build filter instructions for this game
    const filterInstructions = `Live events for ${options.sport} game ${options.gameId}`;

    // Get or create connection
    const connectionId = await this.getOrCreateConnection({
      filterInstructions,
      sport: options.sport,
      name: `${options.sport} - ${options.gameId}`,
    });

    // Get last event ID from database if not provided
    let sinceEventId = options.sinceEventId;
    if (!sinceEventId) {
      const conn = await this.ctx.db
        .select()
        .from(connections)
        .where(eq(connections.connectionId, connectionId))
        .get();
      sinceEventId = conn?.lastEventId ?? undefined;
    }

    // Build request (conditionally include optional fields to satisfy exactOptionalPropertyTypes)
    const request: ShippConnectionRunRequest = {
      ...(options.since !== undefined ? { since: options.since } : {}),
      ...(sinceEventId !== undefined ? { since_event_id: sinceEventId } : {}),
      limit: options.limit ?? 100,
    };

    this.log(Severity.DBG, `Polling connection ${connectionId} since_event_id=${sinceEventId || 'none'}`);

    // Execute connection
    const response = await this.client.post<ShippConnectionRunResponse>(
      `/connections/${connectionId}`,
      request
    );

    // most likely the connection is correct, but just-in-case guard against extra data we don't need.
    // also possible we're reusing a connection that exists or in the future making prop bets on a specific player
    const events = response.data.data.filter(e => e.game_id == options.gameId)

    // Update game status to 'live' if we got events and game is currently 'scheduled'
    if (events.length > 0 && game?.status === 'scheduled') {
      await this.updateGameStatus(options.gameId, 'live');
    }

    // Update last run time and last event ID
    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      const lastEventId = lastEvent?.event_id || lastEvent?.id;

      if (lastEventId) {
        await this.ctx.db
          .update(connections)
          .set({
            lastRunAt: Date.now(),
            lastEventId,
          })
          .where(eq(connections.connectionId, connectionId))
          .run();
      }
    }

    this.log(Severity.INF, `Retrieved ${events.length} live events`);
    return response.data;
  }

  /**
   * Update game status in database (scheduled → live → completed)
   */
  async updateGameStatus(gameId: string, status: GameStatus): Promise<void> {
    this.log(Severity.INF, `Updating game ${gameId} status to ${status}`);

    const updateData: Record<string, unknown> = {
      status,
      updatedAt: Date.now(),
    };

    if (status === 'live' && !updateData.actualStartTime) {
      updateData.actualStartTime = Date.now();
    } else if (status === 'completed' && !updateData.endTime) {
      updateData.endTime = Date.now();
    }

    await this.ctx.db
      .update(games)
      .set(updateData)
      .where(eq(games.gameId, gameId))
      .run();
  }

  /**
   * List all connections (useful for debugging/monitoring)
   */
  async listConnections(): Promise<ShippConnectionsListResponse> {
    const response = await this.client.get<ShippConnectionsListResponse>('/connections');
    return response.data;
  }
}
