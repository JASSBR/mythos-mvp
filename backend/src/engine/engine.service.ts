import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { AiService } from '../ai/ai.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { GamesService } from '../games/games.service';
import {
  GameState,
  GameResult,
  NarrationResult,
  RoundResolution,
  RoundState,
  RoundAction,
  RoundVote,
  PlayerState,
  WinConditionResult,
  ResolveRoundResult,
} from './engine.types';
import { ScenarioPack } from '../scenarios/interfaces/scenario.interface';

@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly aiService: AiService,
    private readonly scenariosService: ScenariosService,
    @Inject(forwardRef(() => GamesService))
    private readonly gamesService: GamesService,
  ) {}

  /**
   * Expose scenario config for external consumers (e.g. WebSocket gateway).
   */
  getScenarioConfig(slug: string) {
    return this.scenariosService.getScenarioConfig(slug);
  }

  // ===========================================================================
  // INITIALIZE GAME
  // ===========================================================================

  /**
   * Initialize a game: assign roles, set up gauges, create initial state.
   * Transitions the game from LOBBY to IN_PROGRESS.
   */
  async initializeGame(gameId: string): Promise<GameState> {
    this.logger.log(`Initializing game ${gameId}`);

    // Load game from DB with players
    const game = await this.gamesService.getGame(gameId);
    if (!game) {
      throw new NotFoundException(`Game "${gameId}" not found`);
    }

    if (game.status !== 'LOBBY') {
      throw new BadRequestException('Game is not in LOBBY status');
    }

    // Load scenario configuration
    const scenario = this.scenariosService.getScenario(game.scenarioSlug);
    const scenarioConfig = this.scenariosService.getScenarioConfig(
      game.scenarioSlug,
    );

    const playerCount = game.players.length;
    if (playerCount < scenario.minPlayers) {
      throw new BadRequestException(
        `Need at least ${scenario.minPlayers} players to start (currently ${playerCount})`,
      );
    }

    // Assign roles to players
    const roleAssignments = this.scenariosService.getRolesForPlayers(
      game.scenarioSlug,
      playerCount,
    );

    // Build initial player gauges from scenario config
    const playerGaugeDefaults: Record<string, number> = {};
    for (const gauge of scenarioConfig.gauges) {
      if (gauge.appliesTo === 'player' || gauge.appliesTo === 'all') {
        playerGaugeDefaults[gauge.id] = gauge.initial;
      }
    }

    // Build initial global gauges from scenario config
    const globalGauges: Record<string, number> = {};
    for (const gauge of scenarioConfig.gauges) {
      if (gauge.appliesTo === 'global' || gauge.appliesTo === 'all') {
        globalGauges[gauge.id] = gauge.initial;
      }
    }

    // Create player states and update DB records
    const players: PlayerState[] = [];
    const dbUpdates: Array<{
      userId: string;
      role: string;
      data: any;
    }> = [];

    for (let i = 0; i < game.players.length; i++) {
      const dbPlayer = game.players[i];
      const role = roleAssignments[i];

      const playerState: PlayerState = {
        userId: dbPlayer.userId,
        username: dbPlayer.user.username,
        role: role.name,
        team: role.team,
        isAlive: true,
        isConnected: true,
        gauges: { ...playerGaugeDefaults },
        score: 0,
      };

      players.push(playerState);

      dbUpdates.push({
        userId: dbPlayer.userId,
        role: role.id,
        data: {
          roleName: role.name,
          team: role.team,
          gauges: { ...playerGaugeDefaults },
        },
      });
    }

    // Update all players in DB with their assigned roles
    for (const update of dbUpdates) {
      await this.prisma.gamePlayer.update({
        where: {
          gameId_userId: { gameId, userId: update.userId },
        },
        data: {
          role: update.role,
          data: update.data,
        },
      });
    }

    // Create the initial game state
    const now = new Date().toISOString();
    const state: GameState = {
      gameId,
      scenarioSlug: game.scenarioSlug,
      status: 'IN_PROGRESS',
      currentPhase: 'NARRATION',
      currentRound: 1,
      maxRounds: scenarioConfig.maxRounds,
      players,
      globalGauges,
      rounds: [],
      hostId: game.hostId,
      createdAt: game.createdAt?.toISOString?.() ?? now,
      startedAt: now,
      finishedAt: null,
    };

    // Create the first round state
    const firstRound: RoundState = {
      round: 1,
      phase: 'NARRATION',
      narration: null,
      actions: [],
      votes: [],
      resolution: null,
      startedAt: now,
    };
    state.rounds.push(firstRound);

    // Save state to cache (fast access) and DB (persistence)
    await this.cache.setGameState(gameId, state);
    await this.gamesService.saveGameState(gameId, state);

    // Update game status in DB
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'IN_PROGRESS',
        currentPhase: 'NARRATION',
        currentRound: 1,
        startedAt: new Date(),
      },
    });

    // Log the initialization event
    await this.gamesService.addGameEvent(gameId, {
      round: 1,
      phase: 'NARRATION',
      type: 'GAME_STARTED',
      data: {
        playerCount,
        roles: players.map((p) => ({
          userId: p.userId,
          role: p.role,
          team: p.team,
        })),
      },
    });

    this.logger.log(
      `Game ${gameId} initialized with ${playerCount} players, scenario: ${game.scenarioSlug}`,
    );

    return state;
  }

  // ===========================================================================
  // START NARRATION
  // ===========================================================================

  /**
   * Start the narration phase for the current round.
   * Calls the AI to generate narrative text.
   */
  async startNarration(gameId: string): Promise<NarrationResult> {
    this.logger.log(`Starting narration for game ${gameId}`);

    const state = await this.loadState(gameId);
    const scenario = this.scenariosService.getScenario(state.scenarioSlug);
    const config = this.scenariosService.getScenarioConfig(state.scenarioSlug);

    // Build the context string from the current game state
    const context = this.buildGameContext(state);

    let userPrompt: string;

    if (state.currentRound === 1) {
      // First round: use the intro prompt
      userPrompt = config.aiPrompt.introPrompt;
    } else {
      // Subsequent rounds: use the round prompt with interpolated values
      const prevRound = state.rounds[state.currentRound - 2];
      const actionsText =
        prevRound?.actions
          ?.map((a) => {
            const player = state.players.find((p) => p.userId === a.userId);
            return `${player?.username || a.userId}: ${a.action}`;
          })
          .join('; ') || 'Aucune action';

      userPrompt = config.aiPrompt.roundPrompt
        .replace('{round}', String(state.currentRound))
        .replace('{maxRounds}', String(state.maxRounds))
        .replace('{actions}', actionsText);

      // Interpolate global gauge values
      for (const [gaugeId, gaugeValue] of Object.entries(state.globalGauges)) {
        userPrompt = userPrompt.replace(`{${gaugeId}}`, String(gaugeValue));
      }
    }

    // Check AI rate limit
    const allowed = await this.cache.checkAiRateLimit(gameId);
    if (!allowed) {
      this.logger.warn(`AI rate limit reached for game ${gameId}`);
    }

    // Call the AI to generate narration
    const narrative = await this.aiService.narrate(
      config.aiPrompt.systemPrompt,
      userPrompt,
      context,
    );

    // Update the current round state
    const currentRound = this.getCurrentRound(state);
    currentRound.narration = narrative;
    currentRound.phase = 'NARRATION';
    state.currentPhase = 'NARRATION';

    // Save updated state
    await this.saveState(state);

    // Log the narration event
    await this.gamesService.addGameEvent(gameId, {
      round: state.currentRound,
      phase: 'NARRATION',
      type: 'NARRATION_GENERATED',
      narrative,
    });

    return {
      text: narrative,
      phase: 'NARRATION',
      round: state.currentRound,
    };
  }

  // ===========================================================================
  // STREAMING NARRATION
  // ===========================================================================

  /**
   * Start streaming narration for the current round.
   * Yields text chunks as they arrive from the AI, then saves the full text.
   */
  async *startStreamingNarration(
    gameId: string,
  ): AsyncGenerator<{ chunk?: string; complete?: boolean; fullText?: string }> {
    this.logger.log(`Starting streaming narration for game ${gameId}`);

    const state = await this.loadState(gameId);
    const config = this.scenariosService.getScenarioConfig(state.scenarioSlug);
    const context = this.buildGameContext(state);

    let userPrompt: string;

    if (state.currentRound === 1) {
      userPrompt = config.aiPrompt.introPrompt;
    } else {
      const prevRound = state.rounds[state.currentRound - 2];
      const actionsText =
        prevRound?.actions
          ?.map((a) => {
            const player = state.players.find((p) => p.userId === a.userId);
            return `${player?.username || a.userId}: ${a.action}`;
          })
          .join('; ') || 'Aucune action';

      userPrompt = config.aiPrompt.roundPrompt
        .replace('{round}', String(state.currentRound))
        .replace('{maxRounds}', String(state.maxRounds))
        .replace('{actions}', actionsText);

      for (const [gaugeId, gaugeValue] of Object.entries(state.globalGauges)) {
        userPrompt = userPrompt.replace(`{${gaugeId}}`, String(gaugeValue));
      }
    }

    await this.cache.checkAiRateLimit(gameId);

    let fullText = '';
    try {
      for await (const chunk of this.aiService.streamNarrate(
        config.aiPrompt.systemPrompt,
        userPrompt,
        context,
      )) {
        fullText += chunk;
        yield { chunk };
      }
    } catch (error) {
      this.logger.error(`Streaming narration error: ${error}`);
      // Fallback to non-streaming
      fullText = await this.aiService.narrate(
        config.aiPrompt.systemPrompt,
        userPrompt,
        context,
      );
      yield { chunk: fullText };
    }

    // Save the complete narration
    const currentRound = this.getCurrentRound(state);
    currentRound.narration = fullText;
    currentRound.phase = 'NARRATION';
    state.currentPhase = 'NARRATION';
    await this.saveState(state);

    await this.gamesService.addGameEvent(gameId, {
      round: state.currentRound,
      phase: 'NARRATION',
      type: 'NARRATION_GENERATED',
      narrative: fullText,
    });

    yield { complete: true, fullText };
  }

  // ===========================================================================
  // SUBMIT ACTION
  // ===========================================================================

  /**
   * Submit a player action during the ACTION phase.
   * Returns acceptance status and how many players still need to act.
   */
  async submitAction(
    gameId: string,
    userId: string,
    action: string,
  ): Promise<{ remaining: number; allActed: boolean }> {
    this.logger.log(`Action from ${userId} in game ${gameId}: ${action}`);

    const state = await this.loadState(gameId);

    // Validate: phase must be ACTION
    if (state.currentPhase !== 'ACTION') {
      throw new BadRequestException(
        `Cannot submit action in phase ${state.currentPhase}`,
      );
    }

    // Validate: player must be alive
    const player = state.players.find((p) => p.userId === userId);
    if (!player) {
      throw new NotFoundException('Player not found in this game');
    }
    if (!player.isAlive) {
      throw new BadRequestException('Eliminated players cannot act');
    }

    // Validate: player hasn't already acted this round
    const currentRound = this.getCurrentRound(state);
    const alreadyActed = currentRound.actions.some(
      (a) => a.userId === userId,
    );
    if (alreadyActed) {
      throw new BadRequestException('You have already submitted an action this round');
    }

    // Add the action
    const roundAction: RoundAction = {
      userId,
      action,
      submittedAt: new Date().toISOString(),
    };
    currentRound.actions.push(roundAction);

    // Cache actions for this round
    await this.cache.setRoundActions(gameId, state.currentRound, currentRound.actions);

    // Save the action event
    await this.gamesService.addGameEvent(gameId, {
      round: state.currentRound,
      phase: 'ACTION',
      type: 'ACTION_SUBMITTED',
      actorId: userId,
      data: { action },
    });

    // Check if all alive players have acted
    const alivePlayers = state.players.filter((p) => p.isAlive);
    const actedPlayerIds = new Set(currentRound.actions.map((a) => a.userId));
    const remaining = alivePlayers.filter(
      (p) => !actedPlayerIds.has(p.userId),
    ).length;

    const allActed = remaining === 0;

    // If all alive players have acted, auto-advance to DISCUSSION phase
    if (allActed) {
      currentRound.phase = 'DISCUSSION';
      state.currentPhase = 'DISCUSSION';

      await this.prisma.game.update({
        where: { id: gameId },
        data: { currentPhase: 'DISCUSSION' as any },
      });

      this.logger.log(
        `All players acted in game ${gameId}, advancing to DISCUSSION phase`,
      );
    }

    // Save state
    await this.saveState(state);

    return { remaining, allActed };
  }

  // ===========================================================================
  // SUBMIT VOTE
  // ===========================================================================

  /**
   * Submit a player vote during the VOTE phase.
   * Returns acceptance status and how many voters remain.
   */
  async submitVote(
    gameId: string,
    userId: string,
    targetId: string,
  ): Promise<{ remaining: number; allVoted: boolean }> {
    this.logger.log(
      `Vote from ${userId} targeting ${targetId} in game ${gameId}`,
    );

    const state = await this.loadState(gameId);

    // Validate: phase must be VOTE
    if (state.currentPhase !== 'VOTE') {
      throw new BadRequestException(
        `Cannot submit vote in phase ${state.currentPhase}`,
      );
    }

    // Validate: voter must be alive
    const voter = state.players.find((p) => p.userId === userId);
    if (!voter) {
      throw new NotFoundException('Voter not found in this game');
    }
    if (!voter.isAlive) {
      throw new BadRequestException('Eliminated players cannot vote');
    }

    // Validate: target must exist and be alive
    const target = state.players.find((p) => p.userId === targetId);
    if (!target) {
      throw new NotFoundException('Vote target not found in this game');
    }
    if (!target.isAlive) {
      throw new BadRequestException('Cannot vote for an eliminated player');
    }

    // Validate: player hasn't already voted this round
    const currentRound = this.getCurrentRound(state);
    const alreadyVoted = currentRound.votes.some((v) => v.userId === userId);
    if (alreadyVoted) {
      throw new BadRequestException('You have already voted this round');
    }

    // Add the vote
    const roundVote: RoundVote = {
      userId,
      targetId,
      submittedAt: new Date().toISOString(),
    };
    currentRound.votes.push(roundVote);

    // Cache votes for this round
    await this.cache.setRoundVotes(gameId, state.currentRound, currentRound.votes);

    // Save the vote event
    await this.gamesService.addGameEvent(gameId, {
      round: state.currentRound,
      phase: 'VOTE',
      type: 'VOTE_SUBMITTED',
      actorId: userId,
      data: { targetId },
    });

    // Check if all alive players have voted
    const alivePlayers = state.players.filter((p) => p.isAlive);
    const votedPlayerIds = new Set(currentRound.votes.map((v) => v.userId));
    const remaining = alivePlayers.filter(
      (p) => !votedPlayerIds.has(p.userId),
    ).length;

    const allVoted = remaining === 0;

    // If all alive players have voted, auto-advance to RESOLUTION
    if (allVoted) {
      currentRound.phase = 'RESOLUTION';
      state.currentPhase = 'RESOLUTION';

      await this.prisma.game.update({
        where: { id: gameId },
        data: { currentPhase: 'RESOLUTION' },
      });

      this.logger.log(
        `All players voted in game ${gameId}, advancing to RESOLUTION phase`,
      );
    }

    // Save state
    await this.saveState(state);

    return { remaining, allVoted };
  }

  // ===========================================================================
  // RESOLVE ROUND
  // ===========================================================================

  /**
   * Resolve the current round: tally votes, process actions through AI,
   * apply state changes, check win conditions, and advance the game.
   */
  async resolveRound(gameId: string): Promise<ResolveRoundResult> {
    this.logger.log(`Resolving round for game ${gameId}`);

    const state = await this.loadState(gameId);
    const scenario = this.scenariosService.getScenario(state.scenarioSlug);
    const currentRound = this.getCurrentRound(state);

    // ---- 1. Tally votes ----
    const voteTally = this.tallyVotes(currentRound.votes);
    const mostVotedId = voteTally.length > 0 ? voteTally[0].userId : null;
    const mostVotedCount = voteTally.length > 0 ? voteTally[0].count : 0;

    // Check for tie (if tied, no elimination by vote)
    const isTie =
      voteTally.length > 1 && voteTally[0].count === voteTally[1].count;

    // ---- 2. Send actions + votes to AI for resolution ----
    const aiResult = await this.aiService.resolveActions(
      scenario,
      state,
      currentRound.actions,
    );

    // ---- 3. Apply AI-determined gauge changes ----
    const gaugeChanges: Record<string, Record<string, number>> = {};

    // Apply global gauge changes
    if (aiResult.stateChanges.globalGauges) {
      gaugeChanges['global'] = {};
      for (const [gaugeId, delta] of Object.entries(
        aiResult.stateChanges.globalGauges as Record<string, number>,
      )) {
        const prevValue = state.globalGauges[gaugeId] ?? 0;
        const gaugeConfig = scenario.gauges.find((g) => g.id === gaugeId);
        const min = gaugeConfig?.min ?? 0;
        const max = gaugeConfig?.max ?? 100;
        const newValue = Math.max(min, Math.min(max, prevValue + delta));
        gaugeChanges['global'][gaugeId] = delta;
        state.globalGauges[gaugeId] = newValue;
      }
    }

    // Apply per-player gauge changes
    if (aiResult.stateChanges.playerGauges) {
      for (const [playerId, changes] of Object.entries(
        aiResult.stateChanges.playerGauges as Record<
          string,
          Record<string, number>
        >,
      )) {
        const player = state.players.find((p) => p.userId === playerId);
        if (player && player.isAlive) {
          gaugeChanges[playerId] = {};
          for (const [gaugeId, delta] of Object.entries(changes)) {
            const prevValue = player.gauges[gaugeId] ?? 0;
            const gaugeConfig = scenario.gauges.find((g) => g.id === gaugeId);
            const min = gaugeConfig?.min ?? 0;
            const max = gaugeConfig?.max ?? 100;
            const newValue = Math.max(min, Math.min(max, prevValue + delta));
            gaugeChanges[playerId][gaugeId] = delta;
            player.gauges[gaugeId] = newValue;
          }
        }
      }
    }

    // ---- 4. Handle vote-based suspicion increase for most voted player ----
    const eliminations: string[] = [];

    if (mostVotedId && !isTie) {
      const targetPlayer = state.players.find(
        (p) => p.userId === mostVotedId,
      );

      if (targetPlayer && targetPlayer.isAlive) {
        // Increase suspicion for the most voted player
        if (targetPlayer.gauges.suspicion !== undefined) {
          const suspicionIncrease = mostVotedCount * 15;
          targetPlayer.gauges.suspicion = Math.min(
            100,
            targetPlayer.gauges.suspicion + suspicionIncrease,
          );

          if (!gaugeChanges[mostVotedId]) {
            gaugeChanges[mostVotedId] = {};
          }
          gaugeChanges[mostVotedId].suspicion =
            (gaugeChanges[mostVotedId].suspicion ?? 0) + suspicionIncrease;
        }

        // For DEEP scenario: if majority vote targets someone and it's a clear majority,
        // this could lead to identification/elimination
        const alivePlayers = state.players.filter((p) => p.isAlive);
        const majorityThreshold = Math.ceil(alivePlayers.length / 2);

        if (mostVotedCount >= majorityThreshold) {
          // Check if this is the saboteur (for DEEP scenario)
          if (
            state.scenarioSlug === 'deep' &&
            targetPlayer.team === 'saboteur'
          ) {
            // Saboteur identified! Equipage wins
            targetPlayer.isAlive = false;
            eliminations.push(mostVotedId);
          } else if (state.scenarioSlug === 'deep') {
            // Wrong person voted out - penalty to moral
            state.globalGauges.moral = Math.max(
              0,
              (state.globalGauges.moral ?? 50) - 15,
            );
            if (!gaugeChanges['global']) gaugeChanges['global'] = {};
            gaugeChanges['global'].moral =
              (gaugeChanges['global'].moral ?? 0) - 15;
          }
          // For TRIBUNAL: votes are tracked for final verdict
        }
      }
    }

    // ---- 5. Apply AI-determined eliminations ----
    if (aiResult.stateChanges.eliminations) {
      for (const eliminatedId of aiResult.stateChanges.eliminations) {
        const player = state.players.find((p) => p.userId === eliminatedId);
        if (player && player.isAlive && !eliminations.includes(eliminatedId)) {
          player.isAlive = false;
          eliminations.push(eliminatedId);
        }
      }
    }

    // ---- 6. Update player data in DB ----
    for (const player of state.players) {
      await this.prisma.gamePlayer.update({
        where: {
          gameId_userId: { gameId, userId: player.userId },
        },
        data: {
          isAlive: player.isAlive,
          data: {
            roleName: player.role,
            team: player.team,
            gauges: player.gauges,
          },
        },
      });
    }

    // ---- 7. Save round resolution ----
    const resolution: RoundResolution = {
      narrative: aiResult.narrative,
      eliminations,
      gaugeChanges,
    };
    currentRound.resolution = resolution;

    // ---- 8. Check win conditions ----
    const winCheck = this.checkWinConditions(state, scenario);

    let gameResult: GameResult | undefined;

    if (winCheck.isOver) {
      // Game is over!
      gameResult = await this.endGame(
        gameId,
        state,
        scenario,
        winCheck.result || 'Partie terminee',
        winCheck.winners || [],
        winCheck.winningTeam,
      );
    } else {
      // Not over yet: advance to next round
      state.currentRound += 1;
      state.currentPhase = 'NARRATION';

      // Create next round state
      const nextRound: RoundState = {
        round: state.currentRound,
        phase: 'NARRATION',
        narration: null,
        actions: [],
        votes: [],
        resolution: null,
        startedAt: new Date().toISOString(),
      };
      state.rounds.push(nextRound);

      // Update DB
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          currentRound: state.currentRound,
          currentPhase: 'NARRATION',
        },
      });
    }

    // Save the resolution event
    await this.gamesService.addGameEvent(gameId, {
      round: currentRound.round,
      phase: 'RESOLUTION',
      type: 'ROUND_RESOLVED',
      data: {
        eliminations,
        gaugeChanges,
        isGameOver: winCheck.isOver,
      },
      narrative: aiResult.narrative,
    });

    // Save state
    await this.saveState(state);

    this.logger.log(
      `Round ${currentRound.round} resolved for game ${gameId}. ` +
        `Eliminations: ${eliminations.length}. Game over: ${winCheck.isOver}`,
    );

    return {
      narrative: aiResult.narrative,
      eliminations,
      gaugeChanges,
      isGameOver: winCheck.isOver,
      gameResult,
    };
  }

  // ===========================================================================
  // END GAME
  // ===========================================================================

  /**
   * End the game: generate epilogue, calculate scores, update stats.
   */
  private async endGame(
    gameId: string,
    state: GameState,
    scenario: ScenarioPack,
    result: string,
    winners: string[],
    winningTeam?: string,
  ): Promise<GameResult> {
    this.logger.log(`Ending game ${gameId}: ${result}`);

    // Generate epilogue via AI
    const epilogue = await this.aiService.generateEpilogue(
      scenario,
      state,
      result,
    );

    // Calculate final scores
    this.calculateScores(state, winners, winningTeam);

    // Build the final result
    const gameResult: GameResult = {
      result,
      epilogue,
      winners,
      scores: state.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        score: p.score,
        role: p.role,
        team: p.team,
      })),
    };

    // Update game status
    state.status = 'FINISHED';
    state.finishedAt = new Date().toISOString();
    state.currentPhase = 'RESOLUTION';

    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'FINISHED',
        finishedAt: new Date(),
        stateSnapshot: state as any,
      },
    });

    // Update player scores in DB
    for (const player of state.players) {
      await this.prisma.gamePlayer.update({
        where: {
          gameId_userId: { gameId, userId: player.userId },
        },
        data: {
          score: player.score,
        },
      });
    }

    // Update UserStats for all players
    const winnerSet = new Set(winners);
    for (const player of state.players) {
      try {
        await this.prisma.userStats.updateMany({
          where: { userId: player.userId },
          data: {
            gamesPlayed: { increment: 1 },
            ...(winnerSet.has(player.userId)
              ? { gamesWon: { increment: 1 } }
              : {}),
          },
        });
      } catch (error) {
        this.logger.warn(
          `Failed to update stats for user ${player.userId}: ${error}`,
        );
      }
    }

    // Log the game end event
    await this.gamesService.addGameEvent(gameId, {
      round: state.currentRound,
      phase: 'RESOLUTION',
      type: 'GAME_ENDED',
      data: gameResult,
      narrative: epilogue,
    });

    // Clean up cache (keep state for a while for post-game review)
    await this.saveState(state);

    return gameResult;
  }

  // ===========================================================================
  // ADVANCE PHASE
  // ===========================================================================

  /**
   * Manually advance the game to the next phase.
   * Used by the host or by timeout triggers.
   */
  async advancePhase(gameId: string): Promise<GameState> {
    this.logger.log(`Advancing phase for game ${gameId}`);

    const state = await this.loadState(gameId);

    switch (state.currentPhase) {
      case 'NARRATION':
        state.currentPhase = 'ACTION';
        this.getCurrentRound(state).phase = 'ACTION';
        break;

      case 'ACTION':
        state.currentPhase = 'DISCUSSION';
        this.getCurrentRound(state).phase = 'DISCUSSION';
        break;

      case 'DISCUSSION':
        state.currentPhase = 'VOTE';
        this.getCurrentRound(state).phase = 'VOTE';
        break;

      case 'VOTE':
        state.currentPhase = 'RESOLUTION';
        this.getCurrentRound(state).phase = 'RESOLUTION';
        break;

      case 'RESOLUTION':
        // Resolution is handled by resolveRound, but if we need to
        // force-advance, move to next round's narration
        if (state.currentRound < state.maxRounds) {
          state.currentRound += 1;
          state.currentPhase = 'NARRATION';
          const nextRound: RoundState = {
            round: state.currentRound,
            phase: 'NARRATION',
            narration: null,
            actions: [],
            votes: [],
            resolution: null,
            startedAt: new Date().toISOString(),
          };
          state.rounds.push(nextRound);
        }
        break;

      default:
        throw new BadRequestException(`Cannot advance from phase ${state.currentPhase}`);
    }

    // Update DB
    await this.prisma.game.update({
      where: { id: gameId },
      data: {
        currentPhase: state.currentPhase as any,
        currentRound: state.currentRound,
      },
    });

    await this.saveState(state);

    return state;
  }

  // ===========================================================================
  // GET GAME STATE
  // ===========================================================================

  /**
   * Get the current game state.
   * Tries cache first, then falls back to DB snapshot.
   */
  async getGameState(gameId: string): Promise<GameState | null> {
    // Try cache first
    const cached = await this.cache.getGameState(gameId);
    if (cached) {
      return cached;
    }

    // Fallback to DB snapshot
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      select: { stateSnapshot: true },
    });

    if (game?.stateSnapshot) {
      const state = game.stateSnapshot as unknown as GameState;
      // Re-cache for fast access
      await this.cache.setGameState(gameId, state);
      return state;
    }

    return null;
  }

  // ===========================================================================
  // CHECK GAME OVER
  // ===========================================================================

  /**
   * Check if the game is over and, if so, end it (epilogue + scores).
   * Returns GameResult if the game ended, or null if it continues.
   */
  async checkGameOver(gameId: string): Promise<GameResult | null> {
    const state = await this.loadState(gameId);
    const scenario = this.scenariosService.getScenario(state.scenarioSlug);
    const winCondition = this.checkWinConditions(state, scenario);

    if (!winCondition.isOver) {
      return null;
    }

    return this.endGame(
      gameId,
      state,
      scenario,
      winCondition.result ?? 'Game over',
      winCondition.winners ?? [],
      winCondition.winningTeam,
    );
  }

  // ===========================================================================
  // GENERATE ACTION SUGGESTIONS
  // ===========================================================================

  /**
   * Generate AI-powered action suggestions for a specific player.
   */
  async getActionSuggestions(
    gameId: string,
    userId: string,
  ): Promise<string[]> {
    const state = await this.loadState(gameId);
    const scenario = this.scenariosService.getScenario(state.scenarioSlug);
    const player = state.players.find((p) => p.userId === userId);

    if (!player) {
      throw new NotFoundException('Player not found in this game');
    }

    return this.aiService.generateActionSuggestions(
      scenario,
      state,
      player.role,
    );
  }

  // ===========================================================================
  // GET PREDEFINED ACTIONS
  // ===========================================================================

  async getPredefinedActions(gameId: string): Promise<string[]> {
    const state = await this.loadState(gameId);
    const scenario = this.scenariosService.getScenario(state.scenarioSlug);
    return scenario.actions || [];
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Load game state from cache or DB. Throws if not found.
   */
  private async loadState(gameId: string): Promise<GameState> {
    const state = await this.getGameState(gameId);
    if (!state) {
      throw new NotFoundException(
        `Game state for "${gameId}" not found. Has the game been initialized?`,
      );
    }
    return state;
  }

  /**
   * Save game state to both cache and DB.
   */
  private async saveState(state: GameState): Promise<void> {
    await this.cache.setGameState(state.gameId, state);
    await this.gamesService.saveGameState(state.gameId, state);
  }

  /**
   * Get the current round state object from the game state.
   */
  private getCurrentRound(state: GameState): RoundState {
    const round = state.rounds.find((r) => r.round === state.currentRound);
    if (!round) {
      // Create it if it doesn't exist (safety fallback)
      const newRound: RoundState = {
        round: state.currentRound,
        phase: state.currentPhase,
        narration: null,
        actions: [],
        votes: [],
        resolution: null,
        startedAt: new Date().toISOString(),
      };
      state.rounds.push(newRound);
      return newRound;
    }
    return round;
  }

  /**
   * Build a context string from the game state for AI prompts.
   */
  private buildGameContext(state: GameState): string {
    const lines: string[] = [];

    lines.push(`Partie: ${state.gameId}`);
    lines.push(`Scenario: ${state.scenarioSlug}`);
    lines.push(`Round: ${state.currentRound}/${state.maxRounds}`);
    lines.push(`Phase: ${state.currentPhase}`);
    lines.push('');

    // Global gauges
    lines.push('Jauges globales:');
    for (const [gaugeId, value] of Object.entries(state.globalGauges)) {
      lines.push(`  - ${gaugeId}: ${value}%`);
    }
    lines.push('');

    // Players
    lines.push('Joueurs:');
    for (const player of state.players) {
      const status = player.isAlive ? 'en vie' : 'elimine';
      const gaugesStr = Object.entries(player.gauges)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      lines.push(
        `  - ${player.username} (${player.role}, equipe ${player.team}) [${status}] Jauges: ${gaugesStr}`,
      );
    }

    // Recent round history (last 2 rounds)
    if (state.rounds.length > 0) {
      lines.push('');
      lines.push('Historique recent:');
      const recentRounds = state.rounds.slice(-3);
      for (const round of recentRounds) {
        lines.push(`  Round ${round.round}:`);
        if (round.narration) {
          lines.push(
            `    Narration: ${round.narration.substring(0, 200)}...`,
          );
        }
        if (round.actions.length > 0) {
          lines.push(
            `    Actions: ${round.actions.map((a) => `${a.userId}: ${a.action}`).join('; ')}`,
          );
        }
        if (round.resolution) {
          lines.push(
            `    Resolution: ${round.resolution.narrative.substring(0, 200)}...`,
          );
          if (round.resolution.eliminations.length > 0) {
            lines.push(
              `    Eliminations: ${round.resolution.eliminations.join(', ')}`,
            );
          }
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Tally votes and return sorted results (most votes first).
   */
  private tallyVotes(
    votes: RoundVote[],
  ): Array<{ userId: string; count: number }> {
    const tally = new Map<string, number>();

    for (const vote of votes) {
      tally.set(vote.targetId, (tally.get(vote.targetId) || 0) + 1);
    }

    return Array.from(tally.entries())
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Check win conditions based on scenario-specific rules.
   */
  private checkWinConditions(
    state: GameState,
    scenario: ScenarioPack,
  ): WinConditionResult {
    if (state.scenarioSlug === 'deep') {
      return this.checkDeepWinConditions(state);
    }

    if (state.scenarioSlug === 'tribunal') {
      return this.checkTribunalWinConditions(state);
    }

    // Generic fallback: game ends after max rounds
    if (state.currentRound >= state.maxRounds) {
      return {
        isOver: true,
        result: 'Partie terminee apres le dernier round',
        winners: state.players
          .filter((p) => p.isAlive)
          .map((p) => p.userId),
      };
    }

    return { isOver: false };
  }

  /**
   * DEEP scenario win conditions (cooperative):
   * - Defeat: any critical gauge (O2, Energie, Coque) reaches 0
   * - Victory: last round completed with all gauges > 0
   */
  private checkDeepWinConditions(state: GameState): WinConditionResult {
    const o2 = state.globalGauges.o2 ?? 0;
    const energie = state.globalGauges.energie ?? 0;
    const coque = state.globalGauges.coque ?? 0;
    const profondeur = state.globalGauges.profondeur ?? 0;
    const allPlayers = state.players.filter((p) => p.isAlive);

    // Defeat: any critical gauge reaches 0
    if (o2 <= 0) {
      return {
        isOver: true,
        result:
          "L'oxygene est epuise! L'equipage suffoque dans les profondeurs...",
        winners: [],
      };
    }
    if (energie <= 0) {
      return {
        isOver: true,
        result:
          "Plus d'energie! Le sous-marin est plonge dans le noir absolu...",
        winners: [],
      };
    }
    if (coque <= 0) {
      return {
        isOver: true,
        result:
          'La coque a cede! La pression ecrase le sous-marin...',
        winners: [],
      };
    }

    // Victory: last round with all gauges > 0
    if (state.currentRound >= state.maxRounds) {
      return {
        isOver: true,
        result: `Mission accomplie! Le sous-marin a atteint ${profondeur}m de profondeur. L'equipage survit!`,
        winners: allPlayers.map((p) => p.userId),
        winningTeam: 'equipage',
      };
    }

    return { isOver: false };
  }

  /**
   * TRIBUNAL scenario win conditions:
   * - Last round: count jury votes for verdict
   * - Defense wins if majority votes not-guilty
   * - Accusation wins if majority votes guilty
   */
  private checkTribunalWinConditions(state: GameState): WinConditionResult {
    // TRIBUNAL only ends after the last round
    if (state.currentRound < state.maxRounds) {
      return { isOver: false };
    }

    // Count the votes from the final round
    const currentRound = this.getCurrentRound(state);
    const votes = currentRound.votes;

    // In TRIBUNAL, votes target the "accuse" player.
    // A vote for the accuse = guilty, not voting for accuse = not-guilty
    const accuse = state.players.find(
      (p) => p.role === 'Accuse' || p.role === 'accuse',
    );

    if (!accuse) {
      // No accuse found, end game with neutral result
      return {
        isOver: true,
        result: 'Le proces est termine. Aucun verdict clair.',
        winners: state.players.map((p) => p.userId),
      };
    }

    // Count votes targeting the accuse (= guilty votes)
    const guiltyVotes = votes.filter(
      (v) => v.targetId === accuse.userId,
    ).length;
    const totalVotes = votes.length;
    const notGuiltyVotes = totalVotes - guiltyVotes;

    if (guiltyVotes > notGuiltyVotes) {
      // Accusation wins - accuse found guilty
      const accusationPlayers = state.players.filter(
        (p) => p.team === 'accusation',
      );
      return {
        isOver: true,
        result: `L'accuse est reconnu COUPABLE par ${guiltyVotes} voix contre ${notGuiltyVotes}!`,
        winners: accusationPlayers.map((p) => p.userId),
        winningTeam: 'accusation',
      };
    } else if (notGuiltyVotes > guiltyVotes) {
      // Defense wins - accuse acquitted
      const defensePlayers = state.players.filter(
        (p) => p.team === 'defense',
      );
      return {
        isOver: true,
        result: `L'accuse est ACQUITTE par ${notGuiltyVotes} voix contre ${guiltyVotes}!`,
        winners: defensePlayers.map((p) => p.userId),
        winningTeam: 'defense',
      };
    } else {
      // Tie - game ends with neutral result (defense wins by default in real law)
      const defensePlayers = state.players.filter(
        (p) => p.team === 'defense',
      );
      return {
        isOver: true,
        result: `Egalite des voix (${guiltyVotes}-${notGuiltyVotes})! En cas de doute, l'accuse beneficie de la presomption d'innocence. ACQUITTE!`,
        winners: defensePlayers.map((p) => p.userId),
        winningTeam: 'defense',
      };
    }
  }

  /**
   * Calculate scores for all players based on game outcome.
   */
  private calculateScores(
    state: GameState,
    winners: string[],
    winningTeam?: string,
  ): void {
    const winnerSet = new Set(winners);

    for (const player of state.players) {
      let score = 0;

      // Base score for participating
      score += 10;

      // Survival bonus
      if (player.isAlive) {
        score += 20;
      }

      // Winning team bonus
      if (winnerSet.has(player.userId)) {
        score += 50;
      } else if (winningTeam && player.team === winningTeam) {
        // Player was on winning team but not in winners list (e.g., eliminated)
        score += 25;
      }

      // Activity bonus: points for each action submitted
      const playerActions = state.rounds.reduce((count, round) => {
        return (
          count + round.actions.filter((a) => a.userId === player.userId).length
        );
      }, 0);
      score += playerActions * 5;

      // Voting participation bonus
      const playerVotes = state.rounds.reduce((count, round) => {
        return (
          count + round.votes.filter((v) => v.userId === player.userId).length
        );
      }, 0);
      score += playerVotes * 3;

      // Special role bonus for saboteur
      if (player.team === 'saboteur') {
        // Extra points for surviving as saboteur (harder role)
        if (player.isAlive) {
          score += 15;
        }
        // Bonus if saboteur team won
        if (winningTeam === 'saboteur') {
          score += 20;
        }
      }

      player.score = score;
    }
  }
}
