/**
 * Engine types for game state management.
 * Used across the engine, cache, and websocket modules.
 */

export interface PlayerState {
  userId: string;
  username: string;
  role: string;
  team: string;
  isAlive: boolean;
  isConnected: boolean;
  gauges: Record<string, number>;
  score: number;
}

export interface RoundAction {
  userId: string;
  action: string;
  submittedAt: string;
}

export interface RoundVote {
  userId: string;
  targetId: string;
  submittedAt: string;
}

export interface RoundState {
  round: number;
  phase: GamePhaseType;
  narration: string | null;
  actions: RoundAction[];
  votes: RoundVote[];
  resolution: RoundResolution | null;
  startedAt: string;
}

export interface RoundResolution {
  narrative: string;
  eliminations: string[];
  gaugeChanges: Record<string, Record<string, number>>;
}

export type GamePhaseType =
  | 'WAITING'
  | 'NARRATION'
  | 'ACTION'
  | 'DISCUSSION'
  | 'VOTE'
  | 'RESOLUTION';

export type GameStatusType =
  | 'LOBBY'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'FINISHED'
  | 'CANCELLED';

export interface GameState {
  gameId: string;
  scenarioSlug: string;
  status: GameStatusType;
  currentPhase: GamePhaseType;
  currentRound: number;
  maxRounds: number;
  players: PlayerState[];
  globalGauges: Record<string, number>;
  rounds: RoundState[];
  hostId: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface GameResult {
  result: string;
  epilogue: string;
  winners: string[];
  scores: Array<{
    userId: string;
    username: string;
    score: number;
    role: string;
    team: string;
  }>;
}

export interface NarrationResult {
  text: string;
  phase: GamePhaseType;
  round: number;
}

export interface WinConditionResult {
  isOver: boolean;
  result?: string;
  winners?: string[];
  winningTeam?: string;
}

export interface ResolveRoundResult {
  narrative: string;
  eliminations: string[];
  gaugeChanges: Record<string, Record<string, number>>;
  isGameOver: boolean;
  gameResult?: GameResult;
}
