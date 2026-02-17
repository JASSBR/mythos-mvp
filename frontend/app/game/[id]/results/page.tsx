"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { Trophy, Clock, Gamepad2, Share2, Star, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatCard } from "@/components/stat-card"
import { api, type GameDetail } from "@/lib/api"

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [game, setGame] = useState<GameDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api.games.get(id)
      .then(setGame)
      .catch(() => setError("Partie introuvable"))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error || "Partie introuvable"}</p>
        <Link href="/dashboard">
          <Button variant="outline">Retour au dashboard</Button>
        </Link>
      </div>
    )
  }

  // Sort players by score descending
  const ranking = [...game.players].sort((a, b) => b.score - a.score)
  const mvp = ranking[0]
  const scenarioName = game.scenario?.name ?? game.scenarioSlug.toUpperCase()

  // Find narrative epilogue from last events
  const narrativeEvents = game.events.filter(e => e.narrative)
  const epilogue = narrativeEvents.length > 0
    ? narrativeEvents[narrativeEvents.length - 1].narrative
    : null

  // Calculate duration
  let durationStr = "—"
  if (game.startedAt && game.finishedAt) {
    const start = new Date(game.startedAt).getTime()
    const end = new Date(game.finishedAt).getTime()
    const mins = Math.round((end - start) / 60000)
    durationStr = `${mins} min`
  }

  const totalEvents = game.events.length

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-3xl flex flex-col items-center gap-8">
        {/* Title */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10 text-gold">
            <Trophy className="h-10 w-10" />
          </div>
          <h1 className="font-display text-5xl font-bold sm:text-6xl text-gold">
            PARTIE TERMINEE
          </h1>
          <p className="text-muted-foreground">
            Scenario {scenarioName}
            {game.scenario?.description ? ` — ${game.scenario.description}` : ""}
          </p>
        </div>

        {/* Epilogue */}
        {epilogue && (
          <div className="w-full rounded-xl border border-border bg-card p-6">
            <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-gold">
              <Star className="h-4 w-4" />
              Epilogue
            </h2>
            {epilogue.split("\n\n").map((p, i) => (
              <p key={i} className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0">
                {p}
              </p>
            ))}
          </div>
        )}

        {/* Rankings */}
        <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-lg font-bold text-foreground">Classement</h2>
          </div>
          <div className="divide-y divide-border">
            {ranking.map((player, i) => {
              const isMVP = mvp && player.id === mvp.id
              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-4 px-6 py-4 ${
                    isMVP ? "bg-amber-500/5" : ""
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      i === 0
                        ? "bg-gold text-background"
                        : i === 1
                          ? "bg-muted-foreground/30 text-foreground"
                          : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback
                      className={`text-xs font-bold ${
                        !player.isAlive
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/20 text-primary"
                      }`}
                    >
                      {player.user.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{player.user.username}</span>
                      {isMVP && (
                        <Badge className="bg-gold/20 text-gold border-gold/30 text-[10px]">
                          MVP
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{player.role ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="outline"
                      className={
                        player.isAlive
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                      }
                    >
                      {player.isAlive ? "Vivant" : "Elimine"}
                    </Badge>
                    <span className="font-display text-lg font-bold text-foreground">{player.score}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Stats */}
        <div className="grid w-full gap-4 sm:grid-cols-3">
          <StatCard icon={Clock} label="Duree totale" value={durationStr} />
          <StatCard icon={Gamepad2} label="Rounds" value={game.currentRound} />
          <StatCard icon={Trophy} label="Evenements" value={totalEvents} />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/dashboard/create">
            <Button className="glow-violet-sm">Nouvelle partie</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" className="text-foreground bg-transparent">Retour au dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
