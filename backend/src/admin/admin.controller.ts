import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stats')
  async getStats() {
    const [totalUsers, totalGames, activeGames, finishedToday] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.game.count(),
        this.prisma.game.count({
          where: { status: { in: ['LOBBY', 'IN_PROGRESS'] } },
        }),
        this.prisma.game.count({
          where: {
            status: 'FINISHED',
            finishedAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
      ]);

    return { totalUsers, totalGames, activeGames, finishedToday };
  }

  @Get('users')
  async getUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        bannedUntil: true,
        createdAt: true,
        stats: {
          select: { gamesPlayed: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      bannedUntil: u.bannedUntil,
      createdAt: u.createdAt,
      gamesPlayed: u.stats?.gamesPlayed ?? 0,
    }));
  }

  @Get('games')
  async getGames() {
    const games = await this.prisma.game.findMany({
      include: {
        players: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return games.map((g) => ({
      id: g.id,
      code: g.code,
      scenarioSlug: g.scenarioSlug,
      status: g.status,
      playerCount: g.players.length,
      maxPlayers: g.maxPlayers,
      createdAt: g.createdAt,
      startedAt: g.startedAt,
      finishedAt: g.finishedAt,
    }));
  }

  @Patch('users/:id/ban')
  async banUser(
    @Param('id') id: string,
    @Body() body: { duration?: number },
  ) {
    // duration in hours, default 24h. Use 0 to unban.
    const hours = body.duration ?? 24;

    if (hours === 0) {
      await this.prisma.user.update({
        where: { id },
        data: { bannedUntil: null },
      });
      return { success: true, bannedUntil: null };
    }

    const bannedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id },
      data: { bannedUntil },
    });

    return { success: true, bannedUntil };
  }
}
