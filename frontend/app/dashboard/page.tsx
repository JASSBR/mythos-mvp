"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  Gamepad2,
  Trophy,
  Clock,
  Plus,
  ArrowRight,
  Users,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/stat-card"
import { ScenarioCard } from "@/components/scenario-card"
import { useAuth } from "@/lib/auth"
import { api, type Game } from "@/lib/api"

export default function DashboardPage() {
  const { user } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [joinCode, setJoinCode] = useState("")
  const [joinError, setJoinError] = useState("")
  const [loadingGames, setLoadingGames] = useState(true)

  useEffect(() => {
    api.games
      .my()
      .then(setGames)
      .catch(() => {})
      .finally(() => setLoadingGames(false))
  }, [])

  const handleJoin = async () => {
    if (!joinCode.trim()) return
    setJoinError("")
    try {
      const game = await api.games.join(joinCode.trim())
      window.location.href = `/lobby/${game.code}`
    } catch (err: any) {
      setJoinError(err.message || "Code invalide")
    }
  }

  const activeGames = games.filter((g) => g.status === "LOBBY" || g.status === "IN_PROGRESS")

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-8">
      {/* Welcome */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Bienvenue {user?.username || "..."}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Pret pour une nouvelle aventure ?
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Gamepad2} label="Parties jouees" value={games.length} />
        <StatCard icon={Trophy} label="Parties actives" value={activeGames.length} />
        <StatCard icon={Clock} label="Compte cree" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString("fr-FR") : "-"} />
      </div>

      {/* Join game */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-foreground">
          Rejoindre une partie
        </h2>
        <div className="flex gap-3">
          <Input
            placeholder="Entrez le code du salon..."
            className="max-w-sm bg-secondary/50 border-border/50"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          />
          <Button className="glow-violet-sm" onClick={handleJoin}>Rejoindre</Button>
        </div>
        {joinError && (
          <p className="mt-2 text-sm text-red-400">{joinError}</p>
        )}
      </div>

      {/* Active games */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-foreground">
            Mes parties
          </h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {loadingGames && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement...
            </div>
          )}

          {!loadingGames && activeGames.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune partie en cours. Creez-en une !</p>
          )}

          {activeGames.map((game) => (
            <div
              key={game.id}
              className="min-w-[280px] rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-base font-bold text-foreground">
                  {game.scenarioSlug.toUpperCase()}
                </span>
                <Badge
                  variant="outline"
                  className={
                    game.status === "IN_PROGRESS"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  }
                >
                  {game.status === "LOBBY" ? "En attente" : "En cours"}
                </Badge>
              </div>
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {game.players?.length || 0}/{game.maxPlayers} joueurs
                <span className="text-xs">| Code: {game.code}</span>
              </div>
              <Link href={`/lobby/${game.code}`}>
                <Button size="sm" className="w-full" variant="secondary">
                  Rejoindre
                </Button>
              </Link>
            </div>
          ))}

          {/* Create game CTA */}
          <Link href="/dashboard/create" className="min-w-[280px]">
            <div className="flex h-full items-center justify-center rounded-xl border-2 border-dashed border-border p-5 transition-colors hover:border-primary/40">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Plus className="h-6 w-6" />
                </div>
                <span className="text-sm font-medium">Nouvelle partie</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Scenarios */}
      <div>
        <h2 className="mb-4 font-display text-lg font-bold text-foreground">
          Scenarios
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <ScenarioCard
            title="TRIBUNAL"
            description="Proces medieval — Jures, Avocats et Accuse."
            image="/images/scenario-tribunal.svg"
            duration="20 min"
            players="3-8 joueurs"
            difficulty="Normal"
            href="/scenarios/tribunal"
          />
          <ScenarioCard
            title="DEEP"
            description="Station sous-marine en peril — Survivez."
            image="/images/scenario-deep.svg"
            duration="15-25 min"
            players="2-6 joueurs"
            difficulty="Difficile"
            href="/scenarios/deep"
          />
        </div>
      </div>
    </div>
  )
}
