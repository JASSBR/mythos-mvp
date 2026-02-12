import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GameStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { CreateGameDto } from './dto/create-game.dto';

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scenariosService: ScenariosService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create a new game lobby
  // ---------------------------------------------------------------------------
  async createGame(userId: string, dto: CreateGameDto) {
    // Validate scenario exists
    if (!this.scenariosService.scenarioExists(dto.scenarioSlug)) {
      throw new NotFoundException(
        `Scenario "${dto.scenarioSlug}" not found`,
      );
    }

    const scenario = this.scenariosService.getScenario(dto.scenarioSlug);

    const code = await this.generateUniqueCode();

    const game = await this.prisma.game.create({
      data: {
        code,
        scenarioSlug: dto.scenarioSlug,
        status: 'LOBBY',
        currentPhase: 'WAITING',
        currentRound: 0,
        maxRounds: scenario.maxRounds,
        maxPlayers: dto.maxPlayers ?? 6,
        turnTimeout: dto.turnTimeout ?? 60,
        isPrivate: dto.isPrivate ?? false,
        hostId: userId,
        players: {
          create: {
            userId,
            isHost: true,
          },
        },
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    return game;
  }

  // ---------------------------------------------------------------------------
  // Join a game by code
  // ---------------------------------------------------------------------------
  async joinGame(userId: string, code: string) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!game) {
      throw new NotFoundException(`Game with code "${code}" not found`);
    }

    if (game.status !== 'LOBBY') {
      throw new BadRequestException('Game is not in lobby status');
    }

    if (game.players.length >= game.maxPlayers) {
      throw new BadRequestException('Game is full');
    }

    const alreadyJoined = game.players.some((p) => p.userId === userId);
    if (alreadyJoined) {
      throw new BadRequestException('You have already joined this game');
    }

    await this.prisma.gamePlayer.create({
      data: {
        gameId: game.id,
        userId,
      },
    });

    return this.getGame(game.id);
  }

  // ---------------------------------------------------------------------------
  // Leave a game
  // ---------------------------------------------------------------------------
  async leaveGame(userId: string, gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { players: true },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    const player = game.players.find((p) => p.userId === userId);
    if (!player) {
      throw new BadRequestException('You are not in this game');
    }

    // Remove the player
    await this.prisma.gamePlayer.delete({
      where: { id: player.id },
    });

    const remainingPlayers = game.players.filter((p) => p.userId !== userId);

    if (remainingPlayers.length === 0) {
      // No players left, cancel the game
      await this.prisma.game.update({
        where: { id: gameId },
        data: { status: 'CANCELLED' },
      });
      return { message: 'Game cancelled (no players remaining)' };
    }

    // If the leaving player was the host, transfer host
    if (player.isHost) {
      const newHost = remainingPlayers[0];
      await this.prisma.$transaction([
        this.prisma.gamePlayer.update({
          where: { id: newHost.id },
          data: { isHost: true },
        }),
        this.prisma.game.update({
          where: { id: gameId },
          data: { hostId: newHost.userId },
        }),
      ]);
    }

    return this.getGame(gameId);
  }

  // ---------------------------------------------------------------------------
  // Get a game by ID
  // ---------------------------------------------------------------------------
  async getGame(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    // Attach scenario metadata
    const scenario = this.scenariosService.scenarioExists(game.scenarioSlug)
      ? this.scenariosService.getScenario(game.scenarioSlug)
      : null;

    return {
      ...game,
      scenario: scenario
        ? {
            name: scenario.name,
            description: scenario.description,
            minPlayers: scenario.minPlayers,
            maxPlayers: scenario.maxPlayers,
            duration: scenario.duration,
            difficulty: scenario.difficulty,
          }
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Get a game by code
  // ---------------------------------------------------------------------------
  async getGameByCode(code: string) {
    const game = await this.prisma.game.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!game) {
      throw new NotFoundException(`Game with code "${code}" not found`);
    }

    return this.getGame(game.id);
  }

  // ---------------------------------------------------------------------------
  // List public games in lobby status
  // ---------------------------------------------------------------------------
  async listPublicGames() {
    const games = await this.prisma.game.findMany({
      where: {
        status: 'LOBBY',
        isPrivate: false,
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return games.map((game) => ({
      ...game,
      playerCount: game.players.length,
    }));
  }

  // ---------------------------------------------------------------------------
  // Get all games for a user
  // ---------------------------------------------------------------------------
  async getUserGames(userId: string) {
    const gamePlayers = await this.prisma.gamePlayer.findMany({
      where: { userId },
      include: {
        game: {
          include: {
            players: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 20,
    });

    return gamePlayers.map((gp) => ({
      ...gp.game,
      playerCount: gp.game.players.length,
      myRole: gp.role,
    }));
  }

  // ---------------------------------------------------------------------------
  // Update game status
  // ---------------------------------------------------------------------------
  async updateGameStatus(gameId: string, status: GameStatus) {
    const updateData: Record<string, unknown> = { status };

    if (status === 'IN_PROGRESS') {
      updateData.startedAt = new Date();
    }

    if (status === 'FINISHED' || status === 'CANCELLED') {
      updateData.finishedAt = new Date();
    }

    return this.prisma.game.update({
      where: { id: gameId },
      data: updateData,
    });
  }

  // ---------------------------------------------------------------------------
  // Save game state snapshot
  // ---------------------------------------------------------------------------
  async saveGameState(gameId: string, state: unknown) {
    return this.prisma.game.update({
      where: { id: gameId },
      data: { stateSnapshot: state as any },
    });
  }

  // ---------------------------------------------------------------------------
  // Add a game event
  // ---------------------------------------------------------------------------
  async addGameEvent(
    gameId: string,
    eventData: {
      round: number;
      phase: string;
      type: string;
      actorId?: string;
      data?: unknown;
      narrative?: string;
    },
  ) {
    return this.prisma.gameEvent.create({
      data: {
        gameId,
        round: eventData.round,
        phase: eventData.phase as any,
        type: eventData.type,
        actorId: eventData.actorId,
        data: eventData.data as any,
        narrative: eventData.narrative,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Get game events
  // ---------------------------------------------------------------------------
  async getGameEvents(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    return this.prisma.gameEvent.findMany({
      where: { gameId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // End game with results
  // ---------------------------------------------------------------------------
  async endGame(
    gameId: string,
    results: { winnerIds: string[]; scores?: Record<string, number> },
  ) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { players: true },
    });

    if (!game) {
      throw new NotFoundException('Game not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update game status
      await tx.game.update({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          finishedAt: new Date(),
        },
      });

      // Update player scores if provided
      if (results.scores) {
        for (const player of game.players) {
          const score = results.scores[player.userId];
          if (score !== undefined) {
            await tx.gamePlayer.update({
              where: { id: player.id },
              data: { score },
            });
          }
        }
      }

      // Update UserStats for all players
      for (const player of game.players) {
        const isWinner = results.winnerIds.includes(player.userId);
        await tx.userStats.updateMany({
          where: { userId: player.userId },
          data: {
            gamesPlayed: { increment: 1 },
            ...(isWinner ? { gamesWon: { increment: 1 } } : {}),
          },
        });
      }
    });

    return this.getGame(gameId);
  }

  // ---------------------------------------------------------------------------
  // Check if a user is the host of a game
  // ---------------------------------------------------------------------------
  async isHost(gameId: string, userId: string): Promise<boolean> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { hostId: true },
    });
    return game?.hostId === userId;
  }

  // ---------------------------------------------------------------------------
  // Save a chat message to the database
  // ---------------------------------------------------------------------------
  async saveMessage(
    gameId: string,
    userId: string,
    content: string,
    type: 'CHAT' | 'SYSTEM' | 'AI_NARRATION' | 'ACTION' | 'VOTE' = 'CHAT',
  ) {
    return this.prisma.message.create({
      data: {
        gameId,
        userId,
        content,
        type,
      },
    });
  }

  async saveWhisperMessage(
    gameId: string,
    userId: string,
    recipientId: string,
    content: string,
  ) {
    return this.prisma.message.create({
      data: {
        gameId,
        userId,
        content,
        type: 'WHISPER',
        recipientId,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Get the player list for a game (for lobby/game updates)
  // ---------------------------------------------------------------------------
  async getPlayerList(gameId: string) {
    return this.prisma.gamePlayer.findMany({
      where: { gameId },
      include: {
        user: {
          select: { id: true, username: true, avatar: true },
        },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Generate a unique 6-character game code
  // ---------------------------------------------------------------------------
  private async generateUniqueCode(): Promise<string> {
    let code: string;
    let exists = true;

    while (exists) {
      code = this.generateGameCode();
      const existing = await this.prisma.game.findUnique({
        where: { code },
      });
      exists = !!existing;
    }

    return code!;
  }

  private generateGameCode(): string {
    // Exclude ambiguous characters: 0, O, 1, I, L
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
