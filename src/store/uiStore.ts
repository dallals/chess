import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeStorage } from './storage'

export interface BoardOrientation {
  flipped: boolean
  playerColor: 'w' | 'b'
}

export interface UIState {
  // Board settings
  boardOrientation: BoardOrientation

  // View settings
  showCoordinates: boolean
  showLegalMoves: boolean
  highlightLastMove: boolean
  highlightCheck: boolean
  darkMode: boolean

  // Animation settings
  animateMoves: boolean
  animationDuration: number

  // Actions
  toggleBoardFlip: () => void
  setPlayerColor: (color: 'w' | 'b') => void
  toggleCoordinates: () => void
  toggleLegalMoves: () => void
  toggleLastMoveHighlight: () => void
  toggleCheckHighlight: () => void
  toggleDarkMode: () => void
  toggleAnimations: () => void
  setAnimationDuration: (duration: number) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      boardOrientation: {
        flipped: false,
        playerColor: 'w',
      },
      showCoordinates: true,
      showLegalMoves: true,
      highlightLastMove: true,
      highlightCheck: true,
      darkMode: false,
      animateMoves: true,
      animationDuration: 300,

      toggleBoardFlip: () => {
        set((state) => ({
          boardOrientation: {
            flipped: !state.boardOrientation.flipped,
            playerColor: state.boardOrientation.flipped ? 'w' : 'b',
          },
        }))
      },

      setPlayerColor: (color) => {
        set({
          boardOrientation: {
            flipped: color === 'b',
            playerColor: color,
          },
        })
      },

      toggleCoordinates: () => {
        set((state) => ({ showCoordinates: !state.showCoordinates }))
      },

      toggleLegalMoves: () => {
        set((state) => ({ showLegalMoves: !state.showLegalMoves }))
      },

      toggleLastMoveHighlight: () => {
        set((state) => ({ highlightLastMove: !state.highlightLastMove }))
      },

      toggleCheckHighlight: () => {
        set((state) => ({ highlightCheck: !state.highlightCheck }))
      },

      toggleDarkMode: () => {
        set((state) => ({ darkMode: !state.darkMode }))
      },

      toggleAnimations: () => {
        set((state) => ({ animateMoves: !state.animateMoves }))
      },

      setAnimationDuration: (duration) => {
        set({ animationDuration: duration })
      },
    }),
    { name: 'grandmaster:ui', storage: createJSONStorage(() => safeStorage) },
  ),
)
