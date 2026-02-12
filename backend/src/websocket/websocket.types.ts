/**
 * Socket.io event type definitions for the MYTHOS game.
 * These types ensure type safety for all real-time communication
 * between the client and server.
 */

// ---------------------------------------------------------------------------
// Client -> Server events
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  'game:join': (data: { gameId: string; token: string }) => void;
  'game:leave': (data: { gameId: string }) => void;
  'game:start': (data: { gameId: string }) => void;
  'game:action': (data: { gameId: string; action: string }) => void;
  'game:vote': (data: { gameId: string; targetId: string }) => void;
  'game:chat': (data: { gameId: string; message: string }) => void;
  'game:whisper': (data: { gameId: string; recipientId: string; message: string }) => void;
  'lobby:join': (data: { code: string; token: string }) => void;
  'lobby:leave': (data: { code: string }) => void;
  'lobby:kick': (data: { code: string; targetUserId: string }) => void;
  'lobby:chat': (data: { code: string; message: string }) => void;
}

// ---------------------------------------------------------------------------
// Server -> Client events
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  'game:state': (state: any) => void;
  'game:phase': (data: { phase: string; round: number }) => void;
  'game:narration': (data: { text: string; isStreaming: boolean }) => void;
  'game:narration:chunk': (data: { chunk: string }) => void;
  'game:narration:end': () => void;
  'game:action:received': (data: {
    userId: string;
    remaining: number;
  }) => void;
  'game:vote:received': (data: {
    userId: string;
    remaining: number;
  }) => void;
  'game:resolution': (data: {
    narrative: string;
    eliminations: string[];
    gaugeChanges: any;
  }) => void;
  'game:over': (data: {
    result: string;
    epilogue: string;
    scores: any[];
  }) => void;
  'game:player:joined': (data: {
    userId: string;
    username: string;
  }) => void;
  'game:player:left': (data: { userId: string }) => void;
  'game:player:disconnected': (data: { userId: string }) => void;
  'game:player:reconnected': (data: { userId: string }) => void;
  'game:chat:message': (data: {
    userId: string;
    username: string;
    message: string;
    timestamp: string;
  }) => void;
  'game:action:suggestions': (data: {
    predefined: string[];
    aiSuggestions: string[];
    loading: boolean;
  }) => void;
  'game:timer': (data: { seconds: number }) => void;
  'game:timer:sync': (data: { seconds: number; phase: string }) => void;
  'game:whisper:message': (data: {
    userId: string;
    username: string;
    recipientId: string;
    message: string;
    timestamp: string;
    isWhisper: boolean;
  }) => void;
  'game:narration:complete': (data: { text: string }) => void;
  'game:error': (data: { message: string }) => void;
  'notification:new': (data: {
    id: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    createdAt: string;
  }) => void;
  'game:private-info': (data: {
    role: string;
    team: string;
    description: string;
    objectives: string;
  }) => void;
  'lobby:player:kicked': (data: { userId: string }) => void;
  'lobby:update': (data: {
    players: any[];
    playerCount: number;
    maxPlayers: number;
  }) => void;
  'lobby:chat:message': (data: {
    userId: string;
    username: string;
    message: string;
    timestamp: string;
  }) => void;
  'lobby:started': (data: { gameId: string }) => void;
}

// ---------------------------------------------------------------------------
// Authenticated socket data (attached after token verification)
// ---------------------------------------------------------------------------

export interface SocketUserData {
  userId: string;
  username: string;
}

export interface AuthenticatedSocket {
  id: string;
  data: {
    user?: SocketUserData;
  };
  rooms: Set<string>;
  join: (room: string) => void;
  leave: (room: string) => void;
  emit: (event: string, ...args: any[]) => boolean;
  disconnect: (close?: boolean) => void;
  handshake: {
    auth: Record<string, any>;
    query: Record<string, any>;
  };
}
