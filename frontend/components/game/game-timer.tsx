"use client"

import { useEffect, useState } from "react"

export function GameTimer({
  seconds: initial,
  serverSeconds,
}: {
  seconds: number
  serverSeconds?: number
}) {
  const [seconds, setSeconds] = useState(initial)
  const [total, setTotal] = useState(initial)

  // Sync from server
  useEffect(() => {
    if (serverSeconds !== undefined) {
      setSeconds(serverSeconds)
      if (serverSeconds > total) {
        setTotal(serverSeconds)
      }
    }
  }, [serverSeconds, total])

  useEffect(() => {
    setSeconds(initial)
    setTotal(initial)
  }, [initial])

  useEffect(() => {
    if (seconds <= 0) return
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [seconds])

  const pct = total > 0 ? (seconds / total) * 100 : 0
  const radius = 28
  const circumference = 2 * Math.PI * radius
  const strokeOffset = circumference - (pct / 100) * circumference

  const color = seconds > 30 ? "text-primary" : seconds > 10 ? "text-amber-400" : "text-red-400"

  return (
    <div className="relative flex h-16 w-16 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="3"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          className={`transition-all duration-1000 ${color}`}
        />
      </svg>
      <span className={`font-display text-sm font-bold ${color}`}>{seconds}s</span>
    </div>
  )
}
