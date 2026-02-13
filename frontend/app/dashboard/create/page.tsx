"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Copy, Check, Clock, Users, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { api } from "@/lib/api"

const scenarios = [
  {
    id: "tribunal",
    title: "TRIBUNAL",
    description: "Proces medieval — Jures, Avocats et Accuse. Qui dit la verite ?",
    image: "/images/scenario-tribunal.svg",
    players: "3-8",
    duration: "20 min",
    difficulty: "Normal",
  },
  {
    id: "deep",
    title: "DEEP",
    description: "Station sous-marine en peril — Survivez, mais mefiez-vous du saboteur.",
    image: "/images/scenario-deep.svg",
    players: "2-6",
    duration: "15-25 min",
    difficulty: "Difficile",
  },
]

const difficultyOptions = ["Facile", "Normal", "Difficile"]

export default function CreateGamePage() {
  const [step, setStep] = useState(1)
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)
  const [maxPlayers, setMaxPlayers] = useState([4])
  const [isPrivate, setIsPrivate] = useState(true)
  const [turnDuration, setTurnDuration] = useState("60")
  const [difficulty, setDifficulty] = useState("Normal")
  const [gameCode, setGameCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  const scenario = scenarios.find((s) => s.id === selectedScenario)

  const handleCreate = async () => {
    if (!selectedScenario) return
    setCreating(true)
    setError("")
    try {
      const game = await api.games.create({
        scenarioSlug: selectedScenario,
        maxPlayers: maxPlayers[0],
        turnTimeout: parseInt(turnDuration),
        isPrivate,
        difficulty: difficulty.toLowerCase(),
      })
      setGameCode(game.code)
      setStep(4)
    } catch (err: any) {
      setError(err.message || "Erreur lors de la creation")
    } finally {
      setCreating(false)
    }
  }

  const handleCopy = () => {
    if (gameCode) {
      navigator.clipboard.writeText(gameCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Retour</span>
          </Button>
        </Link>
        <h1 className="font-display text-2xl font-bold text-foreground">Nouvelle partie</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors",
                step >= s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {s}
            </div>
            {s < 3 && (
              <div
                className={cn(
                  "h-0.5 w-8 rounded-full transition-colors sm:w-16",
                  step > s ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Step 1 - Scenario selection */}
      {step === 1 && (
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-bold text-foreground">Choisissez un scenario</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedScenario(s.id)}
                className={cn(
                  "group relative overflow-hidden rounded-xl border text-left transition-all",
                  selectedScenario === s.id
                    ? "border-primary glow-violet"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={s.image || "/placeholder.svg"}
                    alt={`Scenario ${s.title}`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                  {selectedScenario === s.id && (
                    <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-display text-lg font-bold text-foreground">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {s.players}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {s.duration}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
          <Button
            onClick={() => setStep(2)}
            disabled={!selectedScenario}
            className="self-end glow-violet-sm"
          >
            Suivant
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 2 - Parameters */}
      {step === 2 && (
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-bold text-foreground">Parametres de la partie</h2>
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-6">
            {/* Max players */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Nombre max de joueurs</label>
                <span className="font-display text-lg font-bold text-primary">{maxPlayers[0]}</span>
              </div>
              <Slider
                value={maxPlayers}
                onValueChange={setMaxPlayers}
                min={2}
                max={8}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>2</span>
                <span>8</span>
              </div>
            </div>

            {/* Private toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-foreground">Partie privee</label>
                <p className="text-xs text-muted-foreground">Seuls les joueurs avec le code peuvent rejoindre</p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>

            {/* Turn duration */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Duree max d{"'"}un tour</label>
              <Select value={turnDuration} onValueChange={setTurnDuration}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 secondes</SelectItem>
                  <SelectItem value="60">60 secondes</SelectItem>
                  <SelectItem value="90">90 secondes</SelectItem>
                  <SelectItem value="120">120 secondes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* AI difficulty */}
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium text-foreground">Difficulte de l{"'"}IA MJ</label>
              <div className="flex gap-2">
                {difficultyOptions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={cn(
                      "flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                      difficulty === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
            <Button onClick={() => setStep(3)} className="glow-violet-sm">
              Suivant
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 - Recap */}
      {step === 3 && scenario && (
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-lg font-bold text-foreground">Recapitulatif</h2>
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-24 overflow-hidden rounded-lg">
                <Image src={scenario.image || "/placeholder.svg"} alt={scenario.title} fill className="object-cover" />
              </div>
              <div>
                <h3 className="font-display text-lg font-bold text-foreground">{scenario.title}</h3>
                <p className="text-sm text-muted-foreground">{scenario.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-secondary/30 p-4 text-sm">
              <div>
                <span className="text-muted-foreground">Joueurs max:</span>
                <span className="ml-2 font-medium text-foreground">{maxPlayers[0]}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>
                <span className="ml-2 font-medium text-foreground">{isPrivate ? "Privee" : "Publique"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tour:</span>
                <span className="ml-2 font-medium text-foreground">{turnDuration}s</span>
              </div>
              <div>
                <span className="text-muted-foreground">Difficulte:</span>
                <span className="ml-2 font-medium text-foreground">{difficulty}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="glow-violet px-8 font-semibold">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Creer la partie
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 - Game created */}
      {step === 4 && gameCode && (
        <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-card p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <Check className="h-8 w-8" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">Partie creee !</h2>
          <p className="text-muted-foreground">Partagez ce code avec vos amis pour les inviter.</p>
          <div className="flex items-center gap-3 rounded-xl bg-secondary/50 px-8 py-4">
            <span className="font-display text-3xl font-bold tracking-[0.3em] text-foreground">
              {gameCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="Copier le code"
            >
              {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
            </button>
          </div>
          <div className="flex gap-3">
            <Link href={`/lobby/${gameCode}`}>
              <Button className="glow-violet-sm">Aller au lobby</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline">Retour au dashboard</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
