"use client"

import { useState, useEffect, useRef, useCallback, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Copy, Check, Send, LogOut, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlayerCard } from "@/components/player-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/lib/auth"
import { api, type GameDetail } from "@/lib/api"
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket"

interface LobbyPlayer {
  userId: string
  username: string
  avatar: string | null
  isHost: boolean
}

interface ChatMessage {
  userId: string
  username: string
  message: string
  timestamp: string
}

export default function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const { user, token } = useAuth()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState("")
  const [game, setGame] = useState<GameDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [starting, setStarting] = useState(false)
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([])
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [socketConnected, setSocketConnected] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Initial REST fetch for game data
  useEffect(() => {
    api.games.getByCode(code)
      .then((g) => {
        setGame(g)
        setMaxPlayers(g.maxPlayers)
        setLobbyPlayers(
          g.players.map((p) => ({
            userId: p.user.id,
            username: p.user.username,
            avatar: p.user.avatar,
            isHost: p.isHost,
          }))
        )
        // If game already started, redirect
        if (g.status === "IN_PROGRESS") {
          router.push(`/game/${g.id}`)
        }
      })
      .catch(() => setError("Salon introuvable"))
      .finally(() => setLoading(false))
  }, [code, router])

  // WebSocket connection
  useEffect(() => {
    if (!token || !game) return

    const socket = connectSocket(token)

    socket.on("connect", () => {
      setSocketConnected(true)
      // Join the lobby room
      socket.emit("lobby:join", { code, token })
    })

    // If already connected, join immediately
    if (socket.connected) {
      setSocketConnected(true)
      socket.emit("lobby:join", { code, token })
    }

    socket.on("disconnect", () => {
      setSocketConnected(false)
    })

    // Real-time player list updates
    socket.on("lobby:update", (data: { players: LobbyPlayer[]; playerCount: number; maxPlayers: number }) => {
      setLobbyPlayers(data.players)
      setMaxPlayers(data.maxPlayers)
    })

    // Game started — redirect to game page
    socket.on("lobby:started", (data: { gameId: string }) => {
      router.push(`/game/${data.gameId}`)
    })

    // Chat messages
    socket.on("lobby:chat:message", (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg])
    })

    // Error handling
    socket.on("game:error", (data: { message: string }) => {
      setError(data.message)
      setStarting(false)
      // Clear error after 5s
      setTimeout(() => setError(""), 5000)
    })

    return () => {
      const s = getSocket()
      if (s) {
        s.emit("lobby:leave", { code })
        s.off("lobby:update")
        s.off("lobby:started")
        s.off("lobby:chat:message")
        s.off("game:error")
        s.off("connect")
        s.off("disconnect")
      }
      disconnectSocket()
    }
  }, [token, game?.id, code, router])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLeave = async () => {
    const socket = getSocket()
    if (socket) {
      socket.emit("lobby:leave", { code })
    }
    if (game) {
      try {
        await api.games.leave(game.id)
      } catch {
        // ignore
      }
    }
    disconnectSocket()
    router.push("/dashboard")
  }

  const handleStart = useCallback(() => {
    if (!game) return
    const socket = getSocket()
    if (!socket) return
    setStarting(true)
    socket.emit("game:start", { gameId: game.id })
  }, [game])

  const handleSendMessage = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed) return
    const socket = getSocket()
    if (!socket) return
    socket.emit("lobby:chat", { code, message: trimmed })
    setMessage("")
  }, [message, code])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if ((error && !game) || !game) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{error || "Salon introuvable"}</p>
        <Link href="/dashboard">
          <Button variant="outline">Retour au dashboard</Button>
        </Link>
      </div>
    )
  }

  const isHost = user?.id === game.hostId
  const players = lobbyPlayers

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left column - Scenario info */}
      <div className="relative flex-1 lg:w-[60%]">
        <div className="absolute inset-0 bg-background" />
        <div className="relative flex flex-col gap-8 p-8 lg:p-12">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-display text-xs font-bold text-primary-foreground">
              M
            </div>
            <span className="font-display text-lg font-bold text-foreground">MYTHOS</span>
          </Link>

          <div className="flex flex-col gap-4">
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              {game.scenario?.name ?? game.scenarioSlug.toUpperCase()}
            </h1>
            <p className="max-w-xl text-muted-foreground leading-relaxed">
              {game.scenario?.description ?? "Chargement du scenario..."}
            </p>
          </div>

          {/* Scenario details */}
          {game.scenario && (
            <div className="rounded-xl border border-border bg-card/80 p-6">
              <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-primary">
                Details
              </h3>
              <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
                <li>{game.scenario.minPlayers}-{game.scenario.maxPlayers} joueurs</li>
                <li>Duree : {game.scenario.duration}</li>
                <li>Difficulte : {game.scenario.difficulty}</li>
                <li>{game.maxRounds ?? 6} rounds maximum</li>
              </ul>
            </div>
          )}

          {/* Room code */}
          <div className="flex flex-col items-start gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Code du salon
            </span>
            <div className="flex items-center gap-3 rounded-xl bg-card/80 border border-border px-6 py-3">
              <span className="font-display text-2xl font-bold tracking-[0.3em] text-foreground">
                {game.code}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-primary"
                aria-label="Copier le code"
              >
                {copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Connection status */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right column - Players & Chat */}
      <div className="flex flex-col border-l border-border bg-card lg:w-[40%]">
        {/* Players */}
        <div className="flex flex-col gap-4 border-b border-border p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-foreground">Joueurs</h2>
            <div className="flex items-center gap-2">
              {socketConnected && (
                <span className="h-2 w-2 rounded-full bg-emerald-400" title="Connecte" />
              )}
              <span className="text-sm text-muted-foreground">
                {players.length}/{maxPlayers}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {players.map((player) => (
              <PlayerCard
                key={player.userId}
                name={player.username}
                status="online"
                isHost={player.isHost}
              />
            ))}
            {/* Empty slots */}
            {Array.from({ length: maxPlayers - players.length }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3"
              >
                <div className="h-9 w-9 rounded-full bg-secondary animate-pulse" />
                <span className="text-sm text-muted-foreground animate-pulse">En attente...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="flex flex-1 flex-col">
          <ScrollArea className="flex-1 p-6">
            <div className="flex flex-col gap-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  Aucun message pour le moment.
                </p>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-primary">{msg.username}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{msg.message}</p>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </ScrollArea>
          <div className="flex gap-2 border-t border-border p-4">
            <Input
              placeholder="Envoyer un message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendMessage()
              }}
              className="bg-secondary/50 border-border/50"
            />
            <Button size="icon" className="flex-shrink-0" onClick={handleSendMessage}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Envoyer</span>
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border p-4">
          <Button
            variant="outline"
            className="text-muted-foreground bg-transparent"
            onClick={handleLeave}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Quitter
          </Button>
          {isHost && (
            <Button
              className="glow-violet-sm font-semibold"
              disabled={players.length < 2 || starting}
              onClick={handleStart}
            >
              {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lancer la partie
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
