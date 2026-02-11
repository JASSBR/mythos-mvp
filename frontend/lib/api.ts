const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: Record<string, unknown>) {
    super(message)
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.message || res.statusText, body)
  }

  if (res.status === 204) return {} as T
  return res.json()
}

export const api = {
  auth: {
    register(data: { email: string; username: string; password: string }) {
      return request<{ access_token: string; user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      })
    },
    login(data: { email: string; password: string }) {
      return request<{ access_token: string; user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      })
    },
  },
  users: {
    me() {
      return request<User & { stats: UserStats | null }>("/users/me")
    },
    updateProfile(data: { username?: string; avatar?: string | null }) {
      return request<User>("/users/me", { method: "PATCH", body: JSON.stringify(data) })
    },
    stats() {
      return request<UserStats>("/users/me/stats")
    },
    history() {
      return request<UserGameHistory[]>("/users/me/history")
    },
    leaderboard(limit = 10) {
      return request<LeaderboardEntry[]>(`/users/leaderboard?limit=${limit}`)
    },
  },
  games: {
    create(data: { scenarioSlug: string; maxPlayers?: number; turnTimeout?: number; isPrivate?: boolean; difficulty?: string }) {
      return request<Game>("/games", { method: "POST", body: JSON.stringify(data) })
    },
    join(code: string) {
      return request<Game>("/games/join", { method: "POST", body: JSON.stringify({ code }) })
    },
    list() {
      return request<Game[]>("/games")
    },
    my() {
      return request<Game[]>("/games/my")
    },
    get(id: string) {
      return request<GameDetail>(`/games/${id}`)
    },
    getByCode(code: string) {
      return request<GameDetail>(`/games/code/${code}`)
    },
    leave(id: string) {
      return request<unknown>(`/games/${id}/leave`, { method: "POST" })
    },
    events(id: string) {
      return request<GameEvent[]>(`/games/${id}/events`)
    },
  },
  scenarios: {
    list() {
      return request<ScenarioMeta[]>("/scenarios")
    },
    get(slug: string) {
      return request<ScenarioFull>(`/scenarios/${slug}`)
    },
  },
  notifications: {
    list() {
      return request<NotificationsResponse>("/notifications")
    },
    markRead(id: string) {
      return request<{ success: boolean }>(`/notifications/${id}/read`, { method: "PATCH" })
    },
    markAllRead() {
      return request<{ success: boolean }>("/notifications/read-all", { method: "PATCH" })
    },
    delete(id: string) {
      return request<{ success: boolean }>(`/notifications/${id}`, { method: "DELETE" })
    },
    deleteAll() {
      return request<{ success: boolean }>("/notifications", { method: "DELETE" })
    },
  },
  admin: {
    stats() {
      return request<AdminStats>("/admin/stats")
    },
    users() {
      return request<AdminUser[]>("/admin/users")
    },
    games() {
      return request<AdminGame[]>("/admin/games")
    },
    banUser(id: string, duration = 24) {
      return request<{ success: boolean; bannedUntil: string | null }>(`/admin/users/${id}/ban`, {
        method: "PATCH",
        body: JSON.stringify({ duration }),
      })
    },
  },
}

// Types
export interface User {
  id: string
  email: string
  username: string
  avatar: string | null
  role: "ADMIN" | "PLAYER"
  createdAt: string
  updatedAt: string
}

export interface UserStats {
  gamesPlayed: number
  gamesWon: number
  totalPlaytimeMin: number
  favoriteScenario: string | null
}

export interface UserGameHistory {
  gameId: string
  scenarioSlug: string
  status: string
  role: string | null
  isAlive: boolean
  score: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface LeaderboardEntry {
  userId: string
  username: string
  avatar: string | null
  gamesPlayed: number
  gamesWon: number
  totalPlaytimeMin: number
  favoriteScenario: string | null
}

export interface Game {
  id: string
  code: string
  scenarioSlug: string
  status: string
  currentPhase: string
  currentRound: number
  maxPlayers: number
  maxRounds: number
  turnTimeout: number
  isPrivate: boolean
  hostId: string
  players: GamePlayer[]
  createdAt: string
}

export interface GameDetail extends Game {
  events: GameEvent[]
  scenario: {
    name: string
    description: string
    minPlayers: number
    maxPlayers: number
    duration: string
    difficulty: string
  } | null
  startedAt: string | null
  finishedAt: string | null
}

export interface GamePlayer {
  id: string
  userId: string
  role: string | null
  isAlive: boolean
  isHost: boolean
  score: number
  user: { id: string; username: string; avatar: string | null }
}

export interface GameEvent {
  id: string
  gameId: string
  round: number
  phase: string
  type: string
  actorId: string | null
  data: unknown
  narrative: string | null
  createdAt: string
}

export interface ScenarioMeta {
  slug: string
  name: string
  description: string
  minPlayers: number
  maxPlayers: number
  duration: string
  difficulty: string
  roles: { id: string; name: string; team: string }[]
}

export interface ScenarioFull extends ScenarioMeta {
  lore: string
  phases: { id: string; name: string; description: string }[]
  roles: { id: string; name: string; team: string; description: string; objective: string; required: boolean; unique: boolean }[]
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  data: any
  isRead: boolean
  createdAt: string
}

export interface NotificationsResponse {
  notifications: NotificationItem[]
  unreadCount: number
}

export interface AdminStats {
  totalUsers: number
  totalGames: number
  activeGames: number
  finishedToday: number
}

export interface AdminUser {
  id: string
  username: string
  email: string
  role: string
  bannedUntil: string | null
  createdAt: string
  gamesPlayed: number
}

export interface AdminGame {
  id: string
  code: string
  scenarioSlug: string
  status: string
  playerCount: number
  maxPlayers: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
