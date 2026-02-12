import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { GameState } from '../engine/engine.types';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * CacheService wraps Redis (via ioredis) with an automatic in-memory Map
 * fallback when Redis is unavailable. All operations are safe to call
 * regardless of Redis connection state — they will never throw.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly defaultTTL: number;

  /** In-memory fallback when Redis is not available */
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
  private memoryCacheCleanupInterval: ReturnType<typeof setInterval> | null =
    null;
  private redisAvailable = false;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.defaultTTL = this.configService.get<number>('CACHE_TTL', 3600);

    try {
      this.redis = new Redis(redisUrl, {
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn(
              'Redis connection failed after 3 retries, falling back to in-memory cache',
            );
            this.redisAvailable = false;
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });

      this.redis.on('error', (err) => {
        this.logger.warn(`Redis connection error: ${err.message}`);
        this.redisAvailable = false;
      });

      this.redis.on('connect', () => {
        this.logger.log('Connected to Redis');
        this.redisAvailable = true;
      });

      this.redis.on('close', () => {
        this.redisAvailable = false;
      });

      this.redis.connect().catch(() => {
        this.logger.warn(
          'Redis not available, using in-memory cache as fallback',
        );
        this.redisAvailable = false;
      });
    } catch (error) {
      this.logger.warn(
        `Failed to initialize Redis client: ${error}. Using in-memory cache.`,
      );
      this.redis = null;
      this.redisAvailable = false;
    }

    // Periodically clean expired entries from the in-memory cache (every 60s)
    this.memoryCacheCleanupInterval = setInterval(() => {
      this.cleanExpiredMemoryEntries();
    }, 60_000);
  }

  async onModuleDestroy() {
    if (this.memoryCacheCleanupInterval) {
      clearInterval(this.memoryCacheCleanupInterval);
    }
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // Ignore disconnect errors
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Core cache operations
  // ---------------------------------------------------------------------------

  /**
   * Get a value by key. Returns null if not found or on error.
   * Automatically JSON.parse the stored value.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.redisAvailable && this.redis) {
        const value = await this.redis.get(key);
        if (!value) return null;
        return JSON.parse(value) as T;
      }
      return this.memoryGet<T>(key);
    } catch (error) {
      this.logger.warn(`Cache get error for key "${key}": ${error}`);
      return this.memoryGet<T>(key);
    }
  }

  /**
   * Set a value by key with optional TTL (in seconds).
   * Automatically JSON.stringify the value.
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const ttl = ttlSeconds ?? this.defaultTTL;

    try {
      if (this.redisAvailable && this.redis) {
        await this.redis.set(key, serialized, 'EX', ttl);
        return;
      }
      this.memorySet(key, serialized, ttl);
    } catch (error) {
      this.logger.warn(`Cache set error for key "${key}": ${error}`);
      this.memorySet(key, serialized, ttl);
    }
  }

  /**
   * Delete a key from cache.
   */
  async del(key: string): Promise<void> {
    try {
      if (this.redisAvailable && this.redis) {
        await this.redis.del(key);
      }
      // Always delete from memory cache as well (in case of fallback switch)
      this.memoryCache.delete(key);
    } catch (error) {
      this.logger.warn(`Cache del error for key "${key}": ${error}`);
      this.memoryCache.delete(key);
    }
  }

  // ---------------------------------------------------------------------------
  // Game state shortcuts
  // ---------------------------------------------------------------------------

  /**
   * Get game state from cache. Shortcut for get(`game:{gameId}:state`).
   */
  async getGameState(gameId: string): Promise<GameState | null> {
    return this.get<GameState>(`game:${gameId}:state`);
  }

  /**
   * Set game state in cache with 1 hour TTL.
   */
  async setGameState(gameId: string, state: GameState): Promise<void> {
    await this.set(`game:${gameId}:state`, state, 3600);
  }

  /**
   * Delete game state from cache.
   */
  async deleteGameState(gameId: string): Promise<void> {
    await this.del(`game:${gameId}:state`);
  }

  // ---------------------------------------------------------------------------
  // Player connection tracking
  // ---------------------------------------------------------------------------

  /**
   * Store a player's socket connection ID for a specific game.
   * TTL of 2 hours to cover long game sessions.
   */
  async setPlayerConnection(
    gameId: string,
    userId: string,
    socketId: string,
  ): Promise<void> {
    await this.set(`game:${gameId}:player:${userId}:socket`, socketId, 7200);
  }

  /**
   * Get a player's socket connection ID for a specific game.
   */
  async getPlayerConnection(
    gameId: string,
    userId: string,
  ): Promise<string | null> {
    return this.get<string>(`game:${gameId}:player:${userId}:socket`);
  }

  /**
   * Remove a player's socket connection from cache.
   */
  async removePlayerConnection(
    gameId: string,
    userId: string,
  ): Promise<void> {
    await this.del(`game:${gameId}:player:${userId}:socket`);
  }

  // ---------------------------------------------------------------------------
  // Timer state (server-side timers)
  // ---------------------------------------------------------------------------

  async setTimerState(
    gameId: string,
    timer: { phase: string; expiresAt: number; duration: number },
  ): Promise<void> {
    await this.set(`game:${gameId}:timer`, timer, 600); // 10 min TTL
  }

  async getTimerState(
    gameId: string,
  ): Promise<{ phase: string; expiresAt: number; duration: number } | null> {
    return this.get(`game:${gameId}:timer`);
  }

  async deleteTimerState(gameId: string): Promise<void> {
    await this.del(`game:${gameId}:timer`);
  }

  // ---------------------------------------------------------------------------
  // Round actions cache
  // ---------------------------------------------------------------------------

  async setRoundActions(
    gameId: string,
    round: number,
    actions: any[],
  ): Promise<void> {
    await this.set(`game:${gameId}:round:${round}:actions`, actions, 3600);
  }

  async getRoundActions(
    gameId: string,
    round: number,
  ): Promise<any[] | null> {
    return this.get(`game:${gameId}:round:${round}:actions`);
  }

  // ---------------------------------------------------------------------------
  // Round votes cache
  // ---------------------------------------------------------------------------

  async setRoundVotes(
    gameId: string,
    round: number,
    votes: any[],
  ): Promise<void> {
    await this.set(`game:${gameId}:round:${round}:votes`, votes, 3600);
  }

  async getRoundVotes(
    gameId: string,
    round: number,
  ): Promise<any[] | null> {
    return this.get(`game:${gameId}:round:${round}:votes`);
  }

  // ---------------------------------------------------------------------------
  // Chat messages cache
  // ---------------------------------------------------------------------------

  async addChatMessage(gameId: string, message: any): Promise<void> {
    const messages = (await this.getChatMessages(gameId)) || [];
    messages.push(message);
    await this.set(`game:${gameId}:chat`, messages, 86400); // 24h TTL
  }

  async getChatMessages(gameId: string): Promise<any[] | null> {
    return this.get(`game:${gameId}:chat`);
  }

  // ---------------------------------------------------------------------------
  // JWT session tracking
  // ---------------------------------------------------------------------------

  async setUserSession(
    userId: string,
    tokenId: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.set(`session:${userId}:jwt`, tokenId, ttlSeconds);
  }

  async getUserSession(userId: string): Promise<string | null> {
    return this.get(`session:${userId}:jwt`);
  }

  async deleteUserSession(userId: string): Promise<void> {
    await this.del(`session:${userId}:jwt`);
  }

  // ---------------------------------------------------------------------------
  // AI rate limiting
  // ---------------------------------------------------------------------------

  async checkAiRateLimit(gameId: string): Promise<boolean> {
    const key = `ratelimit:ai:${gameId}`;
    const current = await this.get<number>(key);
    if (current !== null && current >= 10) return false; // max 10 AI calls per 60s per game
    await this.set(key, (current || 0) + 1, 60); // 60s TTL
    return true;
  }

  // ---------------------------------------------------------------------------
  // In-memory fallback helpers
  // ---------------------------------------------------------------------------

  private memoryGet<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    // Check expiration
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  }

  private memorySet(key: string, serialized: string, ttlSeconds: number): void {
    this.memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private cleanExpiredMemoryEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }
  }
}
