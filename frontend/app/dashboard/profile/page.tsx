"use client"

import { useState, useEffect } from "react"
import {
  Gamepad2,
  Trophy,
  Clock,
  Star,
  Calendar,
  Loader2,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatCard } from "@/components/stat-card"
import { useAuth } from "@/lib/auth"
import { api, type UserStats, type UserGameHistory } from "@/lib/api"

export default function ProfilePage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [history, setHistory] = useState<UserGameHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const perPage = 5

  useEffect(() => {
    Promise.all([
      api.users.stats().catch(() => null),
      api.users.history().catch(() => []),
    ]).then(([s, h]) => {
      setStats(s)
      setHistory(h)
      setLoading(false)
    })
  }, [])

  const totalPages = Math.ceil(history.length / perPage)
  const paginatedHistory = history.slice(page * perPage, (page + 1) * perPage)

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??"

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : ""

  const winRate = stats && stats.gamesPlayed > 0
    ? `${Math.round((stats.gamesWon / stats.gamesPlayed) * 100)}%`
    : "0%"

  const totalTime = stats
    ? stats.totalPlaytimeMin >= 60
      ? `${Math.floor(stats.totalPlaytimeMin / 60)}h ${stats.totalPlaytimeMin % 60}m`
      : `${stats.totalPlaytimeMin}m`
    : "0m"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const statsCards = [
    { icon: Gamepad2, label: "Parties jouees", value: stats?.gamesPlayed ?? 0 },
    { icon: Trophy, label: "Taux de victoire", value: winRate },
    { icon: Star, label: "Scenario prefere", value: stats?.favoriteScenario?.toUpperCase() ?? "—" },
    { icon: Clock, label: "Temps total joue", value: totalTime },
  ]

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 sm:flex-row sm:items-start sm:gap-6">
        <Avatar className="h-24 w-24">
          <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold font-display">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <h1 className="font-display text-2xl font-bold text-foreground">{user?.username ?? "—"}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Membre depuis {memberSince}
          </div>
          {stats && stats.gamesPlayed >= 10 && (
            <Badge variant="outline" className="border-gold/30 bg-amber-500/10 text-gold">
              Joueur Veterant
            </Badge>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="stats">
        <TabsList className="w-full bg-card border border-border">
          <TabsTrigger value="stats" className="flex-1">Statistiques</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">Historique</TabsTrigger>
        </TabsList>

        {/* Stats tab */}
        <TabsContent value="stats" className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {statsCards.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </div>
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="mt-6">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Gamepad2 className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground">Aucune partie jouee pour le moment.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Scenario</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Statut</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistory.map((h) => (
                      <tr key={h.gameId} className="border-b border-border/50 last:border-b-0 hover:bg-secondary/30">
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(h.createdAt).toLocaleDateString("fr-FR")}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {h.scenarioSlug.toUpperCase()}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{h.role ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={
                              h.status === "FINISHED"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                            }
                          >
                            {h.status === "FINISHED" ? "Terminee" : h.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{h.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Precedent
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
