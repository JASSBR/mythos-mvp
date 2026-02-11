import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { stats: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    // If username is being updated, check uniqueness
    if (dto.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Username is already taken');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.username && { username: dto.username }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
      },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getStats(userId: string) {
    const stats = await this.prisma.userStats.findUnique({
      where: { userId },
    });
    if (!stats) {
      throw new NotFoundException('User stats not found');
    }
    return stats;
  }

  async updateStats(
    userId: string,
    data: {
      gamesPlayed?: number;
      gamesWon?: number;
      totalPlaytimeMin?: number;
      favoriteScenario?: string;
    },
  ) {
    return this.prisma.userStats.update({
      where: { userId },
      data,
    });
  }

  async getLeaderboard(limit = 10) {
    const stats = await this.prisma.userStats.findMany({
      take: limit,
      orderBy: { gamesWon: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    return stats.map((entry) => ({
      userId: entry.user.id,
      username: entry.user.username,
      avatar: entry.user.avatar,
      gamesPlayed: entry.gamesPlayed,
      gamesWon: entry.gamesWon,
      totalPlaytimeMin: entry.totalPlaytimeMin,
      favoriteScenario: entry.favoriteScenario,
    }));
  }

  async getGameHistory(userId: string) {
    // Ensure user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const gamePlayers = await this.prisma.gamePlayer.findMany({
      where: { userId },
      include: {
        game: true,
      },
      orderBy: {
        joinedAt: 'desc',
      },
    });

    return gamePlayers.map((gp) => ({
      gameId: gp.game.id,
      scenarioSlug: gp.game.scenarioSlug,
      status: gp.game.status,
      role: gp.role,
      isAlive: gp.isAlive,
      score: gp.score,
      createdAt: gp.game.createdAt,
      startedAt: gp.game.startedAt,
      finishedAt: gp.game.finishedAt,
    }));
  }
}
