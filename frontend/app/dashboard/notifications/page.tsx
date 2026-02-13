"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Gamepad,
  Gamepad2,
  Swords,
  Trophy,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api, NotificationItem } from "@/lib/api"
import { getSocket } from "@/lib/socket"

function getNotificationIcon(type: string) {
  switch (type) {
    case "GAME_INVITE": return Gamepad
    case "GAME_STARTED": return Swords
    case "TURN_ACTION": return Gamepad2
    case "GAME_FINISHED": return Trophy
    default: return Info
  }
}

function getNotificationColor(type: string) {
  switch (type) {
    case "GAME_INVITE": return "text-blue-400 bg-blue-400/10"
    case "GAME_STARTED": return "text-green-400 bg-green-400/10"
    case "TURN_ACTION": return "text-amber-400 bg-amber-400/10"
    case "GAME_FINISHED": return "text-purple-400 bg-purple-400/10"
    default: return "text-muted-foreground bg-secondary"
  }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.notifications
      .list()
      .then((res) => {
        setNotifications(res.notifications)
        setUnreadCount(res.unreadCount)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Listen for real-time notifications
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const handler = (data: any) => {
      setNotifications((prev) => [data, ...prev])
      setUnreadCount((prev) => prev + 1)
    }

    socket.on("notification:new", handler)
    return () => {
      socket.off("notification:new", handler)
    }
  }, [])

  const handleMarkRead = useCallback(async (id: string) => {
    await api.notifications.markRead(id).catch(() => {})
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    await api.notifications.markAllRead().catch(() => {})
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    await api.notifications.delete(id).catch(() => {})
    setNotifications((prev) => {
      const notif = prev.find((n) => n.id === id)
      if (notif && !notif.isRead) {
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      return prev.filter((n) => n.id !== id)
    })
  }, [])

  const handleDeleteAll = useCallback(async () => {
    await api.notifications.deleteAll().catch(() => {})
    setNotifications([])
    setUnreadCount(0)
  }, [])

  const handleNotifClick = useCallback(
    (notif: NotificationItem) => {
      if (!notif.isRead) {
        handleMarkRead(notif.id)
      }
      // Navigate to the relevant game if there's a gameId
      if (notif.data?.gameId) {
        router.push(`/dashboard/games`)
      }
    },
    [handleMarkRead, router]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCheck className="mr-2 h-4 w-4" />
              Tout marquer lu
            </Button>
          )}
          {notifications.length > 0 && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteAll}>
              <Trash2 className="mr-2 h-4 w-4" />
              Tout supprimer
            </Button>
          )}
        </div>
      </div>

      {/* Notification list */}
      {notifications.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-12 text-center">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            Aucune notification
          </p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            Vous recevrez des notifications lorsqu&apos;une partie commence, que c&apos;est votre tour, ou qu&apos;une partie se termine.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const Icon = getNotificationIcon(notif.type)
            const colorClass = getNotificationColor(notif.type)
            return (
              <div
                key={notif.id}
                className={cn(
                  "group flex items-start gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-secondary/30",
                  !notif.isRead && "border-primary/20 bg-primary/5"
                )}
              >
                <button
                  type="button"
                  className="flex flex-1 items-start gap-4 text-left"
                  onClick={() => handleNotifClick(notif)}
                >
                  <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full", colorClass)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm", !notif.isRead ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {notif.title}
                      </p>
                      {!notif.isRead && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{notif.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground/60">{timeAgo(notif.createdAt)}</p>
                  </div>
                </button>
                <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {!notif.isRead && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleMarkRead(notif.id)}
                      title="Marquer comme lu"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(notif.id)}
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
