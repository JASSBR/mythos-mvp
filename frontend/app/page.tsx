import { Navbar } from "@/components/navbar"
import { HeroSection } from "@/components/landing/hero-section"
import { HowItWorksSection } from "@/components/landing/how-it-works-section"
import { ScenariosSection } from "@/components/landing/scenarios-section"
import { Footer } from "@/components/footer"

export default function Page() {
  return (
    <main>
      <Navbar />
      <HeroSection />
      <HowItWorksSection />
      <ScenariosSection />
      <Footer />
    </main>
  )
}
