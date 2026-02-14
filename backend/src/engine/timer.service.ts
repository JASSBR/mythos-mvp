import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class TimerService {
  private readonly logger = new Logger(TimerService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly cacheService: CacheService) {}

  async startTimer(
    gameId: string,
    phase: string,
    durationSeconds: number,
    onExpiry: () => Promise<void>,
  ): Promise<void> {
    this.cancelTimer(gameId);

    const expiresAt = Date.now() + durationSeconds * 1000;
    await this.cacheService.setTimerState(gameId, {
      phase,
      expiresAt,
      duration: durationSeconds,
    });

    const timer = setTimeout(async () => {
      this.timers.delete(gameId);
      await this.cacheService.deleteTimerState(gameId).catch(() => {});
      try {
        await onExpiry();
      } catch (err) {
        this.logger.error(`Timer expiry error for game ${gameId}: ${err}`);
      }
    }, durationSeconds * 1000);

    this.timers.set(gameId, timer);
    this.logger.log(
      `Timer started for game ${gameId}: ${phase} phase, ${durationSeconds}s`,
    );
  }

  cancelTimer(gameId: string): void {
    const existing = this.timers.get(gameId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(gameId);
      this.logger.log(`Timer cancelled for game ${gameId}`);
    }
    this.cacheService.deleteTimerState(gameId).catch(() => {});
  }

  async getRemainingSeconds(gameId: string): Promise<number> {
    const state = await this.cacheService.getTimerState(gameId);
    if (!state) return 0;
    return Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 1000));
  }
}
