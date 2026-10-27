import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Chess } from 'chess.js'
import { ChessAI, type Difficulty } from '../engine/ai'
import { useGameStore, type PromotionPiece } from './gameStore'
import { safeStorage } from './storage'

export interface AIState {
  difficulty: Difficulty
  isAiThinking: boolean

  // Actions
  setDifficulty: (difficulty: Difficulty) => void
  /** Plays the AI's move if it is the AI's turn. Resolves once the move is on the board. */
  makeAiMove: () => Promise<void>
}

const ai = new ChessAI('casual')

/** Short pause before searching so the "thinking" indicator gets painted. */
const THINK_DELAY_MS = 300

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      difficulty: 'casual',
      isAiThinking: false,

      setDifficulty: (difficulty) => {
        ai.setDifficulty(difficulty)
        set({ difficulty })
      },

      makeAiMove: async () => {
        if (get().isAiThinking) return

        const { fen, status, turn, playerColor, reviewing } = useGameStore.getState()
        if (status !== 'playing' || turn === playerColor || reviewing) return

        set({ isAiThinking: true })
        try {
          await new Promise((resolve) => setTimeout(resolve, THINK_DELAY_MS))

          const best = ai.findBestMove(new Chess(fen))

          // The game may have been reset or undone while the AI was thinking.
          const current = useGameStore.getState()
          if (best && current.fen === fen && current.status === 'playing') {
            current.makeMove({
              from: best.from,
              to: best.to,
              promotion: best.promotion as PromotionPiece | undefined,
            })
          }
        } finally {
          set({ isAiThinking: false })
        }
      },
    }),
    {
      name: 'grandmaster:ai',
      storage: createJSONStorage(() => safeStorage),
      // The thinking flag is transient — never persist it.
      partialize: (state) => ({ difficulty: state.difficulty }),
    },
  ),
)

// Re-apply the persisted difficulty to the engine instance on load.
ai.setDifficulty(useAIStore.getState().difficulty)
