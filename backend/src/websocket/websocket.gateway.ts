import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EngineService } from '../engine/engine.service';
import { TimerService } from '../engine/timer.service';
import { GamesService } from '../games/games.service';
import { AuthService } from '../auth/auth.service';
import { CacheService } from '../cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketUserData,
} from './websocket.types';

/** Timeout (ms) before a disconnected player is marked as gone. */
const RECONNECT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      const allowed = (process.env.CORS_ORIGIN || 'http://localhost:3000')
        .split(',')
        .map((o) => o.trim());
      if (!origin || allowed.includes(origin) || origin.endsWith('.ngrok-free.app') || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  },
  namespace: '/game',
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketGateway.name);

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  /**
   * Map of socketId -> { userId, username } for connected clients.
   * Populated on successful authentication.
   */
  private readonly socketUsers = new Map<string, SocketUserData>();

  /**
   * Map of socketId -> Set<roomName> so we know which rooms a socket was in
   * when it disconnects.
   */
  private readonly socketRooms = new Map<string, Set<string>>();

  /**
   * Disconnect timers keyed by `gameId:userId`.
   * When the timer fires the player is broadcast as disconnected.
   */
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly engineService: EngineService,
    private readonly timerService: TimerService,
    private readonly gamesService: GamesService,
    private readonly authService: AuthService,
    private readonly cacheService: CacheService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ===========================================================================
  // Lifecycle hooks
  // ===========================================================================

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);

    const user = this.socketUsers.get(client.id);
    const rooms = this.socketRooms.get(client.id);

    // Clean up maps
    this.socketUsers.delete(client.id);
    this.socketRooms.delete(client.id);

    if (!user || !rooms) return;

    // For each game room the player was in, start a reconnection timeout
    for (const room of rooms) {
      if (room.startsWith('game:')) {
        const gameId = room.replace('game:', '');
        const timerKey = `${gameId}:${user.userId}`;

        // Clear any existing timer for this user/game
        const existing = this.disconnectTimers.get(timerKey);
        if (existing) clearTimeout(existing);

        // Start a new timer — after RECONNECT_TIMEOUT_MS, remove the player
        const timer = setTimeout(async () => {
          this.disconnectTimers.delete(timerKey);
          this.server.to(room).emit('game:player:disconnected', {
            userId: user.userId,
          });
          // Remove cached connection
          this.cacheService
            .removePlayerConnection(gameId, user.userId)
            .catch(() => {});

          // Remove player from DB and check if game should end
          try {
            const result = await this.gamesService.leaveGame(user.userId, gameId) as any;
            if (result?.message?.includes('cancelled')) {
              this.timerService.cancelTimer(gameId);
              await this.cacheService.deleteGameState(gameId);
              this.logger.log(`Game ${gameId} cancelled — disconnect timeout, no players`);
            } else {
              const gameState = await this.cacheService.getGameState(gameId);
              if (gameState) {
                const alivePlayers = gameState.players.filter((p) => p.isAlive && p.userId !== user.userId);
                if (alivePlayers.length <= 1) {
                  this.timerService.cancelTimer(gameId);
                  await this.gamesService.updateGameStatus(gameId, 'FINISHED');
                  await this.cacheService.deleteGameState(gameId);
                  this.server.to(room).emit('game:over', {
                    result: 'Partie terminee — plus assez de joueurs',
                    epilogue: '',
                    scores: [],
                  });
                }
              }
            }
          } catch (err) {
            this.logger.warn(`Could not clean up after disconnect timeout: ${err}`);
          }

          this.logger.log(
            `Player ${user.username} (${user.userId}) timed out from game ${gameId}`,
          );
        }, RECONNECT_TIMEOUT_MS);

        this.disconnectTimers.set(timerKey, timer);
      }

      if (room.startsWith('lobby:')) {
        // For lobby rooms, immediately emit an update
        this.emitLobbyUpdate(room).catch(() => {});
      }
    }
  }

  // ===========================================================================
  // Authentication helpers
  // ===========================================================================

  /**
   * Verify a JWT token and return the user data, or null if invalid.
   */
  private async authenticateClient(
    token: string,
  ): Promise<SocketUserData | null> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret });
      const user = await this.authService.validateUser(payload.sub);
      if (!user) return null;
      return { userId: user.id, username: user.username };
    } catch (error) {
      this.logger.warn(`Token verification failed: ${error}`);
      return null;
    }
  }

  /**
   * Get cached user data for a connected socket.
   */
  private getUserFromSocket(client: Socket): SocketUserData | null {
    return this.socketUsers.get(client.id) ?? null;
  }

  /**
   * Track that a socket has joined a room.
   */
  private trackRoom(socketId: string, room: string): void {
    let rooms = this.socketRooms.get(socketId);
    if (!rooms) {
      rooms = new Set();
      this.socketRooms.set(socketId, rooms);
    }
    rooms.add(room);
  }

  /**
   * Remove a room from the socket's tracked rooms.
   */
  private untrackRoom(socketId: string, room: string): void {
    const rooms = this.socketRooms.get(socketId);
    if (rooms) {
      rooms.delete(room);
    }
  }

  // ===========================================================================
  // Lobby events
  // ===========================================================================

  @SubscribeMessage('lobby:join')
  async handleLobbyJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { code: string; token: string },
  ): Promise<void> {
    try {
      if (!data?.code || !data?.token) {
        client.emit('game:error', { message: 'Missing code or token' });
        return;
      }

      // Authenticate
      const user = await this.authenticateClient(data.token);
      if (!user) {
        client.emit('game:error', { message: 'Authentication failed' });
        return;
      }

      // Store user data on socket
      this.socketUsers.set(client.id, user);

      // Find the game by code
      const game = await this.gamesService.getGameByCode(data.code);
      const room = `lobby:${game.id}`;

      // Join the socket room
      client.join(room);
      this.trackRoom(client.id, room);

      // Cache the player connection
      await this.cacheService.setPlayerConnection(
        game.id,
        user.userId,
        client.id,
      );

      this.logger.log(
        `Player ${user.username} joined lobby ${data.code} (game ${game.id})`,
      );

      // Emit lobby update to all players in the room
      await this.emitLobbyUpdate(room, game.id);
    } catch (error) {
      this.logger.error(`Error in lobby:join: ${error}`);
      client.emit('game:error', {
        message: 'Failed to join lobby',
      });
    }
  }

  @SubscribeMessage('lobby:leave')
  async handleLobbyLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { code: string },
  ): Promise<void> {
    try {
      if (!data?.code) {
        client.emit('game:error', { message: 'Missing lobby code' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      const game = await this.gamesService.getGameByCode(data.code);
      const room = `lobby:${game.id}`;

      // Leave the socket room
      client.leave(room);
      this.untrackRoom(client.id, room);

      // Remove cached connection
      await this.cacheService.removePlayerConnection(game.id, user.userId);

      this.logger.log(
        `Player ${user.username} left lobby ${data.code}`,
      );

      // Emit updated lobby to remaining players
      await this.emitLobbyUpdate(room, game.id);
    } catch (error) {
      this.logger.error(`Error in lobby:leave: ${error}`);
      client.emit('game:error', { message: 'Failed to leave lobby' });
    }
  }

  @SubscribeMessage('lobby:chat')
  async handleLobbyChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { code: string; message: string },
  ): Promise<void> {
    try {
      if (!data?.code || !data?.message) {
        client.emit('game:error', { message: 'Missing code or message' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      // Validate message
      const message = data.message.trim();
      if (message.length === 0 || message.length > 500) {
        client.emit('game:error', {
          message: 'Message must be between 1 and 500 characters',
        });
        return;
      }

      const game = await this.gamesService.getGameByCode(data.code);
      const room = `lobby:${game.id}`;

      // Emit chat message to all in the lobby room
      this.server.to(room).emit('lobby:chat:message', {
        userId: user.userId,
        username: user.username,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Error in lobby:chat: ${error}`);
      client.emit('game:error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('lobby:kick')
  async handleLobbyKick(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { code: string; targetUserId: string },
  ): Promise<void> {
    try {
      if (!data?.code || !data?.targetUserId) {
        client.emit('game:error', { message: 'Missing code or targetUserId' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      const game = await this.gamesService.getGameByCode(data.code);

      // Verify user is the host
      const isHost = await this.gamesService.isHost(game.id, user.userId);
      if (!isHost) {
        client.emit('game:error', {
          message: 'Only the host can kick players',
        });
        return;
      }

      // Can't kick yourself
      if (data.targetUserId === user.userId) {
        client.emit('game:error', { message: 'Cannot kick yourself' });
        return;
      }

      const room = `lobby:${game.id}`;

      // Remove the player from the game in DB
      await this.gamesService.leaveGame(game.id, data.targetUserId);

      // Find the target player's socket and remove them from the room
      const roomSockets = await this.server.in(room).fetchSockets();
      for (const sock of roomSockets) {
        const sockUser = this.socketUsers.get(sock.id);
        if (sockUser?.userId === data.targetUserId) {
          sock.emit('lobby:player:kicked', { userId: data.targetUserId });
          sock.leave(room);
          this.untrackRoom(sock.id, room);
          await this.cacheService.removePlayerConnection(
            game.id,
            data.targetUserId,
          );
          break;
        }
      }

      this.logger.log(
        `Player ${data.targetUserId} kicked from lobby ${data.code} by host ${user.username}`,
      );

      // Emit updated lobby to remaining players
      await this.emitLobbyUpdate(room, game.id);
    } catch (error) {
      this.logger.error(`Error in lobby:kick: ${error}`);
      client.emit('game:error', { message: 'Failed to kick player' });
    }
  }

  // ===========================================================================
  // Game lifecycle events
  // ===========================================================================

  @SubscribeMessage('game:start')
  async handleGameStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string },
  ): Promise<void> {
    try {
      if (!data?.gameId) {
        client.emit('game:error', { message: 'Missing gameId' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      // Verify user is the host
      const isHost = await this.gamesService.isHost(data.gameId, user.userId);
      if (!isHost) {
        client.emit('game:error', {
          message: 'Only the host can start the game',
        });
        return;
      }

      // Get game details and verify minimum players
      const game = await this.gamesService.getGame(data.gameId);
      const minPlayers = game.scenario?.minPlayers ?? 3;

      if (game.players.length < minPlayers) {
        client.emit('game:error', {
          message: `Need at least ${minPlayers} players to start`,
        });
        return;
      }

      // Initialize the game engine state
      const gameState = await this.engineService.initializeGame(data.gameId);

      // Cache the initial state
      await this.cacheService.setGameState(data.gameId, gameState);

      // Update game status in DB
      await this.gamesService.updateGameStatus(data.gameId, 'IN_PROGRESS');

      const lobbyRoom = `lobby:${data.gameId}`;
      const gameRoom = `game:${data.gameId}`;

      // Move all lobby sockets to the game room
      const lobbySockets = await this.server.in(lobbyRoom).fetchSockets();
      for (const socket of lobbySockets) {
        socket.leave(lobbyRoom);
        socket.join(gameRoom);
        // Update room tracking
        this.untrackRoom(socket.id, lobbyRoom);
        this.trackRoom(socket.id, gameRoom);
      }

      // Notify all clients that the game has started
      this.server.to(gameRoom).emit('lobby:started', { gameId: data.gameId });

      // Send private role info to each player individually
      const gameSockets = await this.server.in(gameRoom).fetchSockets();
      for (const sock of gameSockets) {
        const sockUser = this.socketUsers.get(sock.id);
        if (!sockUser) continue;
        const playerState = gameState.players.find(
          (p) => p.userId === sockUser.userId,
        );
        if (!playerState) continue;

        // Get the role description from the scenario
        const scenarioConfig = this.engineService.getScenarioConfig(
          game.scenarioSlug,
        );
        const roleInfo = scenarioConfig?.roles.find(
          (r) => r.name === playerState.role,
        );

        sock.emit('game:private-info', {
          role: playerState.role,
          team: playerState.team,
          description: roleInfo?.description ?? '',
          objectives:
            scenarioConfig?.winConditions?.[playerState.team] ?? '',
        });
      }

      // Push persistent notifications to all players
      this.notifyAllPlayers(
        data.gameId,
        NotificationType.GAME_STARTED,
        'La partie commence !',
        `La partie vient de démarrer. Bonne chance !`,
      ).catch(() => {});

      this.logger.log(`Game ${data.gameId} started by ${user.username}`);

      // Emit phase update BEFORE narration so the frontend resets state first
      this.server.to(gameRoom).emit('game:phase', {
        phase: 'NARRATION',
        round: 1,
      });

      // Start streaming narration
      this.server.to(gameRoom).emit('game:narration', {
        text: '',
        isStreaming: true,
      });

      try {
        for await (const result of this.engineService.startStreamingNarration(
          data.gameId,
        )) {
          if (result.chunk) {
            this.server
              .to(gameRoom)
              .emit('game:narration:chunk', { chunk: result.chunk });
          }
          if (result.complete) {
            this.server
              .to(gameRoom)
              .emit('game:narration:complete', { text: result.fullText ?? '' });
          }
        }
      } catch (streamError) {
        // Fallback to non-streaming
        this.logger.warn(`Streaming failed, falling back: ${streamError}`);
        const narration = await this.engineService.startNarration(data.gameId);
        this.server.to(gameRoom).emit('game:narration', {
          text: narration.text,
          isStreaming: false,
        });
      }

      // Start server-side timer for NARRATION phase
      const gameData = await this.gamesService.getGame(data.gameId);
      const timeout = gameData?.turnTimeout ?? 60;
      this.server.to(gameRoom).emit('game:timer:sync', {
        seconds: timeout,
        phase: 'NARRATION',
      });
      await this.timerService.startTimer(
        data.gameId,
        'NARRATION',
        timeout,
        async () => {
          await this.autoAdvancePhase(data.gameId, gameRoom);
        },
      );
    } catch (error) {
      this.logger.error(`Error in game:start: ${error}`);
      client.emit('game:error', { message: 'Failed to start game' });
    }
  }

  @SubscribeMessage('game:join')
  async handleGameJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; token: string },
  ): Promise<void> {
    try {
      if (!data?.gameId || !data?.token) {
        client.emit('game:error', { message: 'Missing gameId or token' });
        return;
      }

      // Authenticate
      const user = await this.authenticateClient(data.token);
      if (!user) {
        client.emit('game:error', { message: 'Authentication failed' });
        return;
      }

      // Store user data
      this.socketUsers.set(client.id, user);

      const gameRoom = `game:${data.gameId}`;

      // Join the game room
      client.join(gameRoom);
      this.trackRoom(client.id, gameRoom);

      // Cache the connection
      await this.cacheService.setPlayerConnection(
        data.gameId,
        user.userId,
        client.id,
      );

      // Check if this is a reconnection (cancel disconnect timer)
      const timerKey = `${data.gameId}:${user.userId}`;
      const existingTimer = this.disconnectTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.disconnectTimers.delete(timerKey);

        // Notify other players of reconnection
        this.server.to(gameRoom).emit('game:player:reconnected', {
          userId: user.userId,
        });

        this.logger.log(
          `Player ${user.username} reconnected to game ${data.gameId}`,
        );
      } else {
        // Notify other players of a new join
        this.server.to(gameRoom).emit('game:player:joined', {
          userId: user.userId,
          username: user.username,
        });

        this.logger.log(
          `Player ${user.username} joined game ${data.gameId}`,
        );
      }

      // Send current game state to the joining/reconnecting client
      const gameState = await this.cacheService.getGameState(data.gameId);
      if (gameState) {
        client.emit('game:state', gameState);

        // If currently in ACTION phase, send action suggestions to this client
        if (gameState.currentPhase === 'ACTION') {
          this.engineService
            .getPredefinedActions(data.gameId)
            .then(async (predefined) => {
              client.emit('game:action:suggestions', {
                predefined,
                aiSuggestions: [],
                loading: true,
              });

              try {
                const aiSuggestions =
                  await this.engineService.getActionSuggestions(
                    data.gameId,
                    user.userId,
                  );
                client.emit('game:action:suggestions', {
                  predefined,
                  aiSuggestions,
                  loading: false,
                });
              } catch {
                client.emit('game:action:suggestions', {
                  predefined,
                  aiSuggestions: [],
                  loading: false,
                });
              }
            })
            .catch((err) =>
              this.logger.error(
                `Error sending suggestions on join: ${err}`,
              ),
            );
        }
      }
    } catch (error) {
      this.logger.error(`Error in game:join: ${error}`);
      client.emit('game:error', { message: 'Failed to join game' });
    }
  }

  @SubscribeMessage('game:leave')
  async handleGameLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string },
  ): Promise<void> {
    try {
      if (!data?.gameId) {
        client.emit('game:error', { message: 'Missing gameId' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      const gameRoom = `game:${data.gameId}`;

      // Leave the socket room
      client.leave(gameRoom);
      this.untrackRoom(client.id, gameRoom);

      // Remove cached connection
      await this.cacheService.removePlayerConnection(
        data.gameId,
        user.userId,
      );

      // Clear any disconnect timer
      const timerKey = `${data.gameId}:${user.userId}`;
      const timer = this.disconnectTimers.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(timerKey);
      }

      // Remove player from DB and check if game should end
      try {
        const result = await this.gamesService.leaveGame(user.userId, data.gameId) as any;

        // If no players left, the game was cancelled by leaveGame
        if (result?.message?.includes('cancelled')) {
          this.timerService.cancelTimer(data.gameId);
          await this.cacheService.deleteGameState(data.gameId);
          this.logger.log(`Game ${data.gameId} cancelled — no players remaining`);
        } else {
          // Check remaining alive players in engine state
          const gameState = await this.cacheService.getGameState(data.gameId);
          if (gameState) {
            const alivePlayers = gameState.players.filter((p) => p.isAlive && p.userId !== user.userId);
            if (alivePlayers.length <= 1) {
              // Not enough players to continue — finish the game
              this.timerService.cancelTimer(data.gameId);
              await this.gamesService.updateGameStatus(data.gameId, 'FINISHED');
              await this.cacheService.deleteGameState(data.gameId);
              this.server.to(gameRoom).emit('game:over', {
                result: 'Partie terminee — plus assez de joueurs',
                epilogue: '',
                scores: [],
              });
              this.logger.log(`Game ${data.gameId} finished — not enough players`);
            }
          }
        }
      } catch (leaveErr) {
        this.logger.warn(`Could not remove player from DB: ${leaveErr}`);
      }

      // Notify remaining players
      this.server.to(gameRoom).emit('game:player:left', {
        userId: user.userId,
      });

      this.logger.log(
        `Player ${user.username} left game ${data.gameId}`,
      );
    } catch (error) {
      this.logger.error(`Error in game:leave: ${error}`);
      client.emit('game:error', { message: 'Failed to leave game' });
    }
  }

  // ===========================================================================
  // Game action events
  // ===========================================================================

  @SubscribeMessage('game:action')
  async handleGameAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; action: string },
  ): Promise<void> {
    try {
      if (!data?.gameId || !data?.action) {
        client.emit('game:error', { message: 'Missing gameId or action' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      const gameRoom = `game:${data.gameId}`;

      // Submit the action to the engine
      const result = await this.engineService.submitAction(
        data.gameId,
        user.userId,
        data.action,
      );

      // Notify room that action was received
      this.server.to(gameRoom).emit('game:action:received', {
        userId: user.userId,
        remaining: result.remaining,
      });

      this.logger.log(
        `Action received from ${user.username} in game ${data.gameId}. Remaining: ${result.remaining}`,
      );

      // If all players have acted, auto-advance
      if (result.allActed) {
        await this.handleAllActionsSubmitted(data.gameId, gameRoom);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in game:action: ${msg}`);
      client.emit('game:error', { message: msg || 'Failed to submit action' });
    }
  }

  @SubscribeMessage('game:vote')
  async handleGameVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; targetId: string },
  ): Promise<void> {
    try {
      if (!data?.gameId || !data?.targetId) {
        client.emit('game:error', {
          message: 'Missing gameId or targetId',
        });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      const gameRoom = `game:${data.gameId}`;

      // Submit the vote to the engine
      const result = await this.engineService.submitVote(
        data.gameId,
        user.userId,
        data.targetId,
      );

      // Notify room that vote was received
      this.server.to(gameRoom).emit('game:vote:received', {
        userId: user.userId,
        remaining: result.remaining,
      });

      this.logger.log(
        `Vote received from ${user.username} in game ${data.gameId}. Remaining: ${result.remaining}`,
      );

      // If all players have voted, resolve the round
      if (result.allVoted) {
        await this.handleAllVotesSubmitted(data.gameId, gameRoom);
      }
    } catch (error) {
      this.logger.error(`Error in game:vote: ${error}`);
      client.emit('game:error', { message: 'Failed to submit vote' });
    }
  }

  // ===========================================================================
  // Game chat
  // ===========================================================================

  @SubscribeMessage('game:chat')
  async handleGameChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; message: string },
  ): Promise<void> {
    try {
      if (!data?.gameId || !data?.message) {
        client.emit('game:error', { message: 'Missing gameId or message' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      // Validate message
      const message = data.message.trim();
      if (message.length === 0 || message.length > 500) {
        client.emit('game:error', {
          message: 'Message must be between 1 and 500 characters',
        });
        return;
      }

      const gameRoom = `game:${data.gameId}`;
      const timestamp = new Date().toISOString();

      // Save message to DB
      await this.gamesService.saveMessage(
        data.gameId,
        user.userId,
        message,
        'CHAT',
      );

      // Cache chat message
      await this.cacheService.addChatMessage(data.gameId, {
        userId: user.userId,
        username: user.username,
        message,
        timestamp,
      });

      // Broadcast to game room
      this.server.to(gameRoom).emit('game:chat:message', {
        userId: user.userId,
        username: user.username,
        message,
        timestamp,
      });
    } catch (error) {
      this.logger.error(`Error in game:chat: ${error}`);
      client.emit('game:error', { message: 'Failed to send message' });
    }
  }

  // ===========================================================================
  // Whisper (private message)
  // ===========================================================================

  @SubscribeMessage('game:whisper')
  async handleGameWhisper(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { gameId: string; recipientId: string; message: string },
  ): Promise<void> {
    try {
      if (!data?.gameId || !data?.recipientId || !data?.message) {
        client.emit('game:error', {
          message: 'Missing gameId, recipientId or message',
        });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      const message = data.message.trim();
      if (message.length === 0 || message.length > 500) {
        client.emit('game:error', {
          message: 'Message must be between 1 and 500 characters',
        });
        return;
      }

      // Save whisper to DB
      await this.gamesService.saveWhisperMessage(
        data.gameId,
        user.userId,
        data.recipientId,
        message,
      );

      const timestamp = new Date().toISOString();
      const whisperPayload = {
        userId: user.userId,
        username: user.username,
        recipientId: data.recipientId,
        message,
        timestamp,
        isWhisper: true,
      };

      // Send only to recipient's socket
      const recipientSocketId = await this.cacheService.getPlayerConnection(
        data.gameId,
        data.recipientId,
      );
      if (recipientSocketId) {
        this.server
          .to(recipientSocketId)
          .emit('game:whisper:message', whisperPayload);
      }

      // Send back to sender for confirmation
      client.emit('game:whisper:message', whisperPayload);
    } catch (error) {
      this.logger.error(`Error in game:whisper: ${error}`);
      client.emit('game:error', { message: 'Failed to send whisper' });
    }
  }

  // ===========================================================================
  // Phase advance (host-triggered)
  // ===========================================================================

  @SubscribeMessage('game:advance')
  async handleAdvancePhase(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string },
  ): Promise<void> {
    try {
      if (!data?.gameId) {
        client.emit('game:error', { message: 'Missing gameId' });
        return;
      }

      const user = this.getUserFromSocket(client);
      if (!user) {
        client.emit('game:error', { message: 'Not authenticated' });
        return;
      }

      // Only the host can advance the phase
      const isHost = await this.gamesService.isHost(data.gameId, user.userId);
      if (!isHost) {
        client.emit('game:error', {
          message: 'Only the host can advance the phase',
        });
        return;
      }

      const state = await this.engineService.advancePhase(data.gameId);
      const gameRoom = `game:${data.gameId}`;

      this.server.to(gameRoom).emit('game:phase', {
        phase: state.currentPhase,
        round: state.currentRound,
      });

      // If we just entered ACTION phase, send action suggestions + notify
      if (state.currentPhase === 'ACTION') {
        this.sendActionSuggestions(data.gameId, gameRoom).catch((err) =>
          this.logger.error(`Error sending action suggestions: ${err}`),
        );
        this.notifyAllPlayers(
          data.gameId,
          NotificationType.TURN_ACTION,
          "C'est votre tour !",
          'Choisissez votre action avant la fin du temps imparti.',
        ).catch(() => {});
      }

      this.logger.log(
        `Game ${data.gameId} phase advanced to ${state.currentPhase} by host ${user.username}`,
      );
    } catch (error) {
      this.logger.error(`Error in game:advance: ${error}`);
      client.emit('game:error', { message: 'Failed to advance phase' });
    }
  }

  // ===========================================================================
  // Phase transition helpers
  // ===========================================================================

  /**
   * Called when all alive players have submitted actions.
   * Advances to DISCUSSION phase (players chat before voting).
   */
  private async handleAllActionsSubmitted(
    gameId: string,
    gameRoom: string,
  ): Promise<void> {
    try {
      const gameState = await this.cacheService.getGameState(gameId);
      // Cancel ACTION timer
      this.timerService.cancelTimer(gameId);

      // The engine already advanced to DISCUSSION phase in submitAction,
      // so we just need to notify clients.
      this.server.to(gameRoom).emit('game:phase', {
        phase: 'DISCUSSION',
        round: gameState?.currentRound ?? 1,
      });

      // Start DISCUSSION timer
      const gameData = await this.gamesService.getGame(gameId);
      const timeout = gameData?.turnTimeout ?? 60;
      this.server.to(gameRoom).emit('game:timer:sync', {
        seconds: timeout,
        phase: 'DISCUSSION',
      });
      await this.timerService.startTimer(gameId, 'DISCUSSION', timeout, async () => {
        await this.autoAdvancePhase(gameId, gameRoom);
      });

      this.logger.log(`Game ${gameId} advanced to DISCUSSION phase`);
    } catch (error) {
      this.logger.error(
        `Error handling all actions submitted for game ${gameId}: ${error}`,
      );
      this.server.to(gameRoom).emit('game:error', {
        message: 'Error advancing game phase',
      });
    }
  }

  /**
   * Called when all alive players have submitted votes.
   * Resolves the round and checks for game over.
   */
  private async handleAllVotesSubmitted(
    gameId: string,
    gameRoom: string,
  ): Promise<void> {
    try {
      // Cancel VOTE timer since all players voted
      this.timerService.cancelTimer(gameId);
      await this.resolveAndAdvance(gameId, gameRoom);
    } catch (error) {
      this.logger.error(
        `Error handling all votes submitted for game ${gameId}: ${error}`,
      );
      this.server.to(gameRoom).emit('game:error', {
        message: 'Error resolving round',
      });
    }
  }

  /**
   * Resolve the current round via the engine, emit results,
   * and either end the game or start the next narration after a delay.
   */
  private async resolveAndAdvance(
    gameId: string,
    gameRoom: string,
  ): Promise<void> {
    // Resolve the round — this also handles endGame internally if needed
    const resolution = await this.engineService.resolveRound(gameId);

    // Emit resolution to all players
    this.server.to(gameRoom).emit('game:resolution', {
      narrative: resolution.narrative,
      eliminations: resolution.eliminations,
      gaugeChanges: resolution.gaugeChanges,
    });

    const gameState = await this.cacheService.getGameState(gameId);

    this.server.to(gameRoom).emit('game:phase', {
      phase: 'RESOLUTION',
      round: gameState?.currentRound ?? 1,
    });

    this.logger.log(`Game ${gameId} round resolved`);

    // Use resolveRound's return value instead of calling checkGameOver separately
    if (resolution.isGameOver && resolution.gameResult) {
      // Game is over — result already computed by resolveRound/endGame
      this.server.to(gameRoom).emit('game:over', {
        result: resolution.gameResult.result,
        epilogue: resolution.gameResult.epilogue,
        scores: resolution.gameResult.scores,
      });

      // Update game status in DB
      await this.gamesService.updateGameStatus(gameId, 'FINISHED');

      // Push game-finished notifications to all players
      this.notifyAllPlayers(
        gameId,
        NotificationType.GAME_FINISHED,
        'Partie terminée',
        `Résultat : ${resolution.gameResult.result}`,
      ).catch(() => {});

      // Clean up cached state
      await this.cacheService.deleteGameState(gameId);

      this.logger.log(`Game ${gameId} finished: ${resolution.gameResult.result}`);
    } else {
      // Let players read the resolution — send a timer so they see a countdown
      const RESOLUTION_DELAY = 12; // seconds
      this.server.to(gameRoom).emit('game:timer:sync', {
        seconds: RESOLUTION_DELAY,
        phase: 'RESOLUTION',
      });

      // Start next round after the delay
      setTimeout(async () => {
        try {
          const gameState = await this.cacheService.getGameState(gameId);
          const nextRound = gameState?.currentRound ?? 1;

          this.server.to(gameRoom).emit('game:phase', {
            phase: 'NARRATION',
            round: nextRound,
          });

          // Stream the narration
          this.server.to(gameRoom).emit('game:narration', {
            text: '',
            isStreaming: true,
          });

          try {
            for await (const result of this.engineService.startStreamingNarration(gameId)) {
              if (result.chunk) {
                this.server.to(gameRoom).emit('game:narration:chunk', { chunk: result.chunk });
              }
              if (result.complete) {
                this.server.to(gameRoom).emit('game:narration:complete', { text: result.fullText ?? '' });
              }
            }
          } catch (streamErr) {
            const narration = await this.engineService.startNarration(gameId);
            this.server.to(gameRoom).emit('game:narration', { text: narration.text, isStreaming: false });
          }

          // Start timer for NARRATION phase
          const gameData = await this.gamesService.getGame(gameId);
          const timeout = gameData?.turnTimeout ?? 60;
          this.server.to(gameRoom).emit('game:timer:sync', {
            seconds: timeout,
            phase: 'NARRATION',
          });
          await this.timerService.startTimer(gameId, 'NARRATION', timeout, async () => {
            await this.autoAdvancePhase(gameId, gameRoom);
          });

          this.logger.log(
            `Game ${gameId} started streaming narration for round ${nextRound}`,
          );
        } catch (error) {
          this.logger.error(
            `Error starting next narration for game ${gameId}: ${error}`,
          );
          this.server.to(gameRoom).emit('game:error', {
            message: 'Error starting next round',
          });
        }
      }, RESOLUTION_DELAY * 1000);
    }
  }

  // ===========================================================================
  // Action suggestions
  // ===========================================================================

  /**
   * Send predefined actions immediately, then generate AI suggestions per
   * player in parallel and push them once ready.
   */
  private async sendActionSuggestions(
    gameId: string,
    gameRoom: string,
  ): Promise<void> {
    try {
      const predefined =
        await this.engineService.getPredefinedActions(gameId);

      // Send predefined actions immediately to every socket in the room
      // with loading=true so the frontend shows a spinner for AI suggestions
      const sockets = await this.server.in(gameRoom).fetchSockets();

      for (const socket of sockets) {
        socket.emit('game:action:suggestions', {
          predefined,
          aiSuggestions: [],
          loading: true,
        });
      }

      // Generate AI suggestions per player in parallel
      const gameState = await this.cacheService.getGameState(gameId);
      if (!gameState) return;

      const alivePlayers = gameState.players.filter((p) => p.isAlive);

      const suggestionPromises = alivePlayers.map(async (player) => {
        try {
          const suggestions = await this.engineService.getActionSuggestions(
            gameId,
            player.userId,
          );
          return { userId: player.userId, suggestions };
        } catch (err) {
          this.logger.warn(
            `Failed to get AI suggestions for ${player.userId}: ${err}`,
          );
          return { userId: player.userId, suggestions: [] };
        }
      });

      const results = await Promise.all(suggestionPromises);

      // Send per-player AI suggestions to the matching socket
      for (const socket of sockets) {
        const socketUser = this.socketUsers.get(socket.id);
        if (!socketUser) continue;

        const playerResult = results.find(
          (r) => r.userId === socketUser.userId,
        );

        socket.emit('game:action:suggestions', {
          predefined,
          aiSuggestions: playerResult?.suggestions ?? [],
          loading: false,
        });
      }
    } catch (error) {
      this.logger.error(
        `Error sending action suggestions for game ${gameId}: ${error}`,
      );
      // On failure, send loading=false so the frontend stops the spinner
      this.server.to(gameRoom).emit('game:action:suggestions', {
        predefined: [],
        aiSuggestions: [],
        loading: false,
      });
    }
  }

  // ===========================================================================
  // Utility helpers
  // ===========================================================================

  /**
   * Auto-advance the game phase when the server timer expires.
   * Called by the TimerService callback.
   */
  private async autoAdvancePhase(
    gameId: string,
    gameRoom: string,
  ): Promise<void> {
    try {
      const state = await this.engineService.advancePhase(gameId);
      this.server.to(gameRoom).emit('game:phase', {
        phase: state.currentPhase,
        round: state.currentRound,
      });

      // If entering ACTION phase, send suggestions + notify players
      if (state.currentPhase === 'ACTION') {
        this.sendActionSuggestions(gameId, gameRoom).catch((err) =>
          this.logger.error(`Error sending action suggestions: ${err}`),
        );
        this.notifyAllPlayers(
          gameId,
          NotificationType.TURN_ACTION,
          "C'est votre tour !",
          'Choisissez votre action avant la fin du temps imparti.',
        ).catch(() => {});
      }

      // If entering VOTE phase after timer expires on DISCUSSION, auto-resolve
      // after vote timer too
      if (state.currentPhase === 'VOTE') {
        // handled below by the timer
      }

      // Start timer for the new phase
      const gameData = await this.gamesService.getGame(gameId);
      const timeout = gameData?.turnTimeout ?? 60;
      this.server.to(gameRoom).emit('game:timer:sync', {
        seconds: timeout,
        phase: state.currentPhase,
      });

      // Don't auto-advance from RESOLUTION (it's handled by resolveAndAdvance)
      if (state.currentPhase !== 'RESOLUTION') {
        await this.timerService.startTimer(gameId, state.currentPhase, timeout, async () => {
          // When VOTE timer expires, resolve the round instead of just advancing
          if (state.currentPhase === 'VOTE') {
            await this.resolveAndAdvance(gameId, gameRoom);
          } else {
            await this.autoAdvancePhase(gameId, gameRoom);
          }
        });
      }

      this.logger.log(
        `Timer expired: game ${gameId} auto-advanced to ${state.currentPhase}`,
      );
    } catch (error) {
      this.logger.error(
        `Error auto-advancing phase for game ${gameId}: ${error}`,
      );
    }
  }

  /**
   * Create a persistent notification and push it in real-time to the user's socket.
   */
  private async sendNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const notification = await this.notificationsService.create(
        userId,
        type,
        title,
        message,
        data,
      );

      // Find the user's socket across all rooms
      const sockets = await this.server.fetchSockets();
      for (const socket of sockets) {
        const socketUser = this.socketUsers.get(socket.id);
        if (socketUser?.userId === userId) {
          socket.emit('notification:new', {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data as Record<string, any> | undefined,
            createdAt: notification.createdAt.toISOString(),
          });
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Error sending notification to ${userId}: ${error}`);
    }
  }

  /**
   * Send notifications to all players in a game.
   */
  private async notifyAllPlayers(
    gameId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const game = await this.gamesService.getGame(gameId);
      await Promise.all(
        game.players.map((p: any) =>
          this.sendNotification(p.userId, type, title, message, {
            ...data,
            gameId,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Error notifying all players for game ${gameId}: ${error}`,
      );
    }
  }

  /**
   * Emit an updated lobby state to all clients in a lobby room.
   */
  private async emitLobbyUpdate(
    room: string,
    gameId?: string,
  ): Promise<void> {
    try {
      // Derive gameId from room name if not provided
      const id = gameId ?? room.replace('lobby:', '');

      const game = await this.gamesService.getGame(id);
      const players = game.players.map((p: any) => ({
        userId: p.user.id,
        username: p.user.username,
        avatar: p.user.avatar,
        isHost: p.isHost,
      }));

      this.server.to(room).emit('lobby:update', {
        players,
        playerCount: players.length,
        maxPlayers: game.maxPlayers,
      });
    } catch (error) {
      this.logger.error(`Error emitting lobby update: ${error}`);
    }
  }
}
