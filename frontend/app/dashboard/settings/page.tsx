"use client"

import { useState } from "react"
import { Camera, Loader2 } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/lib/auth"
import { api } from "@/lib/api"

export default function SettingsPage() {
  const { user } = useAuth()
  const [username, setUsername] = useState(user?.username ?? "")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  const [notifications, setNotifications] = useState({
    game: true,
    scenarios: true,
    sounds: false,
  })
  const [privacy, setPrivacy] = useState({
    publicProfile: true,
    visibleHistory: true,
  })

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??"

  const handleSave = async () => {
    setSaving(true)
    setError("")
    setSaved(false)
    try {
      await api.users.updateProfile({ username })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de la sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-2xl font-bold text-foreground">
        Parametres
      </h1>

      {/* Section 1 — Compte */}
      <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-bold text-foreground">Compte</h2>

        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold font-display">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 transition-opacity hover:opacity-100"
              aria-label="Changer l'avatar"
            >
              <Camera className="h-5 w-5 text-foreground" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">Photo de profil</span>
            <span className="text-xs text-muted-foreground">JPG, PNG ou GIF. 2 Mo max.</span>
          </div>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="pseudo">Pseudo</Label>
          <Input
            id="pseudo"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-secondary/50 border-border/50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={user?.email ?? ""}
            disabled
            className="bg-secondary/50 border-border/50 opacity-60"
          />
          <span className="text-xs text-muted-foreground">{"L'email ne peut pas etre modifie"}</span>
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
        {saved && (
          <p className="text-sm text-emerald-400">Profil sauvegarde avec succes !</p>
        )}

        <Button
          className="w-fit glow-violet-sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sauvegarder
        </Button>
      </section>

      {/* Section 2 — Notifications */}
      <section className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-foreground">
          Notifications
        </h2>

        <div className="flex items-center justify-between py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Notifications de partie</span>
            <span className="text-xs text-muted-foreground">
              Recevoir une alerte quand une partie commence
            </span>
          </div>
          <Switch
            checked={notifications.game}
            onCheckedChange={(v) =>
              setNotifications((p) => ({ ...p, game: v }))
            }
          />
        </div>
        <Separator />

        <div className="flex items-center justify-between py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Nouveaux scenarios</span>
            <span className="text-xs text-muted-foreground">
              Etre notifie des nouveaux scenarios disponibles
            </span>
          </div>
          <Switch
            checked={notifications.scenarios}
            onCheckedChange={(v) =>
              setNotifications((p) => ({ ...p, scenarios: v }))
            }
          />
        </div>
        <Separator />

        <div className="flex items-center justify-between py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Sons en jeu</span>
            <span className="text-xs text-muted-foreground">
              Activer les effets sonores pendant les parties
            </span>
          </div>
          <Switch
            checked={notifications.sounds}
            onCheckedChange={(v) =>
              setNotifications((p) => ({ ...p, sounds: v }))
            }
          />
        </div>
      </section>

      {/* Section 3 — Confidentialite */}
      <section className="flex flex-col gap-1 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-foreground">
          Confidentialite
        </h2>

        <div className="flex items-center justify-between py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Profil public</span>
            <span className="text-xs text-muted-foreground">
              Les autres joueurs peuvent voir vos statistiques
            </span>
          </div>
          <Switch
            checked={privacy.publicProfile}
            onCheckedChange={(v) =>
              setPrivacy((p) => ({ ...p, publicProfile: v }))
            }
          />
        </div>
        <Separator />

        <div className="flex items-center justify-between py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">Historique visible</span>
            <span className="text-xs text-muted-foreground">
              Afficher votre historique de parties
            </span>
          </div>
          <Switch
            checked={privacy.visibleHistory}
            onCheckedChange={(v) =>
              setPrivacy((p) => ({ ...p, visibleHistory: v }))
            }
          />
        </div>
      </section>

      {/* Section 4 — Zone de danger */}
      <section className="flex flex-col gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-6">
        <div>
          <h2 className="font-display text-lg font-bold text-red-400">
            Supprimer le compte
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cette action est irreversible. Toutes vos donnees seront
            definitivement supprimees.
          </p>
        </div>
        <Button variant="destructive" className="w-fit">
          Supprimer mon compte
        </Button>
      </section>
    </div>
  )
}
