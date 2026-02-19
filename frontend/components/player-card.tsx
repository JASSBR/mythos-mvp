'use client';

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PlayerCardProps {
  name: string
  role?: string
  status?: "online" | "offline" | "typing" | "eliminated"
  isHost?: boolean
  showVote?: boolean
  selected?: boolean
  onClick?: () => void
}

const statusColor = {
  online: "bg-emerald-500",
  offline: "bg-muted-foreground",
  typing: "bg-amber-500 animate-pulse",
  eliminated: "bg-red-500",
}

export function PlayerCard({
  name,
  role,
  status = "online",
  isHost,
  showVote,
  selected,
  onClick,
}: PlayerCardProps) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-all w-full text-left",
        selected
          ? "border-gold bg-amber-500/10 glow-gold"
          : "border-border bg-card hover:border-primary/30",
        status === "eliminated" && "opacity-50",
        onClick && "cursor-pointer"
      )}
    >
      <div className="relative">
        <Avatar className="h-9 w-9">
          <AvatarFallback
            className={cn(
              "text-xs font-bold",
              status === "eliminated"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/20 text-primary"
            )}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
            statusColor[status]
          )}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{name}</span>
          {isHost && (
            <Badge variant="outline" className="border-gold/30 bg-amber-500/10 text-gold text-[10px] px-1.5 py-0">
              Hote
            </Badge>
          )}
          {status === "eliminated" && (
            <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-400 text-[10px] px-1.5 py-0">
              Elimine
            </Badge>
          )}
        </div>
        {role && <span className="text-xs text-muted-foreground">{role}</span>}
      </div>
      {showVote && selected && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gold text-background text-xs font-bold">
          ✓
        </div>
      )}
    </button>
  )
}
