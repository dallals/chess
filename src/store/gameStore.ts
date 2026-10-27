import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { useSoundStore } from './soundStore'
import { useClockStore } from './clockStore'
import { safeStorage } from './storage'

export type GameMode = '2d' | '3d'
export type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw' | 'resign' | 'timeout'
export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export interface MoveInput {
  from: Square
  to: Square
  /** Piece to promote to. Defaults to a queen when the move is a promotion. */
  promotion?: PromotionPiece
}

export interface MoveRecord {
  san: string
  fen: string
}

/** Standard piece values in pawns, for the captured-material ledger. */
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

/** Everything a side has taken off the board, in order, plus its pawn value. */
export interface CapturedMaterial {
  /** Captured piece types in capture order (e.g. ['p','n','p']). */
  pieces: PieceSymbol[]
  points: number
}

export function materialOf(pieces: PieceSymbol[]): CapturedMaterial {
  return { pieces, points: pieces.reduce((sum, p) => sum + PIECE_VALUES[p], 0) }
}

/** A human click landed on a promotion square — the piece must be chosen. */
export interface PendingPromotion {
  from: Square
  to: Square
}

export interface GameState {
  // Core game state
  fen: string
  turn: Color
  moveList: MoveRecord[]

  // Game settings
  mode: GameMode
  playerColor: Color

  // UI state
  selectedSquare: Square | null
  legalMoves: Square[]
  /** Set when a human click needs a promotion piece choice before the move plays. */
  pendingPromotion: PendingPromotion | null
  lastMove: { from: Square; to: Square } | null
  checkSquare: Square | null

  /**
   * Material each side has captured off the board.
   * whiteCaptured = black pieces taken by White (shown beside White's side).
   */
  whiteCaptured: CapturedMaterial
  blackCaptured: CapturedMaterial

  // Game result
  status: GameStatus
  winner: Color | null
  /** True while replaying a saved game from the library: no AI, no clicks. */
  reviewing: boolean
  /** True once the player closes the game-over dialog for the current result. */
  gameOverDismissed: boolean
  canUndo: boolean
  canRedo: boolean

  // Actions
  /** Plays a move for whichever side is to move. Returns false if it is illegal. */
  makeMove: (move: MoveInput) => boolean
  /** PGN of the current game, for export/copy. */
  getPgn: () => string
  /** Loads a position from FEN. Returns false (and changes nothing) if invalid. */
  loadFen: (fen: string) => boolean
  /** Loads a position for replay review (board becomes a viewer). */
  loadFenForReplay: (fen: string) => boolean
  /** The given side ran out of time; ends the game in favour of the opponent. */
  flagFell: (color: Color) => void
  /** Takes back moves until it is the player's turn again. */
  undo: () => void
  redo: () => void
  resign: () => void
  resetGame: (options?: { mode?: GameMode; playerColor?: Color }) => void
  toggleMode: () => void
  /** Handles a board click for the human player. */
  selectSquare: (square: Square) => void
  /** Close the game-over dialog for the current result. */
  dismissGameOver: () => void
  /** Leave replay mode; the next new game starts fresh. */
  exitReview: () => void
  /** Step back/forward to an index in the move history (0 = start-of-game index+1). */
  jumpToPly: (ply: number) => void
  /** Completes a pending promotion with the chosen piece. */
  choosePromotion: (piece: PromotionPiece) => void
  /** Abandons a pending promotion (keeps the pawn on the seventh). */
  cancelPromotion: () => void
  clearSelection: () => void
}

// The live game. Keeping one instance (instead of rebuilding from FEN on every
// action) preserves the move history needed for repetition and PGN.
const game = new Chess()
let redoStack: Move[] = []

function findKing(chess: Chess, color: Color): Square | null {
  return chess.findPiece({ type: 'k', color })[0] ?? null
}

function lastPlayedMove(chess: Chess): Move | null {
  const history = chess.history({ verbose: true })
  return history.length ? history[history.length - 1] : null
}

/** Captured material for both sides, rebuilt from the move history. */
function deriveCaptures(chess: Chess) {
  const white: PieceSymbol[] = []
  const black: PieceSymbol[] = []
  for (const m of chess.history({ verbose: true })) {
    if (!m.captured) continue
    if (m.color === 'w') white.push(m.captured)
    else black.push(m.captured)
  }
  return { whiteCaptured: materialOf(white), blackCaptured: materialOf(black) }
}

/** Everything in the store that is derived from the position. */
function deriveState(chess: Chess) {
  const turn = chess.turn()
  const last = lastPlayedMove(chess)

  let status: GameStatus = 'playing'
  let winner: Color | null = null
  if (chess.isCheckmate()) {
    status = 'checkmate'
    winner = turn === 'w' ? 'b' : 'w'
  } else if (chess.isStalemate()) {
    status = 'stalemate'
  } else if (chess.isDraw()) {
    status = 'draw'
  }

  return {
    fen: chess.fen(),
    turn,
    moveList: chess.history({ verbose: true }).map((m) => ({ san: m.san, fen: m.after })),
    lastMove: last ? { from: last.from, to: last.to } : null,
    checkSquare: chess.inCheck() ? findKing(chess, turn) : null,
    ...deriveCaptures(chess),
    status,
    winner,
    selectedSquare: null,
    legalMoves: [] as Square[],
    pendingPromotion: null,
    gameOverDismissed: false,
    canUndo: chess.history().length > 0,
    canRedo: redoStack.length > 0,
  }
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => {
      /** Play the cue matching the move that was just made. */
      function soundForMove(move: Move) {
        const sounds = useSoundStore.getState()
        if (game.isCheckmate()) sounds.playCheckmate()
        else if (move.promotion) sounds.playPromotion()
        else if (move.flags.includes('e') || move.captured) sounds.playCapture()
        else if (game.isStalemate()) sounds.playStalemate()
        else if (game.inCheck()) sounds.playCheck()
        else sounds.playMove()
      }

      return {
        ...deriveState(game),
        mode: '2d',
        playerColor: 'w',
        gameOverDismissed: false,
        reviewing: false,

        dismissGameOver: () => set({ gameOverDismissed: true }),

        exitReview: () => set({ reviewing: false }),

        /** Replay the game up to `ply` plies (0 = starting position). */
        jumpToPly: (ply) => {
          const target = Math.max(0, Math.min(ply, game.history().length + redoStack.length))
          while (game.history().length > target) {
            const undone = game.undo()
            if (!undone) break
            redoStack.push(undone)
          }
          while (game.history().length < target && redoStack.length > 0) {
            const m = redoStack.pop()!
            game.move(m.san)
          }
          set(deriveState(game))
        },

        getPgn: () => game.pgn(),

        loadFen: (fen) => {
          try {
            game.load(fen)
          } catch {
            return false
          }
          redoStack = []
          set(deriveState(game))
          return true
        },

        loadFenForReplay: (fen) => {
          // Like loadFen, but marks the board as a review viewer (no sounds).
          const ok = get().loadFen(fen)
          if (ok) set({ reviewing: true })
          return ok
        },

        makeMove: (input) => {
          if (get().status !== 'playing') return false

          const wanted = input.promotion ?? 'q'
          const legal = game
            .moves({ square: input.from, verbose: true })
            .find((m) => m.to === input.to && (!m.promotion || m.promotion === wanted))
          if (!legal) return false

          const move = game.move(legal.san)
          redoStack = []
          set(deriveState(game))
          soundForMove(move)

          // Hand the clock to the opponent (with increment); flag fall ends it.
          const clock = useClockStore.getState()
          clock.onTurnChange(game.turn(), move.color, get().status === 'playing')
          if (game.isCheckmate() || game.isStalemate() || game.isDraw()) clock.stop()
          return true
        },

        /** The given side ran out of time. */
        flagFell: (color) => {
          if (get().status !== 'playing') return
          useClockStore.getState().stop()
          set({
            status: 'timeout',
            winner: color === 'w' ? 'b' : 'w',
            gameOverDismissed: false,
            selectedSquare: null,
            legalMoves: [],
            pendingPromotion: null,
          })
          useSoundStore.getState().playCheckmate()
        },

  undo: () => {
    const { playerColor } = get()
    const undone = game.undo()
    if (!undone) return
    redoStack.push(undone)

    // Also take back the opponent's reply so the player is to move again.
    while (game.turn() !== playerColor) {
      const previous = game.undo()
      if (!previous) break
      redoStack.push(previous)
    }

    set({ ...deriveState(game), gameOverDismissed: false })
  },

  redo: () => {
    if (redoStack.length === 0) return
    const { playerColor } = get()

    do {
      game.move(redoStack.pop()!.san)
    } while (redoStack.length > 0 && game.turn() !== playerColor)

    set(deriveState(game))
  },

  resign: () => {
    const { status, playerColor } = get()
    if (status !== 'playing') return
    useClockStore.getState().stop()
    set({
      status: 'resign',
      winner: playerColor === 'w' ? 'b' : 'w',
      selectedSquare: null,
      legalMoves: [],
      pendingPromotion: null,
    })
  },

  resetGame: (options = {}) => {
    game.reset()
    redoStack = []
    useClockStore.getState().resetClock()
    set({
      ...deriveState(game),
      mode: options.mode ?? get().mode,
      playerColor: options.playerColor ?? get().playerColor,
    })
  },

  toggleMode: () => {
    set((state) => ({ mode: state.mode === '2d' ? '3d' : '2d' }))
  },

  selectSquare: (square) => {
    const { selectedSquare, legalMoves, pendingPromotion, status, turn, playerColor, reviewing } = get()
    if (status !== 'playing' || turn !== playerColor || reviewing) return

    // A promotion dialog is open: clicking anywhere else cancels it.
    if (pendingPromotion) {
      set({ pendingPromotion: null })
    }

    // Clicking the selected square again deselects it
    if (selectedSquare === square) {
      set({ selectedSquare: null, legalMoves: [] })
      return
    }

    // Clicking a highlighted destination plays the move — or pauses for a
    // promotion choice when the move can promote to more than a queen.
    if (selectedSquare && legalMoves.includes(square)) {
      const isPromotion = game
        .moves({ square: selectedSquare, verbose: true })
        .some((m) => m.to === square && m.promotion)
      if (isPromotion) {
        set({ pendingPromotion: { from: selectedSquare, to: square } })
        return
      }
      get().makeMove({ from: selectedSquare, to: square })
      return
    }

    // Otherwise select one of the player's own pieces (or clear the selection)
    const piece = game.get(square)
    if (piece && piece.color === turn) {
      set({
        selectedSquare: square,
        // De-duplicate: the four promotion choices share one destination
        legalMoves: Array.from(new Set(game.moves({ square, verbose: true }).map((m) => m.to))),
      })
    } else {
      set({ selectedSquare: null, legalMoves: [] })
    }
  },

  choosePromotion: (piece) => {
    const { pendingPromotion, makeMove } = get()
    if (!pendingPromotion) return
    set({ pendingPromotion: null })
    makeMove({ from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece })
  },

  cancelPromotion: () => {
    // Keep the selection so the player can pick another destination.
    set({ pendingPromotion: null })
  },

    clearSelection: () => {
      set({ selectedSquare: null, legalMoves: [], pendingPromotion: null })
    },
      }
    },
    {
      name: 'grandmaster:game',
      storage: createJSONStorage(() => safeStorage),
      // Only the persistent knobs; the board itself is rehydrated from `fen`
      // via onRehydrateStorage below.
      partialize: ({ mode, playerColor, fen, status, winner }) => ({
        mode,
        playerColor,
        fen,
        status,
        winner,
      }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        // The live chess.js instance is module-level, so restore it from the
        // persisted FEN, then re-derive everything from it.
        if (!state?.fen) return
        let restored = true
        try {
          game.load(state.fen)
        } catch {
          game.reset()
          restored = false
        }
        redoStack = []
        const derived = deriveState(game)
        // A game that was over (e.g. resigned or flagged) stays over after a
        // refresh, even though the position itself still allows moves.
        const ended =
          state.status === 'resign' ||
          state.status === 'timeout' ||
          (state.status !== 'playing' && derived.status === 'playing')
        useGameStore.setState({
          ...derived,
          ...(ended ? { status: state.status, winner: state.winner ?? derived.winner } : {}),
          ...(restored ? {} : { fen: game.fen(), status: 'playing' as GameStatus, winner: null }),
        })
      },
    },
  ),
)
