"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { api, type User } from "./api"

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const PUBLIC_PATHS = ["/", "/login", "/register", "/scenarios", "/auth/callback"]

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  // Load user from token on mount
  useEffect(() => {
    const stored = localStorage.getItem("token")
    if (stored) {
      setToken(stored)
      api.users
        .me()
        .then((u) => setUser(u))
        .catch(() => {
          localStorage.removeItem("token")
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  // Redirect to login if not authed on protected routes
  useEffect(() => {
    if (loading) return
    const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/scenarios/"))
    if (!user && !isPublic) {
      router.push("/login")
    }
  }, [user, loading, pathname, router])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login({ email, password })
    localStorage.setItem("token", res.access_token)
    setToken(res.access_token)
    setUser(res.user)
    router.push("/dashboard")
  }, [router])

  const register = useCallback(async (email: string, username: string, password: string) => {
    const res = await api.auth.register({ email, username, password })
    localStorage.setItem("token", res.access_token)
    setToken(res.access_token)
    setUser(res.user)
    router.push("/dashboard")
  }, [router])

  const logout = useCallback(() => {
    localStorage.removeItem("token")
    setToken(null)
    setUser(null)
    router.push("/login")
  }, [router])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
