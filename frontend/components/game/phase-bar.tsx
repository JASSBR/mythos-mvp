import { cn } from "@/lib/utils"

const phases = [
  { id: "narration", label: "Narration" },
  { id: "action", label: "Action" },
  { id: "discussion", label: "Discussion" },
  { id: "vote", label: "Vote" },
  { id: "resolution", label: "Resolution" },
]

export type GamePhase = "narration" | "action" | "discussion" | "vote" | "resolution"

export function GamePhaseBar({ currentPhase }: { currentPhase: GamePhase }) {
  const currentIdx = phases.findIndex((p) => p.id === currentPhase)

  return (
    <div className="flex items-center gap-1">
      {phases.map((phase, i) => (
        <div key={phase.id} className="flex items-center gap-1">
          <div
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-all",
              i === currentIdx
                ? "bg-primary text-primary-foreground glow-violet-sm"
                : i < currentIdx
                  ? "bg-primary/20 text-primary"
                  : "bg-secondary text-muted-foreground"
            )}
          >
            {phase.label}
          </div>
          {i < phases.length - 1 && (
            <div
              className={cn(
                "h-0.5 w-4 rounded-full",
                i < currentIdx ? "bg-primary" : "bg-border"
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
