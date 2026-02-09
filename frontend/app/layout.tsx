import React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { AuthProvider } from "@/lib/auth"

import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
})

export const metadata: Metadata = {
  title: "MYTHOS — Jeux narratifs multijoueurs avec IA",
  description:
    "Plongez dans des histoires immersives ou l'IA est votre Maitre du Jeu. Jouez en multijoueur, faites des choix, changez le cours de l'histoire.",
}

export const viewport: Viewport = {
  themeColor: "#0F0F1A",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans antialiased min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
