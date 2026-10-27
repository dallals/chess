import React, { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import type { Color } from 'chess.js'
import { useGameStore, type GameStatus } from '../store/gameStore'
import { useAIStore } from '../store/aiStore'
import { useUIStore } from '../store/uiStore'
import { useSoundStore } from '../store/soundStore'
import { useClockStore, CLOCK_CONTROLS } from '../store/clockStore'
import { useGameLibraryStore, type SavedGame } from '../store/gameLibraryStore'
import type { Difficulty } from '../engine/ai'
import { ChessBoard2D } from './ChessBoard2D'
import { ChessBoard3D } from './ChessBoard3D'
import { ChessClock } from './ChessClock'
import { FenImportDialog } from './FenImportDialog'
import { GameOverModal } from './GameOverModal'

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'casual', label: 'Casual' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
]

const colorName = (color: Color | null) => (color === 'w' ? 'White' : 'Black')

/**
 * A saved game being replayed: every position after each ply, so stepping
 * is just loading the matching FEN (no sounds, no clock — pure review).
 */
interface Replay {
  id: string
  /** Position after each ply; index -1 (start) is held at `startFen`. */
  startFen: string
  fens: string[]
  ply: number
}

/** All positions of a saved PGN, start position first. */
function replayPositions(pgn: string): { startFen: string; fens: string[] } | null {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch {
    return null
  }
  const fens: string[] = []
  while (chess.history().length > 0) {
    fens.unshift(chess.fen())
    chess.undo()
  }
  return { startFen: chess.fen(), fens }
}

const STATUS_TONE: Record<GameStatus, 'neutral' | 'accent' | 'danger'> = {
  playing: 'neutral',
  checkmate: 'danger',
  stalemate: 'accent',
  draw: 'accent',
  resign: 'accent',
  timeout: 'danger',
}

const TONE_CLASS: Record<'neutral' | 'accent' | 'danger', string> = {
  neutral: 'text-ink-900 dark:text-cream-100',
  accent: 'text-brass-600 dark:text-brass-300',
  danger: 'text-blood-500 dark:text-blood-300',
}

function describeStatus(args: {
  status: GameStatus
  winner: Color | null
  turn: Color
  playerColor: Color
  inCheck: boolean
  isAiThinking: boolean
}): { text: string; sub: string } {
  const { status, winner, turn, playerColor, inCheck, isAiThinking } = args
  switch (status) {
    case 'checkmate':
      return { text: `Checkmate — ${colorName(winner)} wins`, sub: 'The opposition has fallen' }
    case 'timeout':
      return {
        text: `Time — ${colorName(winner)} wins`,
        sub: winner === playerColor ? 'The clock was your ally' : 'The flag fell',
      }
    case 'stalemate':
      return { text: 'Stalemate', sub: 'No legal moves — the game is drawn' }
    case 'draw':
      return { text: 'Draw', sub: 'Honor shared between both camps' }
    case 'resign':
      return { text: `You resigned — ${colorName(winner)} wins`, sub: 'The board was yielded' }
    default:
      if (turn !== playerColor)
        return {
          text: isAiThinking ? 'The AI is plotting…' : `AI to move (${colorName(turn)})`,
          sub: 'The opponent weighs its reply',
        }
      return {
        text: inCheck ? 'Check!' : `Your move (${colorName(turn)})`,
        sub: inCheck ? 'Your king is under attack' : 'Choose a piece and command it forward',
      }
  }
}

/**
 * Main Chess App Component
 */
export const App: React.FC = () => {
  const { mode, status, winner, turn, playerColor, fen, checkSquare, canUndo } = useGameStore()
  const { toggleMode, resetGame, undo, resign } = useGameStore()
  const gameOverDismissed = useGameStore((s) => s.gameOverDismissed)
  const reviewing = useGameStore((s) => s.reviewing)
  const { difficulty, isAiThinking, setDifficulty, makeAiMove } = useAIStore()
  const toggleBoardFlip = useUIStore((state) => state.toggleBoardFlip)
  const setPlayerColorUI = useUIStore((state) => state.setPlayerColor)
  const darkMode = useUIStore((state) => state.darkMode)
  const toggleDarkMode = useUIStore((state) => state.toggleDarkMode)
  const soundEnabled = useSoundStore((state) => state.enabled)
  const toggleSound = useSoundStore((state) => state.toggleSound)
  const getPgn = useGameStore((state) => state.getPgn)
  const clockControl = useClockStore((s) => s.control)
  const setClockControl = useClockStore((s) => s.setControl)
  const library = useGameLibraryStore((s) => s.games)
  const deleteGame = useGameLibraryStore((s) => s.deleteGame)
  const [showFenDialog, setShowFenDialog] = useState(false)
  const [pgnCopied, setPgnCopied] = useState(false)
  const [replay, setReplay] = useState<Replay | null>(null)

  /** Start stepping through a saved game from the library. */
  const startReplay = (game: SavedGame) => {
    const positions = replayPositions(game.pgn)
    if (!positions) return
    if (!useGameStore.getState().loadFenForReplay(positions.startFen)) return
    setReplay({ id: game.id, startFen: positions.startFen, fens: positions.fens, ply: -1 })
  }

  const stepReplay = (delta: number) => {
    if (!replay) return
    const ply = Math.max(-1, Math.min(replay.fens.length - 1, replay.ply + delta))
    if (ply === replay.ply) return
    setReplay({ ...replay, ply })
    useGameStore.getState().loadFenForReplay(ply < 0 ? replay.startFen : replay.fens[ply])
  }

  const exitReplay = () => {
    setReplay(null)
    useGameStore.getState().exitReview()
  }

  /** Start a fresh game, optionally as the given color. */
  const newGame = (color?: Color) => {
    const c = color ?? playerColor
    resetGame({ playerColor: c })
    setPlayerColorUI(c)
    setReplay(null)
  }

  const copyPgn = async () => {
    try {
      await navigator.clipboard.writeText(getPgn())
      setPgnCopied(true)
      setTimeout(() => setPgnCopied(false), 2000)
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fall back silently.
    }
  }

  // Let the AI reply whenever it is its turn (not while reviewing a saved game).
  useEffect(() => {
    if (status === 'playing' && turn !== playerColor && !reviewing) {
      void makeAiMove()
    }
  }, [fen, status, turn, playerColor, reviewing, makeAiMove])

  // Mirror dark mode onto <html> so html.dark rules in index.css apply to body.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const statusInfo = describeStatus({
    status,
    winner,
    turn,
    playerColor,
    inCheck: checkSquare !== null,
    isAiThinking,
  })
  const gameOver = status !== 'playing'
  const tone = STATUS_TONE[status]

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
      {/* ── Masthead ─────────────────────────────────────────────── */}
      <header className="relative border-b border-brass-600/30 bg-[#f4ecdd]/80 backdrop-blur dark:border-brass-500/25 dark:bg-walnut-900/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-brass-600/50 bg-gradient-to-b from-brass-400 to-brass-600 text-3xl text-[#1e1712] shadow-lift dark:border-brass-400/40 dark:from-brass-300 dark:to-brass-500 dark:text-walnut-950">
              ♞
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold uppercase tracking-[0.28em] text-brass-600 dark:text-brass-300">
                Grandmaster
              </h1>
              <p className="text-xs uppercase tracking-[0.2em] text-ink-700 dark:text-cream-500">
                A chess club in your browser
              </p>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Board view"
            className="flex items-center gap-0.5 rounded-sm border border-brass-600/40 bg-[#efe3c8] p-0.5 dark:border-brass-500/25 dark:bg-walnut-900"
          >
            <button
              role="tab"
              aria-selected={mode === '2d'}
              onClick={() => mode === '3d' && toggleMode()}
              className={`px-4 py-1.5 font-display text-xs uppercase tracking-[0.2em] transition ${
                mode === '2d' ? 'bg-brass-500 text-[#fff8ea] shadow-glow dark:bg-brass-300 dark:text-walnut-950' : 'text-ink-700 hover:text-brass-600 dark:text-cream-300 dark:hover:text-brass-100'
              }`}
            >
              2D
            </button>
            <button
              role="tab"
              aria-selected={mode === '3d'}
              onClick={() => mode === '2d' && toggleMode()}
              className={`px-4 py-1.5 font-display text-xs uppercase tracking-[0.2em] transition ${
                mode === '3d' ? 'bg-brass-500 text-[#fff8ea] shadow-glow dark:bg-brass-300 dark:text-walnut-950' : 'text-ink-700 hover:text-brass-600 dark:text-cream-300 dark:hover:text-brass-100'
              }`}
            >
              3D
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
              aria-pressed={soundEnabled}
              className={`flex h-10 w-10 items-center justify-center rounded-sm border transition ${
                soundEnabled
                  ? 'border-brass-600/30 bg-[#f4ecdd] text-ink-800 hover:border-brass-500/60 hover:text-brass-600 dark:border-brass-400/50 dark:bg-walnut-800 dark:text-brass-300 dark:hover:border-brass-300/70'
                  : 'border-brass-600/20 bg-[#efe3c8] text-ink-700/50 hover:text-ink-800 dark:border-brass-400/20 dark:bg-walnut-900 dark:text-cream-300/40 dark:hover:text-cream-200'
              }`}
            >
              {soundEnabled ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.664 12 4.084 12 5v14c0 .916-1.077 1.336-1.707.707L5.586 15z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.664 12 4.084 12 5v14c0 .916-1.077 1.336-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
            </button>

            <button
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
            className={`flex h-10 w-10 items-center justify-center rounded-sm border transition ${
              darkMode
                ? 'border-brass-400/50 bg-walnut-800 text-brass-300 shadow-glow hover:border-brass-300/70 hover:text-brass-200'
                : 'border-brass-600/30 bg-[#f4ecdd] text-ink-800 hover:border-brass-500/60 hover:text-brass-600'
            }`}
          >
            {darkMode ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
          {/* ── Game area ─────────────────────────────────────────── */}
          <div className="flex w-full flex-1 flex-col items-center">
            {mode === '2d' ? <ChessBoard2D /> : <ChessBoard3D />}

            {/* Clocks */}
            {!reviewing && (
              <div className="mt-4">
                <ChessClock />
              </div>
            )}

            {/* Status ribbon */}
            <div
              role="status"
              className="mt-6 flex w-full max-w-[min(80vw,480px)] items-baseline justify-between border border-cream-100/10 border-l-2 bg-[#f4ecdd]/90 px-4 py-3 shadow-panel transition-colors dark:border-brass-400/40 dark:border-l-4 dark:border-l-brass-400 dark:bg-walnut-800 dark:shadow-glow"
            >
              <div>
                <div className={`font-display text-lg ${TONE_CLASS[tone]}`}>{statusInfo.text}</div>
                <div className="mt-0.5 text-xs italic tracking-wide text-ink-700 dark:text-cream-300">{statusInfo.sub}</div>
              </div>
              {isAiThinking && !gameOver && (
                <span className="flex gap-1" aria-hidden>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-400" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-400 [animation-delay:200ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass-400 [animation-delay:400ms]" />
                </span>
              )}
            </div>

            {/* Replay controls (library review mode) */}
            {replay && (
              <div className="mt-4 flex w-full max-w-[min(80vw,480px)] items-center justify-between border border-brass-600/30 bg-[#f4ecdd]/90 px-4 py-2 dark:border-brass-400/40 dark:bg-walnut-800">
                <span className="font-display text-xs uppercase tracking-[0.2em] text-brass-600 dark:text-brass-300">
                  Replay · {Math.max(0, replay.ply + 1)}/{replay.fens.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <ReplayButton onClick={() => stepReplay(-1)} label="Previous move">◀</ReplayButton>
                  <ReplayButton onClick={() => stepReplay(1)} label="Next move">▶</ReplayButton>
                  <button
                    type="button"
                    onClick={exitReplay}
                    className="ml-2 border border-brass-600/30 px-3 py-1 font-display text-[10px] uppercase tracking-[0.15em] text-ink-700 transition hover:border-blood-500/60 hover:text-blood-500 dark:border-brass-400/30 dark:text-cream-300"
                  >
                    Exit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar ───────────────────────────────────────────── */}
          <aside className="w-full rounded-sm border border-brass-600/30 bg-[#f4ecdd]/90 shadow-panel lg:w-80 lg:shrink-0 dark:border-brass-500/20 dark:bg-walnut-900/80">
            <div className="border-b border-brass-600/20 px-5 py-4 dark:border-brass-500/20">
              <h2 className="font-display text-sm font-semibold uppercase tracking-[0.25em] text-brass-600 dark:text-brass-200">
                Game Controls
              </h2>
            </div>

            <div className="space-y-6 p-5">
              {/* Play as */}
              <div>
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-ink-700 dark:text-cream-300">
                  Play As
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['w', 'b'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => newGame(c)}
                      aria-pressed={playerColor === c}
                      className={`border px-3 py-2 font-display text-xs uppercase tracking-[0.15em] transition ${
                        playerColor === c
                          ? 'border-brass-500/70 bg-brass-500 text-[#fff8ea] shadow-glow dark:bg-brass-300 dark:text-walnut-950'
                          : 'border-brass-600/30 bg-[#efe3c8] text-ink-700 hover:border-brass-500/60 hover:text-brass-600 dark:border-brass-400/30 dark:bg-walnut-800 dark:text-cream-300 dark:hover:text-brass-300'
                      }`}
                    >
                      {c === 'w' ? '♔ White' : '♚ Black'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time control */}
              <div>
                <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-ink-700 dark:text-cream-300">
                  Time Control
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {CLOCK_CONTROLS.map((tc) => (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => setClockControl(tc.id)}
                      aria-pressed={clockControl === tc.id}
                      className={`border px-1 py-2 font-mono text-xs transition ${
                        clockControl === tc.id
                          ? 'border-brass-500/70 bg-brass-500/15 text-brass-600 dark:border-brass-300/60 dark:bg-brass-300/15 dark:text-brass-300'
                          : 'border-brass-600/25 bg-[#efe3c8] text-ink-700 hover:border-brass-500/50 dark:border-brass-400/25 dark:bg-walnut-800 dark:text-cream-300'
                      }`}
                    >
                      {tc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI opponent */}
              <div>
                <label
                  htmlFor="difficulty"
                  className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-ink-700 dark:text-cream-300"
                >
                  <span>Opponent</span>
                  <span className="text-brass-400 dark:text-brass-200 normal-case tracking-normal">{difficulty}</span>
                </label>
                <div className="relative">
                  <select
                    id="difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                    className="w-full cursor-pointer appearance-none border border-brass-600/40 bg-[#efe3c8] px-3 py-2.5 pr-9 text-sm text-ink-900 transition hover:border-brass-500/70 focus:border-brass-500 focus:outline-none focus:ring-1 focus:ring-brass-500/40 dark:border-brass-400/40 dark:bg-walnut-800 dark:text-cream-100 dark:hover:border-brass-300/60 dark:focus:border-brass-300 dark:focus:ring-brass-300/40"
                  >
                    {DIFFICULTIES.map((option) => (
                      <option key={option.value} value={option.value} className="bg-walnut-900 text-cream-100">
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brass-600 dark:text-brass-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2.5">
                <ActionButton onClick={() => resetGame()} tone="brass" primary>
                  <span className="mr-1.5" aria-hidden>♟</span> New Game
                </ActionButton>
                <ActionButton onClick={undo} disabled={!canUndo || isAiThinking} tone="wood">
                  <span className="mr-1.5" aria-hidden>↶</span> Undo
                </ActionButton>
                <ActionButton onClick={toggleBoardFlip} tone="wood">
                  <span className="mr-1.5" aria-hidden>⇅</span> Flip Board
                </ActionButton>
                <ActionButton onClick={resign} disabled={gameOver} tone="blood">
                  <span className="mr-1.5" aria-hidden>⚐</span> Resign
                </ActionButton>
              </div>

              {/* Share & load */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={copyPgn}
                  className="border border-brass-600/30 bg-[#efe3c8] px-3 py-2 font-display text-xs uppercase tracking-[0.15em] text-ink-700 transition hover:border-brass-500/60 hover:text-brass-600 dark:border-brass-400/30 dark:bg-walnut-800 dark:text-cream-300 dark:hover:border-brass-300/50 dark:hover:text-brass-300"
                >
                  {pgnCopied ? '✓ Copied' : 'Copy PGN'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFenDialog(true)}
                  className="border border-brass-600/30 bg-[#efe3c8] px-3 py-2 font-display text-xs uppercase tracking-[0.15em] text-ink-700 transition hover:border-brass-500/60 hover:text-brass-600 dark:border-brass-400/30 dark:bg-walnut-800 dark:text-cream-300 dark:hover:border-brass-300/50 dark:hover:text-brass-300"
                >
                  Load FEN
                </button>
              </div>

              {/* Move history */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-700 dark:text-brass-200">
                  <span className="h-px flex-1 bg-brass-600/30 dark:bg-brass-400/40" aria-hidden />
                  <span>Move History</span>
                  <span className="h-px flex-1 bg-brass-600/30 dark:bg-brass-400/40" aria-hidden />
                </h3>
                <div className="h-48 overflow-y-auto border border-brass-600/20 bg-[#efe3c8]/80 p-3 dark:border-brass-400/30 dark:bg-ink-950 dark:shadow-panel">
                  <MoveHistory />
                </div>
              </div>

              {/* Game library */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-700 dark:text-brass-200">
                  <span className="h-px flex-1 bg-brass-600/30 dark:bg-brass-400/40" aria-hidden />
                  <span>Game Library</span>
                  <span className="h-px flex-1 bg-brass-600/30 dark:bg-brass-400/40" aria-hidden />
                </h3>
                <div className="h-48 overflow-y-auto border border-brass-600/20 bg-[#efe3c8]/80 p-2 dark:border-brass-400/30 dark:bg-ink-950 dark:shadow-panel">
                  {library.length === 0 ? (
                    <div className="py-6 text-center text-sm italic text-ink-700/60 dark:text-cream-300/70">
                      Finished games are archived here…
                    </div>
                  ) : (
                    library.map((g) => (
                      <div
                        key={g.id}
                        className="group flex items-center gap-2 border-b border-ink-900/10 py-2 last:border-0 dark:border-cream-500/10"
                      >
                        <button
                          type="button"
                          onClick={() => startReplay(g)}
                          className="flex-1 text-left"
                          title="Replay this game"
                        >
                          <div className="truncate text-xs text-ink-800 dark:text-cream-100">{g.result}</div>
                          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-700/60 dark:text-cream-300/60">
                            {new Date(g.date).toLocaleDateString()} · {Math.ceil(g.moveCount / 2)} moves · {g.difficulty} · as {g.playerColor === 'w' ? 'White' : 'Black'}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGame(g.id)}
                          aria-label="Delete game"
                          className="px-1.5 text-ink-700/40 transition hover:text-blood-500 dark:text-cream-300/40 dark:hover:text-blood-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-brass-600/20 py-6 text-center text-xs italic tracking-wide text-ink-700/70 dark:border-brass-500/20 dark:text-cream-300/70">
        ♟ Let the game be what you make of it.
      </footer>

      {gameOver && !gameOverDismissed && !reviewing && <GameOverModal onNewGame={() => newGame()} />}
      {showFenDialog && <FenImportDialog onClose={() => setShowFenDialog(false)} />}
    </div>
  )
}

/**
 * Sidebar action button with a few characterful tones.
 */
const ReplayButton: React.FC<{ onClick: () => void; label: string; children: React.ReactNode }> = ({
  onClick,
  label,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="border border-brass-600/40 bg-[#efe3c8] px-3 py-1 text-xs text-ink-800 transition hover:border-brass-500/70 hover:text-brass-600 dark:border-brass-400/40 dark:bg-walnut-900 dark:text-cream-200 dark:hover:text-brass-300"
  >
    {children}
  </button>
)

interface ActionButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone: 'brass' | 'wood' | 'blood'
  primary?: boolean
}

const ACTION_TONES = {
  brass: 'border-brass-600/50 bg-gradient-to-b from-brass-400 to-brass-600 text-[#fff8ea] shadow-glow hover:from-brass-300 hover:to-brass-500 hover:shadow-lift dark:border-brass-400/40 dark:from-brass-300 dark:to-brass-500 dark:text-walnut-950 dark:hover:from-brass-200 dark:hover:to-brass-400',
  wood: 'border-ink-900/10 bg-gradient-to-b from-[#f4ecdd] to-[#e9dcc4] text-ink-800 hover:border-brass-500/50 hover:from-[#f4ecdd] hover:text-brass-600 dark:border-walnut-500/50 dark:from-walnut-700 dark:to-walnut-850 dark:text-cream-200 dark:hover:border-brass-400/50 dark:hover:text-brass-300',
  blood: 'border-blood-500/40 bg-gradient-to-b from-blood-500 to-blood-600 text-cream-100 hover:from-blood-400 hover:text-white dark:border-blood-500/50 dark:from-blood-600 dark:to-blood-700 dark:hover:from-blood-500',
}

const ActionButton: React.FC<ActionButtonProps> = ({ children, onClick, disabled, tone, primary }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full border px-4 py-2.5 font-display text-sm uppercase tracking-[0.15em] transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 ${ACTION_TONES[tone]} ${
      primary ? 'text-base' : ''
    }`}
  >
    {children}
  </button>
)

/**
 * Move History Component
 */
const MoveHistory: React.FC = () => {
  const moveList = useGameStore((state) => state.moveList)

  if (moveList.length === 0) {
    return <div className="py-6 text-center text-sm italic text-ink-700/60 dark:text-cream-300/70">The story is yet to be written…</div>
  }

  const rows = []
  for (let i = 0; i < moveList.length; i += 2) {
    rows.push(
      <div key={i} className="flex items-center gap-2 border-b border-ink-900/10 py-1.5 last:border-0 dark:border-cream-500/10">
        <span className="w-6 shrink-0 text-right font-mono text-xs text-brass-600/80 dark:text-brass-300/70">{Math.floor(i / 2) + 1}.</span>
        <span className="flex-1 text-sm text-ink-800 dark:text-cream-100">{moveList[i].san}</span>
        {moveList[i + 1] ? <span className="flex-1 text-sm text-ink-800 dark:text-cream-100">{moveList[i + 1].san}</span> : <span />}
      </div>,
    )
  }

  return <div>{rows}</div>
}
