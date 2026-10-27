import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../store/gameStore'
import { useClockStore, controlOf, formatClock } from '../store/clockStore'

/**
 * Both players' clocks, ticking on a 100ms interval.
 * The clock runs only while the game is playing and time-controlled;
 * when a flag falls the game store ends the game.
 */
export const ChessClock: React.FC = () => {
  const control = useClockStore((s) => s.control)
  const whiteMs = useClockStore((s) => s.whiteMs)
  const blackMs = useClockStore((s) => s.blackMs)
  const running = useClockStore((s) => s.running)
  const tick = useClockStore((s) => s.tick)

  const status = useGameStore((s) => s.status)
  const turn = useGameStore((s) => s.turn)
  const fen = useGameStore((s) => s.fen)
  const flagFell = useGameStore((s) => s.flagFell)

  const lastRef = useRef<number | null>(null)

  // Start the clock on the first move of a time-controlled game.
  useEffect(() => {
    if (status === 'playing' && controlOf(control).baseSeconds > 0) {
      useClockStore.getState().onTurnChange(turn, null, true)
    }
  }, [status, control, turn, fen])

  useEffect(() => {
    if (running === null || status !== 'playing') {
      lastRef.current = null
      return
    }
    lastRef.current = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const delta = lastRef.current === null ? 100 : now - lastRef.current
      lastRef.current = now
      if (tick(delta)) flagFell(useGameStore.getState().turn)
    }, 100)
    return () => clearInterval(id)
  }, [running, status, tick, flagFell])

  if (controlOf(control).baseSeconds === 0) return null

  const plate = (label: string, ms: number, active: boolean, low: boolean) => (
    <div
      className={`flex min-w-[7.5rem] items-center justify-between gap-3 border px-4 py-2 transition-colors ${
        active
          ? 'border-brass-500/70 bg-gradient-to-b from-brass-400/20 to-brass-600/10 shadow-glow dark:border-brass-300/60'
          : 'border-brass-600/25 bg-[#efe3c8] dark:border-brass-400/20 dark:bg-walnut-800'
      }`}
    >
      <span className="font-display text-[10px] uppercase tracking-[0.2em] text-ink-700 dark:text-cream-300">
        {label}
      </span>
      <span
        className={`font-mono text-lg tabular-nums ${
          low ? 'animate-pulse text-blood-500 dark:text-blood-300' : 'text-ink-900 dark:text-cream-100'
        }`}
      >
        {formatClock(ms)}
      </span>
    </div>
  )

  const lowW = whiteMs < 20000
  const lowB = blackMs < 20000

  return (
    <div className="grid w-full max-w-[min(80vw,480px)] grid-cols-2 gap-2">
      {plate('White', whiteMs, running === 'w', lowW)}
      {plate('Black', blackMs, running === 'b', lowB)}
    </div>
  )
}
