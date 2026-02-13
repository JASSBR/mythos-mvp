"use client"

import { useState, useEffect, use } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Clock, Users, Zap, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { api, type ScenarioFull } from "@/lib/api"

export default function ScenarioPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [scenario, setScenario] = useState<ScenarioFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    api.scenarios.get(slug)
      .then(setScenario)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !scenario) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Scenario introuvable.</p>
      </div>
    )
  }

  const diffLower = scenario.difficulty.toLowerCase()
  const diffLabel = diffLower === "hard" || diffLower === "difficile"
    ? "Difficile"
    : diffLower === "easy" || diffLower === "facile"
      ? "Facile"
      : "Normal"

  const diffColor = diffLabel === "Difficile"
    ? "border-red-500/30 bg-red-500/10 text-red-400"
    : diffLabel === "Facile"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : "border-amber-500/30 bg-amber-500/10 text-amber-400"

  return (
    <div className="min-h-screen">
      {/* Hero header */}
      <div className="relative h-72 sm:h-96">
        <Image
          src={`/images/scenario-${scenario.slug}.svg`}
          alt={`Illustration du scenario ${scenario.name}`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
        <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
          <div className="mx-auto max-w-4xl">
            <Link href="/scenarios">
              <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour
              </Button>
            </Link>
            <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              {scenario.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge variant="outline" className={diffColor}>
                {diffLabel}
              </Badge>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {scenario.duration}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> {scenario.minPlayers}-{scenario.maxPlayers} joueurs
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl flex flex-col gap-10 px-6 py-10 sm:px-8">
        {/* Lore */}
        <div>
          <h2 className="mb-4 font-display text-xl font-bold text-foreground">{"L'histoire"}</h2>
          <p className="text-muted-foreground leading-relaxed">{scenario.lore}</p>
        </div>

        {/* Roles */}
        <div>
          <h2 className="mb-4 font-display text-xl font-bold text-foreground">Roles possibles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scenario.roles.map((role) => (
              <div
                key={role.id}
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-base font-bold text-foreground">{role.name}</h3>
                </div>
                <p className="mb-2 text-sm text-muted-foreground">{role.description}</p>
                <p className="text-xs text-primary">Objectif: {role.objective}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Phases */}
        <div>
          <h2 className="mb-4 font-display text-xl font-bold text-foreground">Deroulement type</h2>
          <div className="flex flex-col gap-4">
            {scenario.phases.map((phase, i) => (
              <div key={phase.id} className="flex items-center gap-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </div>
                <div className="h-px flex-1 bg-border" />
                <span className="text-sm font-medium text-foreground">{phase.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <Link href="/dashboard/create">
            <Button size="lg" className="glow-violet px-8 font-semibold">
              Jouer ce scenario
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
