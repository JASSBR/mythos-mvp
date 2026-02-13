"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  Gamepad2,
  UserCircle,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Shield,
  Check,
  Trash2,
  Gamepad,
  Swords,
  Trophy,
  Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import { api, NotificationItem } from "@/lib/api"
import { getSocket } from "@/lib/socket"

const sidebarItems = [
  { icon: Home, label: "Accueil", href: "/dashboard" },
  { icon: Gamepad2, label: "Mes parties", href: "/dashboard/games" },
  { icon: UserCircle, label: "Profil", href: "/dashboard/profile" },
  { icon: Settings, label: "Parametres", href: "/dashboard/settings" },
]

function getNotificationIcon(type: string) {
  switch (type) {
    case "GAME_INVITE": return Gamepad
    case "GAME_STARTED": return Swords
    case "TURN_ACTION": return Gamepad2
    case "GAME_FINISHED": return Trophy
    default: return Info
  }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return "à l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout, loading } = useAuth()

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifDropdown, setShowNotifDropdown] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  // Fetch notifications on mount
  useEffect(() => {
    api.notifications.list().then((res) => {
      setNotifications(res.notifications)
      setUnreadCount(res.unreadCount)
    }).catch(() => {})
  }, [])

  // Listen for real-time notifications
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    const handler = (data: any) => {
      setNotifications((prev) => [data, ...prev].slice(0, 20))
      setUnreadCount((prev) => prev + 1)
    }

    socket.on("notification:new", handler)
    return () => { socket.off("notification:new", handler) }
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    await api.notifications.markAllRead().catch(() => {})
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }, [])

  const handleMarkRead = useCallback(async (id: string) => {
    await api.notifications.markRead(id).catch(() => {})
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    )
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const initials = user ? user.username.slice(0, 2).toUpperCase() : "??"
  const displayName = user?.username || "..."

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar - Desktop */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-border bg-card/50 md:block sticky top-0 h-screen overflow-y-auto">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 border-b border-border px-6 py-5">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-display text-xs font-bold text-primary-foreground">
                M
              </div>
              <span className="font-display text-lg font-bold text-foreground">MYTHOS</span>
            </Link>
          </div>
          <nav className="flex flex-1 flex-col gap-1 p-4">
            {sidebarItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  pathname === item.href
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-border p-4">
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            onKeyDown={() => {}}
            role="button"
            tabIndex={-1}
            aria-label="Fermer le menu"
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <span className="font-display text-lg font-bold text-foreground">MYTHOS</span>
              <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-4">
              {sidebarItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    pathname === item.href
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-border bg-card/50 px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="md:hidden text-muted-foreground"
              onClick={() => setSidebarOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                className="w-64 pl-10 bg-secondary/50 border-border/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative" ref={notifRef}>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-muted-foreground hover:text-foreground"
                onClick={() => setShowNotifDropdown((v) => !v)}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>

              {showNotifDropdown && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-card shadow-xl">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <span className="text-sm font-semibold text-foreground">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={handleMarkAllRead}
                      >
                        <Check className="h-3 w-3" />
                        Tout marquer lu
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Aucune notification
                      </div>
                    ) : (
                      notifications.slice(0, 8).map((notif) => {
                        const Icon = getNotificationIcon(notif.type)
                        return (
                          <button
                            key={notif.id}
                            type="button"
                            className={cn(
                              "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50",
                              !notif.isRead && "bg-primary/5"
                            )}
                            onClick={() => handleMarkRead(notif.id)}
                          >
                            <div className={cn(
                              "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                              !notif.isRead ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm", !notif.isRead ? "font-medium text-foreground" : "text-muted-foreground")}>
                                {notif.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{notif.message}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground/60">{timeAgo(notif.createdAt)}</p>
                            </div>
                            {!notif.isRead && (
                              <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                  <div className="border-t border-border px-4 py-2">
                    <Link
                      href="/dashboard/notifications"
                      className="block text-center text-xs font-medium text-primary hover:underline"
                      onClick={() => setShowNotifDropdown(false)}
                    >
                      Voir toutes les notifications
                    </Link>
                  </div>
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium text-foreground sm:block">
                    {displayName}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">
                    <UserCircle className="mr-2 h-4 w-4" />
                    Profil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Parametres
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={logout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Deconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
