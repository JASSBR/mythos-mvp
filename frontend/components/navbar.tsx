"use client"

import Link from "next/link"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/60 backdrop-blur-xl border-b border-border/40">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-primary-foreground">
            M
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-foreground">
            MYTHOS
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="#scenarios"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Scenarios
          </Link>
          <Link
            href="#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Comment ca marche
          </Link>
          <Link href="/login">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              Connexion
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="glow-violet-sm">
              Inscription
            </Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <div
        className={cn(
          "md:hidden overflow-hidden transition-all duration-300 bg-background/95 backdrop-blur-xl border-b border-border/40",
          mobileOpen ? "max-h-80" : "max-h-0 border-b-0"
        )}
      >
        <div className="flex flex-col gap-4 px-6 py-6">
          <Link
            href="#scenarios"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            Scenarios
          </Link>
          <Link
            href="#how-it-works"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setMobileOpen(false)}
          >
            Comment ca marche
          </Link>
          <Link href="/login" onClick={() => setMobileOpen(false)}>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
              Connexion
            </Button>
          </Link>
          <Link href="/register" onClick={() => setMobileOpen(false)}>
            <Button size="sm" className="w-full glow-violet-sm">
              Inscription
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
