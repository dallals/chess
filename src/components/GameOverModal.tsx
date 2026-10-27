import React, { useEffect } from 'react'
import type { Color } from 'chess.js'
import { useGameStore, type GameStatus } from '../store/gameStore'
import { useGameLibraryStore } from '../store/gameLibraryStore'
import { useAIStore } from '../store/aiStore'

const colorName = (color: Color | null) => (color === 'w' ? 'White' : 'Black')

function outcome(status: GameStatus, winner: Color | null, playerColor: Color): { title: string; sub: string } {
  switch (status) {
    case 'checkmate':
      return {
        title: `Checkmate — ${colorName(winner)} wins`,
        sub: winner === playerColor ? 'Victory is yours.' : 'The machine claims the board.',
      }
    case 'timeout':
      return {
        title: `Flag fell — ${colorName(winner)} wins`,
        sub: 'Time ran out on the clock.',
      }
    case 'resign':
      return {
        title: `${colorName(playerColor)} resigned`,
        sub: 'The board was yielded with honor intact.',
      }
    case 'stalemate':
      return { title: 'Stalemate', sub: 'No legal moves — half a point each.' }
    case 'draw':
      return { title: 'Draw', sub: 'Honors even between both camps.' }
    default:
      return { title: 'Game over', sub: '' }
  }
}

/**
 * Shown when the game ends. Offers New Game or a look at the board
 * (dismissible); finished games are saved to the library.
 */
export const GameOverModal: React.FC<{ onNewGame: () => void }> = ({ onNewGame }) => {
  const status = useGameStore((s) => s.status)
  const winner = useGameStore((s) => s.winner)
  const playerColor = useGameStore((s) => s.playerColor)
  const dismiss = useGameStore((s) => s.dismissGameOver)
  const difficulty = useAIStore((s) => s.difficulty)
  const saveGame = useGameLibraryStore((s) => s.saveGame)

  // Persist the finished game once.
  useEffect(() => {
    if (status === 'playing') return
    const { winner: w, status: st, playerColor: pc, getPgn: pgn, moveList: ml } = useGameStore.getState()
    saveGame({
      pgn: pgn(),
      result: outcome(st, w, pc).title,
      playerColor: pc,
      difficulty,
      moveCount: ml.length,
    })
  }, [status, saveGame, difficulty])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  const { title, sub } = outcome(status, winner, playerColor)
  const won = winner === playerColor
  const drawn = winner === null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
    >
      <div className="w-full max-w-md border border-brass-600/40 bg-[#f4ecdd] p-8 text-center shadow-lift dark:border-brass-400/40 dark:bg-walnut-900">
        <div className="text-5xl" aria-hidden>
          {drawn ? '⬌' : won ? '♔' : '♚'}
        </div>
        <h2 className="mt-4 font-display text-xl uppercase tracking-[0.2em] text-brass-600 dark:text-brass-300">
          {title}
        </h2>
        <p className="mt-2 text-sm italic text-ink-700 dark:text-cream-300">{sub}</p>

        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="border border-brass-600/30 px-4 py-2 font-display text-xs uppercase tracking-[0.15em] text-ink-700 transition hover:border-brass-500/60 hover:text-brass-600 dark:border-brass-400/30 dark:text-cream-300 dark:hover:text-brass-300"
          >
            Review Board
          </button>
          <button
            type="button"
            onClick={onNewGame}
            className="border border-brass-600/50 bg-gradient-to-b from-brass-400 to-brass-600 px-5 py-2 font-display text-xs uppercase tracking-[0.15em] text-[#fff8ea] shadow-glow transition hover:from-brass-300 hover:to-brass-500 dark:border-brass-400/40 dark:from-brass-300 dark:to-brass-500 dark:text-walnut-950"
          >
            New Game
          </button>
        </div>
      </div>
    </div>
  )
}
