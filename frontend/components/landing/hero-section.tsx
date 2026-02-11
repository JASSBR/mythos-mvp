import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero-bg.svg"
          alt=""
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-background/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 pt-20 text-center sm:gap-8 sm:px-6 sm:pt-24">
        <div className="flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Beta ouverte — Jouez gratuitement
          </div>
        </div>

        <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl md:text-7xl lg:text-8xl text-balance">
          MYTHOS
        </h1>

        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl text-pretty">
          Plongez dans des histoires ou l{"'"}IA est votre Maitre du Jeu.
          Faites des choix, changez le cours de l{"'"}histoire, jouez avec vos amis.
        </p>

        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <Link href="/register" className="w-full sm:w-auto">
            <Button size="lg" className="w-full glow-violet px-8 text-base font-semibold sm:w-auto">
              Jouer maintenant
            </Button>
          </Link>
          <Link href="#how-it-works" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full px-8 text-base border-border/60 text-foreground hover:bg-secondary bg-transparent sm:w-auto">
              Decouvrir
            </Button>
          </Link>
        </div>

        {/* Scroll indicator */}
        <div className="mt-8 animate-bounce text-muted-foreground sm:mt-12">
          <ChevronDown className="h-6 w-6" />
        </div>
      </div>
    </section>
  )
}
