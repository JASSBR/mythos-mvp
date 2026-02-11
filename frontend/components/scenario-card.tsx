import Image from "next/image"
import Link from "next/link"
import { Clock, Users, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ScenarioCardProps {
  title: string
  description: string
  image: string
  duration: string
  players: string
  difficulty: "Facile" | "Normal" | "Difficile"
  href?: string
}

const difficultyColor = {
  Facile: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Normal: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Difficile: "bg-red-500/20 text-red-400 border-red-500/30",
}

export function ScenarioCard({
  title,
  description,
  image,
  duration,
  players,
  difficulty,
  href = "#",
}: ScenarioCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:border-primary/50 hover:glow-violet-sm">
      <div className="relative aspect-[16/9] sm:aspect-[16/10] overflow-hidden">
        <Image
          src={image || "/placeholder.svg"}
          alt={`Illustration du scenario ${title}`}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        <Badge
          variant="outline"
          className={`absolute right-3 top-3 ${difficultyColor[difficulty]} border text-xs`}
        >
          {difficulty}
        </Badge>
      </div>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <h3 className="font-display text-xl font-bold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {duration}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {players}
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            {difficulty}
          </span>
        </div>
        <Link href={href}>
          <Button className="mt-1 w-full" size="sm">
            Jouer
          </Button>
        </Link>
      </div>
    </div>
  )
}
