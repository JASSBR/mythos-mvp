"use client"

import { useState, useEffect } from "react"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScenarioCard } from "@/components/scenario-card"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { cn } from "@/lib/utils"
import { api, type ScenarioMeta } from "@/lib/api"

const filters = [
  { label: "Tous", value: "all" },
  { label: "2-4 joueurs", value: "small" },
  { label: "5-8 joueurs", value: "large" },
  { label: "Facile", value: "facile" },
  { label: "Normal", value: "normal" },
  { label: "Difficile", value: "difficile" },
] as const

function mapDifficulty(d: string): "Facile" | "Normal" | "Difficile" {
  const lower = d.toLowerCase()
  if (lower === "facile" || lower === "easy") return "Facile"
  if (lower === "difficile" || lower === "hard") return "Difficile"
  return "Normal"
}

export default function ScenariosPage() {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")

  useEffect(() => {
    api.scenarios.list()
      .then(setScenarios)
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = scenarios.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())

    if (activeFilter === "all") return matchesSearch
    if (activeFilter === "small") return matchesSearch && s.maxPlayers <= 4
    if (activeFilter === "large") return matchesSearch && s.maxPlayers >= 5
    const diff = mapDifficulty(s.difficulty).toLowerCase()
    return matchesSearch && diff === activeFilter
  })

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-28">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground">
            Scenarios disponibles
          </h1>
          <p className="mt-2 text-muted-foreground">
            Explorez nos scenarios et lancez une partie avec vos amis.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un scenario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50"
          />
        </div>

        {/* Filter badges */}
        <div className="mb-8 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setActiveFilter(f.value)}
            >
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer px-3 py-1.5 text-sm transition-colors",
                  activeFilter === f.value
                    ? "border-primary/30 bg-primary/20 text-primary"
                    : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/20 hover:text-foreground"
                )}
              >
                {f.label}
              </Badge>
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <ScenarioCard
                key={s.slug}
                title={s.name}
                description={s.description}
                image={`/images/scenario-${s.slug}.svg`}
                duration={s.duration}
                players={`${s.minPlayers}-${s.maxPlayers} joueurs`}
                difficulty={mapDifficulty(s.difficulty)}
                href={`/scenarios/${s.slug}`}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              Aucun scenario ne correspond a votre recherche.
            </p>
          </div>
        )}

        {/* Coming soon */}
        <p className="mt-12 text-center text-sm italic text-muted-foreground">
          {"D'autres scenarios arrivent bientot..."}
        </p>
      </main>
      <Footer />
    </>
  )
}
