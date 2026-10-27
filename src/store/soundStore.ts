import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeStorage } from './storage'

export interface SoundState {
  enabled: boolean
  volume: number

  // Sound actions
  playMove: () => void
  playCapture: () => void
  playCheck: () => void
  playCheckmate: () => void
  playStalemate: () => void
  playPromotion: () => void
  toggleSound: () => void
  setVolume: (volume: number) => void
}

// ── Web Audio synthesis ─────────────────────────────────────────────────────
// Small synthesized cues (no audio files needed). The AudioContext is created
// lazily on first sound and resumed on user gestures to satisfy autoplay
// policies in browsers.

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Play one oscillator tone starting `delay` seconds from now. */
function tone(
  freq: number,
  delay: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'triangle',
) {
  const ac = audioContext()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

/** Short filtered noise burst — the wooden "click" of a piece. */
function click(delay: number, duration: number, volume: number) {
  const ac = audioContext()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const frames = Math.max(1, Math.floor(ac.sampleRate * duration))
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-i / frames) * 6)
  }
  const source = ac.createBufferSource()
  source.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 1400
  filter.Q.value = 0.8
  const gain = ac.createGain()
  gain.gain.setValueAtTime(volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  source.connect(filter).connect(gain).connect(ac.destination)
  source.start(t0)
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set, get) => {
      /** Level 0..1 scaled by the user's volume setting. */
      const v = (level: number) => Math.max(0.0001, level * get().volume)

      return {
        enabled: true,
        volume: 0.5,

        playMove: () => {
          if (!get().enabled) return
          click(0, 0.06, v(0.9))
          tone(320, 0, 0.07, v(0.25), 'sine')
        },

        playCapture: () => {
          if (!get().enabled) return
          click(0, 0.09, v(1))
          tone(180, 0, 0.16, v(0.35), 'sawtooth')
        },

        playCheck: () => {
          if (!get().enabled) return
          click(0, 0.05, v(0.7))
          tone(880, 0.02, 0.12, v(0.3))
          tone(660, 0.14, 0.16, v(0.3))
        },

        playCheckmate: () => {
          if (!get().enabled) return
          click(0, 0.1, v(0.8))
          tone(660, 0, 0.22, v(0.3))
          tone(550, 0.2, 0.22, v(0.3))
          tone(440, 0.4, 0.3, v(0.32))
        },

        playStalemate: () => {
          if (!get().enabled) return
          tone(440, 0, 0.25, v(0.28), 'sine')
          tone(440, 0.3, 0.35, v(0.24), 'sine')
        },

        playPromotion: () => {
          if (!get().enabled) return
          tone(523, 0, 0.12, v(0.28))
          tone(659, 0.09, 0.12, v(0.28))
          tone(784, 0.18, 0.12, v(0.28))
          tone(1046, 0.27, 0.24, v(0.3))
        },

        toggleSound: () => {
          set((state) => ({ enabled: !state.enabled }))
        },

        setVolume: (volume) => {
          set({ volume: Math.min(1, Math.max(0, volume)) })
        },
      }
    },
    {
      name: 'grandmaster:sound',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ enabled: state.enabled, volume: state.volume }),
    },
  ),
)
