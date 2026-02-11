import { Users, Bot, GitFork } from "lucide-react"

const steps = [
  {
    icon: Users,
    step: "01",
    title: "Rejoignez une partie",
    description:
      "Creez un salon ou rejoignez vos amis avec un code. Choisissez votre scenario et preparez-vous.",
  },
  {
    icon: Bot,
    step: "02",
    title: "L'IA raconte l'histoire",
    description:
      "Un Maitre du Jeu propulse par l'IA genere une narration unique et immersive a chaque partie.",
  },
  {
    icon: GitFork,
    step: "03",
    title: "Vos choix changent tout",
    description:
      "Chaque decision influence le deroulement. Intrigues, alliances et trahisons — l'histoire vous appartient.",
  },
]

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative py-12 sm:py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto mb-10 sm:mb-16 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl text-balance">
            Comment ca marche
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            Trois etapes pour vivre une experience narrative unique.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-8 md:grid-cols-3">
          {steps.map((item) => (
            <div
              key={item.step}
              className="group relative flex flex-col items-center gap-4 sm:gap-6 rounded-xl border border-border bg-card p-5 sm:p-8 text-center transition-all duration-300 hover:border-primary/40 hover:glow-violet-sm"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <item.icon className="h-7 w-7" />
              </div>
              <span className="font-display text-xs font-bold uppercase tracking-widest text-primary">
                Etape {item.step}
              </span>
              <h3 className="font-display text-xl font-bold text-foreground">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
