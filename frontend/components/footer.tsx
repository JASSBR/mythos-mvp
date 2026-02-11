import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-12 md:flex-row md:justify-between">
        <div className="flex flex-col items-center gap-2 md:items-start">
          <span className="font-display text-lg font-bold text-foreground">MYTHOS</span>
          <p className="text-sm text-muted-foreground">
            Jeux narratifs multijoueurs propulses par l{"'"}IA.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
          <Link href="#" className="transition-colors hover:text-foreground">
            Mentions legales
          </Link>
          <Link href="#" className="transition-colors hover:text-foreground">
            Politique de confidentialite
          </Link>
          <Link href="#" className="transition-colors hover:text-foreground">
            CGU
          </Link>
          <Link href="#" className="transition-colors hover:text-foreground">
            Contact
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} MYTHOS. Tous droits reserves.
        </p>
      </div>
    </footer>
  )
}
