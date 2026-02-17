"use client"

import { useState, useEffect, useRef, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import { Bot, Send, ChevronDown, ChevronUp, MessageSquare, Loader2, Play, Trophy, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { GamePhaseBar, type GamePhase } from "@/components/game/phase-bar"
import { GameTimer } from "@/components/game/game-timer"
import { PlayerCard } from "@/components/player-card"
import { useAuth } from "@/lib/auth"
import { api, type GameDetail, type GamePlayer } from "@/lib/api"
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket"
import { NarrativeRenderer } from "@/components/game/narrative-renderer"

function phaseToGamePhase(phase: string): GamePhase {
  const lower = phase.toLowerCase()
  if (lower.includes("narration") || lower.includes("briefing")) return "narration"
  if (lower.includes("action") || lower.includes("exploration") || lower.includes("reparation")) return "action"
  if (lower.includes("discussion")) return "discussion"
  if (lower.includes("vote") || lower.includes("deliberation") || lower.includes("suspicion")) return "vote"
  return "resolution"
}

interface ChatMessage {
  userId: string
  username: string
  message: string
  timestamp: string
}

interface GameOverData {
  result: string
  epilogue: string
  scores: Array<{ userId: string; username: string; score: number; role: string; team: string }>
}

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user, token } = useAuth()
  const router = useRouter()

  const [game, setGame] = useState<GameDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Phase & round state (driven by WebSocket)
  const [phase, setPhase] = useState<string>("NARRATION")
  const [round, setRound] = useState(1)

  // Narration
  const [narrationText, setNarrationText] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)

  // Actions
  const [customAction, setCustomAction] = useState("")
  const [actionSubmitted, setActionSubmitted] = useState(false)
  const [actionRemaining, setActionRemaining] = useState<number | null>(null)

  // Action suggestions
  const [predefinedActions, setPredefinedActions] = useState<string[]>([])
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // Votes
  const [selectedVote, setSelectedVote] = useState<string | null>(null)
  const [voteSubmitted, setVoteSubmitted] = useState(false)
  const [voteRemaining, setVoteRemaining] = useState<number | null>(null)

  // Resolution
  const [resolutionNarrative, setResolutionNarrative] = useState("")
  const [resolutionEliminations, setResolutionEliminations] = useState<string[]>([])
  const [resolutionGaugeChanges, setResolutionGaugeChanges] = useState<Record<string, Record<string, number>>>({})

  // Global gauges (synced from game:state)
  const [globalGauges, setGlobalGauges] = useState<Record<string, number>>({})

  // Game over
  const [gameOver, setGameOver] = useState<GameOverData | null>(null)

  // Chat
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessage, setChatMessage] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [whisperTarget, setWhisperTarget] = useState<{ id: string; username: string } | null>(null)
  const [serverTimerSeconds, setServerTimerSeconds] = useState<number | undefined>(undefined)

  // Waiting message
  const [waitingMessage, setWaitingMessage] = useState("")

  // Players (kept in sync via game:state and game data)
  const [players, setPlayers] = useState<GamePlayer[]>([])

  // Initial REST fetch
  useEffect(() => {
    api.games.get(id)
      .then((g) => {
        setGame(g)
        setPlayers(g.players)
        setPhase(g.currentPhase)
        setRound(g.currentRound)
        if (g.status === "FINISHED") {
          setGameOver({
            result: (g as any).stateSnapshot?.status === "FINISHED" ? "Partie terminee" : "Partie terminee",
            epilogue: "",
            scores: g.players.map((p) => ({
              userId: p.userId,
              username: p.user.username,
              score: p.score ?? 0,
              role: p.role ?? "",
              team: (p as any).team ?? "",
            })),
          })
        }
      })
      .catch(() => setError("Partie introuvable"))
      .finally(() => setLoading(false))
  }, [id])

  // WebSocket connection
  useEffect(() => {
    if (!token || !game) return

    const socket = connectSocket(token)

    const joinGame = () => {
      socket.emit("game:join", { gameId: id, token })
    }

    socket.on("connect", joinGame)
    if (socket.connected) joinGame()

    // Full state on join/reconnect
    socket.on("game:state", (state: any) => {
      if (state.currentPhase) setPhase(state.currentPhase)
      if (state.currentRound) setRound(state.currentRound)
      if (state.players) {
        // Update players from game state (engine players have different shape)
        setPlayers((prev) => {
          return prev.map((p) => {
            const sp = state.players.find((s: any) => s.userId === p.userId)
            if (sp) {
              return { ...p, isAlive: sp.isAlive, role: sp.role ?? p.role, score: sp.score ?? p.score }
            }
            return p
          })
        })
      }
      // Sync global gauges
      if (state.globalGauges) {
        setGlobalGauges(state.globalGauges)
      }
      // Reset per-round state based on current phase
      if (state.currentPhase === "NARRATION" || state.currentPhase === "ACTION") {
        setActionSubmitted(false)
        setVoteSubmitted(false)
        setSelectedVote(null)
        setResolutionNarrative("")
        setResolutionEliminations([])
        setResolutionGaugeChanges({})
      }
    })

    // Narration from AI
    socket.on("game:narration", (data: { text: string; isStreaming: boolean }) => {
      if (data.isStreaming) {
        setNarrationText("")
        setIsStreaming(true)
      } else {
        setNarrationText(data.text)
        setIsStreaming(false)
      }
      setWaitingMessage("")
    })

    // Streaming narration chunks
    socket.on("game:narration:chunk", (data: { chunk: string }) => {
      setIsStreaming(true)
      setNarrationText((prev) => prev + data.chunk)
    })

    // Streaming narration complete
    socket.on("game:narration:complete", (data: { text: string }) => {
      setIsStreaming(false)
      setNarrationText(data.text)
    })

    // Phase changes
    socket.on("game:phase", (data: { phase: string; round: number }) => {
      setPhase(data.phase)
      setRound(data.round)
      setWaitingMessage("")

      // Reset per-phase state
      if (data.phase === "ACTION") {
        setActionSubmitted(false)
        setActionRemaining(null)
        setPredefinedActions([])
        setAiSuggestions([])
        setSuggestionsLoading(false)
      }
      if (data.phase === "VOTE") {
        setVoteSubmitted(false)
        setVoteRemaining(null)
        setSelectedVote(null)
      }
      if (data.phase === "NARRATION") {
        setNarrationText("")
        setActionSubmitted(false)
        setVoteSubmitted(false)
        setResolutionNarrative("")
        setResolutionEliminations([])
      }
    })

    // Action confirmed
    socket.on("game:action:received", (data: { userId: string; remaining: number }) => {
      if (data.userId === user?.id) {
        setActionSubmitted(true)
      }
      setActionRemaining(data.remaining)
      if (data.remaining > 0) {
        setWaitingMessage(`En attente de ${data.remaining} joueur(s)...`)
      }
    })

    // Action suggestions (predefined + AI)
    socket.on("game:action:suggestions", (data: { predefined: string[]; aiSuggestions: string[]; loading: boolean }) => {
      setPredefinedActions(data.predefined)
      setAiSuggestions(data.aiSuggestions)
      setSuggestionsLoading(data.loading)
    })

    // Vote confirmed
    socket.on("game:vote:received", (data: { userId: string; remaining: number }) => {
      if (data.userId === user?.id) {
        setVoteSubmitted(true)
      }
      setVoteRemaining(data.remaining)
      if (data.remaining > 0) {
        setWaitingMessage(`En attente de ${data.remaining} vote(s)...`)
      }
    })

    // Resolution
    socket.on("game:resolution", (data: { narrative: string; eliminations: string[]; gaugeChanges: Record<string, Record<string, number>> }) => {
      setResolutionNarrative(data.narrative)
      setResolutionEliminations(data.eliminations || [])
      setResolutionGaugeChanges(data.gaugeChanges || {})
      // Update global gauges with deltas
      if (data.gaugeChanges?.global) {
        setGlobalGauges((prev) => {
          const updated = { ...prev }
          for (const [key, delta] of Object.entries(data.gaugeChanges.global)) {
            updated[key] = (updated[key] ?? 0) + delta
          }
          return updated
        })
      }
      setWaitingMessage("")

      // Update player alive status
      if (data.eliminations?.length > 0) {
        setPlayers((prev) =>
          prev.map((p) =>
            data.eliminations.includes(p.userId) ? { ...p, isAlive: false } : p
          )
        )
      }
    })

    // Game over
    socket.on("game:over", (data: { result: string; epilogue: string; scores: any[] }) => {
      setGameOver({
        result: data.result,
        epilogue: data.epilogue,
        scores: data.scores ?? [],
      })
    })

    // Chat
    socket.on("game:chat:message", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg])
    })

    // Timer sync from server
    socket.on("game:timer:sync", (data: { seconds: number; phase: string }) => {
      setServerTimerSeconds(data.seconds)
    })

    // Whisper (private message)
    socket.on("game:whisper:message", (data: any) => {
      setChatMessages((prev) => [
        ...prev,
        {
          userId: data.userId,
          username: data.username,
          message: data.message,
          timestamp: data.timestamp,
          isWhisper: true,
          recipientId: data.recipientId,
        } as any,
      ])
    })

    // Errors
    socket.on("game:error", (data: { message: string }) => {
      setError(data.message)
      setTimeout(() => setError(""), 5000)
    })

    return () => {
      const s = getSocket()
      if (s) {
        s.emit("game:leave", { gameId: id })
        s.off("game:state")
        s.off("game:narration")
        s.off("game:narration:chunk")
        s.off("game:narration:complete")
        s.off("game:phase")
        s.off("game:action:received")
        s.off("game:action:suggestions")
        s.off("game:vote:received")
        s.off("game:resolution")
        s.off("game:over")
        s.off("game:chat:message")
        s.off("game:whisper:message")
        s.off("game:timer:sync")
        s.off("game:error")
        s.off("connect")
      }
      disconnectSocket()
    }
  }, [token, game?.id, id, user?.id, router])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  const handleSubmitAction = useCallback(() => {
    const trimmed = customAction.trim()
    if (!trimmed) return
    const socket = getSocket()
    if (!socket) return
    socket.emit("game:action", { gameId: id, action: trimmed })
    setWaitingMessage("Action envoyee, en attente des autres joueurs...")
  }, [customAction, id])

  const handleSelectSuggestion = useCallback((action: string) => {
    const socket = getSocket()
    if (!socket) return
    socket.emit("game:action", { gameId: id, action })
    setWaitingMessage("Action envoyee, en attente des autres joueurs...")
  }, [id])

  const handleSubmitVote = useCallback(() => {
    if (!selectedVote) return
    const socket = getSocket()
    if (!socket) return
    socket.emit("game:vote", { gameId: id, targetId: selectedVote })
    setWaitingMessage("Vote envoye, en attente des autres joueurs...")
  }, [selectedVote, id])

  const handleAdvancePhase = useCallback(() => {
    const socket = getSocket()
    if (!socket) return
    socket.emit("game:advance", { gameId: id })
  }, [id])

  const handleSendChat = useCallback(() => {
    const trimmed = chatMessage.trim()
    if (!trimmed) return
    const socket = getSocket()
    if (!socket) return
    if (whisperTarget) {
      socket.emit("game:whisper", {
        gameId: id,
        recipientId: whisperTarget.id,
        message: trimmed,
      })
    } else {
      socket.emit("game:chat", { gameId: id, message: trimmed })
    }
    setChatMessage("")
  }, [chatMessage, id, whisperTarget])

  const handleLeaveGame = useCallback(() => {
    const socket = getSocket()
    if (socket) {
      socket.emit("game:leave", { gameId: id })
    }
    disconnectSocket()
    router.push("/dashboard")
  }, [id, router])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error && !game) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">{error || "Partie introuvable"}</p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Retour au dashboard
        </Button>
      </div>
    )
  }

  if (!game) return null

  const displayPhase = phaseToGamePhase(phase)
  const totalRounds = game.maxRounds ?? 6
  const scenarioName = game.scenario?.name ?? game.scenarioSlug.toUpperCase()
  const isHost = user?.id === game.hostId
  const currentPlayer = players.find((p) => p.userId === user?.id)

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-card/50 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-gold" />
            <span className="font-display text-sm font-bold text-foreground">{scenarioName}</span>
          </div>
          <span className="text-xs text-muted-foreground">Round {round}/{totalRounds}</span>
          {currentPlayer?.role && (
            <span className="text-xs text-primary">Role: {currentPlayer.role}</span>
          )}
        </div>
        {!gameOver && <GamePhaseBar currentPhase={displayPhase} />}
        <div className="flex items-center gap-3">
          {!gameOver && <GameTimer seconds={game.turnTimeout ?? 60} serverSeconds={serverTimerSeconds} />}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-red-400"
            onClick={handleLeaveGame}
          >
            <LogOut className="mr-1 h-3.5 w-3.5" />
            Quitter
          </Button>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center - Narrative area */}
        <div className="flex flex-1 flex-col">
          <ScrollArea className="flex-1 p-6 sm:p-8">
            <div className="mx-auto max-w-2xl">
              {/* AI MJ header */}
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 text-gold">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-sm font-bold text-gold">Maitre du Jeu</span>
                  <span className="ml-2 text-xs text-muted-foreground">IA</span>
                </div>
              </div>

              {/* FINISHED state */}
              {gameOver && (
                <div className="flex flex-col gap-8">
                  {/* Result banner */}
                  <div className="rounded-xl border border-gold/30 bg-amber-500/5 p-6 text-center">
                    <Trophy className="mx-auto mb-3 h-10 w-10 text-gold" />
                    <h2 className="font-display text-xl font-bold text-gold">Partie terminee</h2>
                    <p className="mt-2 text-sm text-foreground/80">{gameOver.result}</p>
                  </div>

                  {/* Epilogue */}
                  {gameOver.epilogue && (
                    <NarrativeRenderer text={gameOver.epilogue} />
                  )}

                  {/* Scores table */}
                  {gameOver.scores.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h3 className="font-display text-sm font-bold text-foreground uppercase tracking-wide">Scores</h3>
                      <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="px-4 py-2 text-left font-medium">#</th>
                              <th className="px-4 py-2 text-left font-medium">Joueur</th>
                              <th className="px-4 py-2 text-left font-medium">Role</th>
                              <th className="px-4 py-2 text-right font-medium">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...gameOver.scores]
                              .sort((a, b) => b.score - a.score)
                              .map((s, i) => (
                                <tr
                                  key={s.userId}
                                  className={`border-b border-border/50 ${s.userId === user?.id ? "bg-primary/5" : ""}`}
                                >
                                  <td className="px-4 py-2 text-muted-foreground">
                                    {i === 0 ? <Trophy className="inline h-4 w-4 text-gold" /> : i + 1}
                                  </td>
                                  <td className="px-4 py-2 font-medium text-foreground">
                                    {s.username}
                                    {s.userId === user?.id && (
                                      <span className="ml-1 text-xs text-primary">(vous)</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground">{s.role}</td>
                                  <td className="px-4 py-2 text-right font-bold text-primary">{s.score}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Leave button */}
                  <Button
                    className="self-center"
                    onClick={handleLeaveGame}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Retour au dashboard
                  </Button>
                </div>
              )}

              {/* NARRATION phase */}
              {!gameOver && displayPhase === "narration" && (
                <div className="flex flex-col gap-6">
                  {narrationText ? (
                    <NarrativeRenderer text={narrationText} isStreaming={isStreaming} />
                  ) : (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Le Maitre du Jeu prepare son recit...</span>
                    </div>
                  )}

                  {/* Host advance button */}
                  {isHost && narrationText && !isStreaming && (
                    <Button
                      className="self-center glow-violet-sm"
                      onClick={handleAdvancePhase}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Continuer
                    </Button>
                  )}
                </div>
              )}

              {/* ACTION phase */}
              {!gameOver && displayPhase === "action" && (
                <div className="flex flex-col gap-6">
                  {actionSubmitted ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 text-center">
                        <p className="text-sm font-medium text-emerald-400">Action envoyee !</p>
                        {waitingMessage && (
                          <p className="mt-1 text-xs text-muted-foreground">{waitingMessage}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground italic">
                        {`"Le temps presse. Que decidez-vous de faire ?"`}
                      </p>

                      {/* Predefined actions */}
                      {predefinedActions.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions possibles</span>
                          <div className="flex flex-wrap gap-2">
                            {predefinedActions.map((action) => (
                              <Button
                                key={action}
                                variant="outline"
                                size="sm"
                                className="border-border/50 hover:border-primary/50 hover:bg-primary/10"
                                onClick={() => handleSelectSuggestion(action)}
                              >
                                {action}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* AI suggestions */}
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggestions du MJ</span>
                        {suggestionsLoading ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="text-xs">Le MJ reflechit a des suggestions...</span>
                          </div>
                        ) : aiSuggestions.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {aiSuggestions.map((suggestion) => (
                              <Button
                                key={suggestion}
                                variant="outline"
                                size="sm"
                                className="border-amber-500/30 bg-amber-500/5 text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/10"
                                onClick={() => handleSelectSuggestion(suggestion)}
                              >
                                {suggestion}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      {/* Separator */}
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border/50" />
                        <span className="text-xs text-muted-foreground">ou ecrivez votre propre action</span>
                        <div className="h-px flex-1 bg-border/50" />
                      </div>

                      {/* Custom action input */}
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Input
                            placeholder="Que faites-vous ?"
                            value={customAction}
                            onChange={(e) => setCustomAction(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSubmitAction()
                            }}
                            className="bg-secondary/50 border-border/50"
                          />
                        </div>
                      </div>

                      <Button
                        disabled={!customAction.trim()}
                        className="self-center glow-violet-sm"
                        onClick={handleSubmitAction}
                      >
                        Valider mon action
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* DISCUSSION phase */}
              {!gameOver && displayPhase === "discussion" && (
                <div className="flex flex-col gap-6">
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-center">
                    <p className="font-display text-lg font-bold text-blue-400">Phase de Discussion</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Discutez avec les autres joueurs avant le vote
                    </p>
                  </div>
                  {isHost && (
                    <Button className="self-center glow-violet-sm" onClick={handleAdvancePhase}>
                      Passer au vote
                    </Button>
                  )}
                </div>
              )}

              {/* VOTE phase */}
              {!gameOver && displayPhase === "vote" && (
                <div className="flex flex-col gap-6">
                  {voteSubmitted ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 text-center">
                        <p className="text-sm font-medium text-emerald-400">Vote enregistre !</p>
                        {waitingMessage && (
                          <p className="mt-1 text-xs text-muted-foreground">{waitingMessage}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-gold/30 bg-amber-500/5 p-4 text-center">
                        <p className="font-display text-lg font-bold text-gold">
                          Qui suspectez-vous ?
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {players.filter(p => p.isAlive && p.userId !== user?.id).map((player) => (
                          <PlayerCard
                            key={player.id}
                            name={player.user.username}
                            role={player.role ?? undefined}
                            status="online"
                            showVote
                            selected={selectedVote === player.userId}
                            onClick={() => setSelectedVote(player.userId)}
                          />
                        ))}
                      </div>

                      <Button
                        disabled={!selectedVote}
                        className="self-center glow-violet-sm"
                        onClick={handleSubmitVote}
                      >
                        Confirmer mon vote
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* RESOLUTION phase */}
              {!gameOver && displayPhase === "resolution" && (
                <div className="flex flex-col gap-6">
                  {resolutionNarrative ? (
                    <NarrativeRenderer text={resolutionNarrative} />
                  ) : (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Resolution en cours...</span>
                    </div>
                  )}

                  {/* Gauge changes */}
                  {resolutionNarrative && resolutionGaugeChanges.global && Object.keys(resolutionGaugeChanges.global).length > 0 && (
                    <div className="rounded-xl border border-border bg-card/50 p-4">
                      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Etat des systemes</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Object.entries(resolutionGaugeChanges.global).map(([gaugeId, delta]) => {
                          const currentValue = globalGauges[gaugeId] ?? 0
                          const gaugeLabels: Record<string, { name: string; max: number; color: string; icon: string }> = {
                            o2: { name: "Oxygene", max: 100, color: "text-cyan-400", icon: "O2" },
                            energie: { name: "Energie", max: 100, color: "text-amber-400", icon: "E" },
                            coque: { name: "Coque", max: 100, color: "text-orange-400", icon: "C" },
                            profondeur: { name: "Profondeur", max: 8000, color: "text-blue-400", icon: "P" },
                          }
                          const gauge = gaugeLabels[gaugeId] ?? { name: gaugeId, max: 100, color: "text-foreground", icon: "?" }
                          const pct = Math.min(100, Math.max(0, (currentValue / gauge.max) * 100))
                          const isPositive = delta > 0
                          const isCritical = gaugeId !== "profondeur" && pct < 25

                          return (
                            <div key={gaugeId} className="flex flex-col gap-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className={`font-medium ${gauge.color}`}>{gauge.name}</span>
                                <span className="flex items-center gap-1.5">
                                  <span className="text-muted-foreground">
                                    {gaugeId === "profondeur" ? `${currentValue}m` : `${Math.round(pct)}%`}
                                  </span>
                                  <span className={`font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                                    {isPositive ? "+" : ""}{gaugeId === "profondeur" ? `${delta}m` : delta}
                                  </span>
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-secondary/80 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-700 ${isCritical ? "bg-red-500" : gaugeId === "profondeur" ? "bg-blue-500" : "bg-emerald-500"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Eliminated players */}
                  {resolutionEliminations.length > 0 && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                      {resolutionEliminations.map((elId) => {
                        const elPlayer = players.find((p) => p.userId === elId)
                        return (
                          <p key={elId} className="text-sm text-red-400">
                            {elPlayer?.user.username ?? elId} a ete elimine(e).
                          </p>
                        )
                      })}
                    </div>
                  )}

                  {/* Waiting for next round — timer shown via GameTimer in header */}
                  {resolutionNarrative && (
                    <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-border/50 bg-secondary/30 px-4 py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Prochain round en cours de preparation...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right panel - Players + Gauges */}
        <aside className="hidden w-72 flex-shrink-0 flex-col border-l border-border bg-card/50 lg:flex">
          {/* Global gauges */}
          {Object.keys(globalGauges).length > 0 && (
            <div className="border-b border-border p-4">
              <h3 className="mb-3 font-display text-sm font-bold text-foreground">Systemes</h3>
              <div className="flex flex-col gap-2.5">
                {Object.entries(globalGauges).map(([gaugeId, value]) => {
                  const meta: Record<string, { name: string; max: number; color: string }> = {
                    o2: { name: "O2", max: 100, color: "bg-cyan-500" },
                    energie: { name: "Energie", max: 100, color: "bg-amber-500" },
                    coque: { name: "Coque", max: 100, color: "bg-orange-500" },
                    profondeur: { name: "Prof.", max: 8000, color: "bg-blue-500" },
                  }
                  const g = meta[gaugeId] ?? { name: gaugeId, max: 100, color: "bg-primary" }
                  const pct = Math.min(100, Math.max(0, (value / g.max) * 100))
                  const isCritical = gaugeId !== "profondeur" && pct < 25
                  return (
                    <div key={gaugeId} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">{g.name}</span>
                        <span className={`font-mono font-medium ${isCritical ? "text-red-400" : "text-foreground/70"}`}>
                          {gaugeId === "profondeur" ? `${value}m` : `${Math.round(pct)}%`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-secondary/80 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isCritical ? "bg-red-500" : g.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="border-b border-border p-4">
            <h3 className="font-display text-sm font-bold text-foreground">Joueurs</h3>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="flex flex-col gap-3">
              {players.map((player) => (
                <div key={player.id} className="flex flex-col gap-2">
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      if (player.userId !== user?.id) {
                        setWhisperTarget({ id: player.userId, username: player.user.username })
                        setChatOpen(true)
                      }
                    }}
                    title={player.userId !== user?.id ? `Whisper a ${player.user.username}` : undefined}
                  >
                    <PlayerCard
                      name={player.user.username}
                      role={player.role ?? undefined}
                      status={player.isAlive ? "online" : "eliminated"}
                    />
                  </div>
                  {player.isAlive && (
                    <div className="flex flex-col gap-1 px-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Score</span>
                        <span className="text-primary">{player.score}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </aside>
      </div>

      {/* Chat panel - collapsible */}
      <div className="border-t border-border bg-card/50">
        <button
          type="button"
          onClick={() => setChatOpen(!chatOpen)}
          className="flex w-full items-center justify-between px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat de groupe
            {chatMessages.length > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary">
                {chatMessages.length}
              </span>
            )}
          </div>
          {chatOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        {chatOpen && (
          <div className="border-t border-border">
            <div className="h-32 overflow-y-auto p-4">
              <div className="flex flex-col gap-2 text-sm">
                {chatMessages.length === 0 ? (
                  <p className="text-muted-foreground italic text-center py-4">
                    Aucun message pour le moment.
                  </p>
                ) : (
                  chatMessages.map((msg: any, i) => (
                    <div key={i} className={`flex gap-2 ${msg.isWhisper ? "italic opacity-80" : ""}`}>
                      <span className={`font-semibold text-xs ${msg.isWhisper ? "text-purple-400" : "text-primary"}`}>
                        {msg.isWhisper ? `[Whisper] ${msg.username}` : `${msg.username}`}:
                      </span>
                      <span className="text-foreground text-xs">{msg.message}</span>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
            {whisperTarget && (
              <div className="flex items-center gap-2 border-t border-border px-3 py-1 bg-purple-500/10">
                <span className="text-[10px] text-purple-400">
                  Whisper a {whisperTarget.username}
                </span>
                <button
                  onClick={() => setWhisperTarget(null)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  x
                </button>
              </div>
            )}
            <div className="flex gap-2 border-t border-border p-3">
              <Input
                placeholder={whisperTarget ? `Whisper a ${whisperTarget.username}...` : "Message..."}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendChat()
                  if (e.key === "Escape") setWhisperTarget(null)
                }}
                className={`bg-secondary/50 border-border/50 h-8 text-sm ${whisperTarget ? "border-purple-500/30" : ""}`}
              />
              <Button size="sm" className="h-8" onClick={handleSendChat}>
                <Send className="h-3.5 w-3.5" />
                <span className="sr-only">Envoyer</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
