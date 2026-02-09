import Link from "next/link"
import { Bot, Home, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        {/* Icon */}
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 animate-pulse-glow">
          <Bot className="h-12 w-12 text-primary" />
        </div>

        {/* 404 */}
        <h1 className="font-display text-8xl font-bold text-primary">404</h1>

        {/* Text */}
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-semibold text-foreground">
            {"Cette page n'existe pas dans cette realite"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {"Le Maitre du Jeu n'a pas prevu ce scenario..."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button className="glow-violet-sm">
              <Home className="mr-2 h-4 w-4" />
              Retour au dashboard
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Page precedente
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
