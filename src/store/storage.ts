import type { StateStorage } from 'zustand/middleware'

/**
 * localStorage that never throws: falls back to an in-memory map in
 * environments without storage (SSR, older test runners, private modes).
 */
const memory = new Map<string, string>()

export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return memory.get(name) ?? null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      memory.set(name, value)
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {
      memory.delete(name)
    }
  },
}
