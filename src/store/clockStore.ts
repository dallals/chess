import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Color } from 'chess.js'
import { safeStorage } from './storage'

export type ClockControlId = 'unlimited' | '5+0' | '10+0' | '15+10'

export interface ClockControl {
  id: ClockControlId
  label: string
  /** Base time per player in seconds; 0 = unlimited. */
  baseSeconds: number
  /** Increment added after each move, in seconds. */
  incrementSeconds: number
}

export const CLOCK_CONTROLS: ClockControl[] = [
  { id: 'unlimited', label: 'Unlimited', baseSeconds: 0, incrementSeconds: 0 },
  { id: '5+0', label: '5 min', baseSeconds: 300, incrementSeconds: 0 },
  { id: '10+0', label: '10 min', baseSeconds: 600, incrementSeconds: 0 },
  { id: '15+10', label: '15|10', baseSeconds: 900, incrementSeconds: 10 },
]

export const controlOf = (id: ClockControlId): ClockControl =>
  CLOCK_CONTROLS.find((c) => c.id === id) ?? CLOCK_CONTROLS[0]

/** Render milliseconds as mm:ss (or m:ss.x under 20s for tension). */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms)
  const totalSeconds = Math.floor(clamped / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (clamped < 20000) {
    const tenths = Math.floor((clamped % 1000) / 100)
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

interface Snapshot {
  control: ClockControlId
  whiteMs: number
  blackMs: number
}

export interface ClockState extends Snapshot {
  /** Which clock runs now; null when the clock is stopped (or unlimited). */
  running: Color | null

  setControl: (id: ClockControlId) => void
  /** Reset both clocks to the selected control's base time. */
  resetClock: (id?: ClockControlId) => void
  /**
   * Called after every position change: starts/stops the right clock and
   * applies the increment to the side that just moved.
   */
  onTurnChange: (turn: Color, moved: Color | null, active: boolean) => void
  stop: () => void
  /** Advance the running clock; returns true if its flag fell. */
  tick: (deltaMs: number) => boolean
}

const initialSnapshot = (id: ClockControlId): Snapshot => ({
  control: id,
  whiteMs: controlOf(id).baseSeconds * 1000,
  blackMs: controlOf(id).baseSeconds * 1000,
})

export const useClockStore = create<ClockState>()(
  persist(
    (set, get) => ({
      ...initialSnapshot('unlimited'),
      running: null,

      setControl: (id) => {
        set({ ...initialSnapshot(id), running: null })
      },

      resetClock: (id) => {
        set({ ...initialSnapshot(id ?? get().control), running: null })
      },

      onTurnChange: (turn, moved, active) => {
        const state = get()
        if (controlOf(state.control).baseSeconds === 0) return // unlimited

        if (!active) {
          set({ running: null })
          return
        }

        // Credit the increment to whoever just moved.
        if (moved) {
          const inc = controlOf(state.control).incrementSeconds * 1000
          set(
            moved === 'w'
              ? { whiteMs: state.whiteMs + inc, running: turn }
              : { blackMs: state.blackMs + inc, running: turn },
          )
        } else if (state.running === null) {
          set({ running: turn })
        }
      },

      stop: () => set({ running: null }),

      tick: (deltaMs) => {
        const { running, whiteMs, blackMs } = get()
        if (running === null) return false
        if (running === 'w') {
          const next = whiteMs - deltaMs
          set({ whiteMs: next })
          return next <= 0
        }
        const next = blackMs - deltaMs
        set({ blackMs: next })
        return next <= 0
      },
    }),
    {
      name: 'grandmaster:clock',
      storage: createJSONStorage(() => safeStorage),
      // Only the chosen time control survives a refresh; clocks restart.
      partialize: (state) => ({ control: state.control }),
    },
  ),
)
