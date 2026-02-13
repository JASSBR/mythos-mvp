"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import {
  Gamepad2,
  Users,
  Clock,
  Play,
  Trophy,
  XCircle,
  Loader2,
  Filter,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth"
import { api, type Game, type UserGameHistory } from "@/lib/api"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Play }> = {
  LOBBY: { label: "En attente", variant: "outline", icon: Clock },
  IN_PROGRESS: { label: "En cours", variant: "default", icon: Play },
  FINISHED: { label: "Terminee", variant: "secondary", icon: Trophy },
  CANCELLED: { label: "Annulee", variant: "destructive", icon: XCircle },
}

const scenarioNames: Record<string, string> = {
  tribunal: "Le Tribunal",
  deep: "D.E.E.P.",
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-"
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function GamesPage() {
  const { user } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [history, setHistory] = useState<UserGameHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  useEffect(() => {
    Promise.all([
      api.games.my().catch(() => []),
      api.users.history().catch(() => []),
    ]).then(([g, h]) => {
      setGames(g)
      setHistory(h)
      setLoading(false)
    })
  }, [])

  const activeGames = games.filter(
    (g) => g.status === "LOBBY" || g.status === "IN_PROGRESS"
  )
  const finishedGames = history.filter((h) => h.status === "FINISHED")
  const wonGames = finishedGames.filter((h) => h.score > 0)

  const filteredGames = games.filter((g) => {
    if (filter === "all") return true
    if (filter === "active") return g.status === "LOBBY" || g.status === "IN_PROGRESS"
    if (filter === "finished") return g.status === "FINISHED"
    return true
  })

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Mes parties</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {games.length} partie{games.length !== 1 ? "s" : ""} au total
          </p>
        </div>
        <Link href="/dashboard/create">
          <Button className="glow-violet-sm">
            <Gamepad2 className="mr-2 h-4 w-4" />
            Nouvelle partie
          </Button>
        </Link>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Gamepad2 className="h-4 w-4" />
            <span className="text-xs">Total</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{games.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Play className="h-4 w-4" />
            <span className="text-xs">Actives</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-primary">{activeGames.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Trophy className="h-4 w-4" />
            <span className="text-xs">Victoires</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-green-400">{wonGames.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-xs">Terminees</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{finishedGames.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">
            En cours ({activeGames.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            Toutes ({games.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            Historique ({finishedGames.length})
          </TabsTrigger>
        </TabsList>

        {/* Active games */}
        <TabsContent value="active" className="mt-4">
          {activeGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
              <Gamepad2 className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Aucune partie en cours</p>
              <Link href="/dashboard/create">
                <Button variant="outline" size="sm">
                  Creer une partie
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeGames.map((game) => (
                <GameCard key={game.id} game={game} userId={user?.id} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* All games */}
        <TabsContent value="all" className="mt-4">
          {games.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
              <Gamepad2 className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Aucune partie</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => (
                <GameCard key={game.id} game={game} userId={user?.id} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          {finishedGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border py-16">
              <Trophy className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Aucune partie terminee</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {finishedGames.map((h) => (
                <HistoryRow key={h.gameId} entry={h} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function GameCard({ game, userId }: { game: Game; userId?: string }) {
  const config = statusConfig[game.status] || statusConfig.LOBBY
  const StatusIcon = config.icon
  const isHost = game.hostId === userId
  const playerCount = game.players?.length ?? 0
  const scenarioName = scenarioNames[game.scenarioSlug] || game.scenarioSlug

  const href =
    game.status === "LOBBY"
      ? `/lobby/${game.code}`
      : game.status === "IN_PROGRESS"
        ? `/game/${game.id}`
        : `/game/${game.id}/results`

  return (
    <Link href={href}>
      <div className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-display font-semibold">{scenarioName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Code: {game.code}
            </p>
          </div>
          <Badge variant={config.variant} className="text-xs">
            <StatusIcon className="mr-1 h-3 w-3" />
            {config.label}
          </Badge>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {playerCount}/{game.maxPlayers}
          </span>
          <span className="flex items-center gap-1">
            <Gamepad2 className="h-3.5 w-3.5" />
            Round {game.currentRound}/{game.maxRounds}
          </span>
          {isHost && (
            <Badge variant="outline" className="text-xs">
              Host
            </Badge>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {formatDate(game.createdAt)}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
        </div>
      </div>
    </Link>
  )
}

function HistoryRow({ entry }: { entry: UserGameHistory }) {
  const scenarioName = scenarioNames[entry.scenarioSlug] || entry.scenarioSlug
  const isWin = entry.score > 0

  return (
    <Link href={`/game/${entry.gameId}/results`}>
      <div className="group flex items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 transition-all hover:border-primary/50">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            isWin
              ? "bg-green-500/10 text-green-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          <Trophy className="h-5 w-5" />
        </div>

        <div className="flex-1">
          <p className="font-medium">{scenarioName}</p>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            {entry.role && <span>Role: {entry.role}</span>}
            <span>{entry.isAlive ? "Survivant" : "Elimine"}</span>
            <span>{formatDate(entry.finishedAt)}</span>
          </div>
        </div>

        <div className="text-right">
          <p className={`text-lg font-bold ${isWin ? "text-green-400" : "text-muted-foreground"}`}>
            {entry.score} pts
          </p>
          <Badge variant={isWin ? "default" : "secondary"} className="text-xs">
            {isWin ? "Victoire" : "Defaite"}
          </Badge>
        </div>

        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </div>
    </Link>
  )
}
