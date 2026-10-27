import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Color } from 'chess.js'
import { safeStorage } from './storage'

export interface SavedGame {
  id: string
  date: number
  pgn: string
  /** Human-readable result, e.g. "Checkmate — White wins", "Draw". */
  result: string
  playerColor: Color
  difficulty: string
  moveCount: number
}

export const MAX_SAVED_GAMES = 50

export interface GameLibraryState {
  games: SavedGame[]
  saveGame: (game: Omit<SavedGame, 'id' | 'date'>) => void
  deleteGame: (id: string) => void
  clearLibrary: () => void
}

export const useGameLibraryStore = create<GameLibraryState>()(
  persist(
    (set) => ({
      games: [],

      saveGame: (game) =>
        set((state) => {
          // Don't store the same position twice (e.g. double-click guard).
          if (state.games.some((g) => g.pgn === game.pgn)) return state
          const entry: SavedGame = {
            ...game,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            date: Date.now(),
          }
          return { games: [entry, ...state.games].slice(0, MAX_SAVED_GAMES) }
        }),

      deleteGame: (id) =>
        set((state) => ({ games: state.games.filter((g) => g.id !== id) })),

      clearLibrary: () => set({ games: [] }),
    }),
    {
      name: 'grandmaster:library',
      storage: createJSONStorage(() => safeStorage),
    },
  ),
)
