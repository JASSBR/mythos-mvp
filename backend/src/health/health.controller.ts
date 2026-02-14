import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  async check() {
    const checks = {
      status: 'ok' as 'ok' | 'degraded' | 'down',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      services: {
        database: { status: 'down' as string },
        cache: { status: 'down' as string },
      },
    };

    // Database check
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      checks.services.database.status = 'up';
    } catch {
      checks.services.database.status = 'down';
    }

    // Cache check (Redis or in-memory fallback)
    try {
      await this.cache.set('health:ping', 'pong', 10);
      const val = await this.cache.get<string>('health:ping');
      checks.services.cache.status = val === 'pong' ? 'up' : 'degraded';
    } catch {
      checks.services.cache.status = 'down';
    }

    // Overall status
    const statuses = Object.values(checks.services).map((s) => s.status);
    if (statuses.every((s) => s === 'up')) {
      checks.status = 'ok';
    } else if (statuses.includes('down')) {
      checks.status = 'degraded';
    }

    return checks;
  }
}
