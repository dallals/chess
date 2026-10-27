import React, { useEffect, useRef, useState } from 'react'
import type { Square } from 'chess.js'
import { useGameStore, type CapturedMaterial, type PromotionPiece } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import { diffMoves } from '../utils/fenDiff'

/** How long the piece glides from square to square (ms). */
const MOVE_ANIMATION_MS = 620
/** Brief pause at the start square before the glide begins (ms). */
const GLIDE_DELAY_MS = 60

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const

interface BoardSquare {
  id: Square
  /** FEN piece letter (upper case = white), or null for an empty square */
  piece: string | null
}

/** A piece gliding from one square to the next while a move plays out. */
interface Flight {
  key: string
  piece: string
  from: Square
  to: Square
  /** True until the piece lands; the target square then shows its final piece. */
  landed: boolean
}

/**
 * 2D Chess Board Component
 * Renders a flat, top-down chess board with a walnut frame and brass coordinates.
 */
export const ChessBoard2D: React.FC = () => {
  const { fen, turn, selectedSquare, legalMoves, lastMove, checkSquare, pendingPromotion, selectSquare, whiteCaptured, blackCaptured } = useGameStore()
  const { boardOrientation, showCoordinates, showLegalMoves, highlightLastMove, highlightCheck } = useUIStore()

  const [flights, setFlights] = useState<Flight[]>([])
  const prevFenRef = useRef(fen)
  const boardRef = useRef<HTMLDivElement>(null)

  // When the position changes, glide every moved piece from its old square.
  useEffect(() => {
    const prev = prevFenRef.current
    prevFenRef.current = fen
    if (prev === fen) return

    const { moves } = diffMoves(prev, fen)
    if (moves.length === 0) {
      setFlights([])
      return
    }
    // A single move (or a castling's two glides) animates; a larger jump —
    // e.g. starting a new game from a mid-game position — snaps instead.
    if (moves.length > 2) {
      setFlights([])
      return
    }

    const next = moves.map((move, index) => ({
      key: `${move.from}-${move.to}-${index}-${Date.now()}`,
      piece: move.piece,
      from: move.from,
      to: move.to,
      landed: false,
    }))
    setFlights(next)

    let cancelled = false
    const timers = next.map((flight) =>
      window.setTimeout(() => {
        if (cancelled) return
        setFlights((current) => current.map((f) => (f.key === flight.key ? { ...f, landed: true } : f)))
      }, GLIDE_DELAY_MS + MOVE_ANIMATION_MS + 30),
    )
    const endTimer = window.setTimeout(() => {
      if (cancelled) return
      setFlights([])
    }, GLIDE_DELAY_MS + MOVE_ANIMATION_MS + 70)
    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
      window.clearTimeout(endTimer)
    }
  }, [fen])

  const flipped = boardOrientation.flipped
  const squares = getBoardSquares(fen, flipped)
  const files = flipped ? [...FILES].reverse() : [...FILES]
  const ranks = flipped ? [...RANKS].reverse() : [...RANKS]
  // Squares where the arrival is still in flight — hide their final piece until it lands.
  const inFlight = new Map(flights.filter((f) => !f.landed).map((f) => [f.to, f] as const))

  // Material advantage: positive means White is ahead in captured points.
  const pointDiff = whiteCaptured.points - blackCaptured.points
  // Tray beside the player's side of the board (what that side has captured).
  const playerMaterial = flipped ? blackCaptured : whiteCaptured
  const opponentMaterial = flipped ? whiteCaptured : blackCaptured
  const playerAdvantage = flipped ? -pointDiff : pointDiff

  return (
    <div className="select-none">
      <div className="flex">
        {showCoordinates && (
          <div className="flex w-5 flex-col font-mono text-xs text-brass-600/90 dark:text-brass-300/70">
            {ranks.map((rank) => (
              <div key={rank} className="flex flex-1 items-center justify-center">
                {rank}
              </div>
            ))}
          </div>
        )}

        <div className="flex w-[min(92vw,58vh)] items-center justify-center xl:w-[min(92vw,68vh,720px)]">
          {/* Opponent's capture column: pieces THEY took (your colour) */}
          <CaptureTray
            material={opponentMaterial}
            advantage={-playerAdvantage}
            capturedColor={opponentMaterial === blackCaptured ? 'w' : 'b'}
          />

          <div
            ref={boardRef}
            className="relative aspect-square w-full min-w-0 flex-1 overflow-hidden rounded-sm border-[6px] border-walnut-700 shadow-board ring-1 ring-brass-600/40 dark:border-walnut-600 dark:ring-brass-400/20"
          >
            <div className="grid h-full w-full grid-cols-8 grid-rows-8">
              {squares.map((square) => (
                <BoardSquareView
                  key={square.id}
                  square={square}
                  isSelected={selectedSquare === square.id}
                  isLegalMove={showLegalMoves && legalMoves.includes(square.id)}
                  isLastMove={highlightLastMove && (lastMove?.from === square.id || lastMove?.to === square.id)}
                  isCheck={highlightCheck && checkSquare === square.id}
                  hidePiece={inFlight.has(square.id)}
                  onSelect={selectSquare}
                />
              ))}
            </div>

            {/* Gliding pieces — rendered on top of every square */}
            {flights.map((flight) => (
              <GlidingPiece
                key={flight.key}
                flight={flight}
                durationMs={MOVE_ANIMATION_MS}
                delayMs={GLIDE_DELAY_MS}
                boardRef={boardRef}
              />
            ))}

            {/* Promotion picker — dim scrim + piece choices over the square */}
            {pendingPromotion && (
              <PromotionPicker
                square={pendingPromotion.to}
                color={turn === 'w' ? 'w' : 'b'}
                flipped={flipped}
              />
            )}

            {/* Brass corner studs on the frame */}
            <span aria-hidden className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brass-400/70" />
            <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brass-400/70" />
            <span aria-hidden className="absolute bottom-1.5 left-1.5 h-1.5 w-1.5 rounded-full bg-brass-400/70" />
            <span aria-hidden className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-brass-400/70" />
          </div>

          {/* Player's capture column: pieces THEY took (opponent's colour) */}
          <CaptureTray
            material={playerMaterial}
            advantage={playerAdvantage}
            capturedColor={playerMaterial === whiteCaptured ? 'b' : 'w'}
          />
        </div>
      </div>

      {showCoordinates && (
        <div className="ml-5 flex w-[min(92vw,58vh)] font-mono text-xs text-brass-600/90 dark:text-brass-300/70 xl:w-[min(92vw,68vh,720px)]">
          {files.map((file) => (
            <div key={file} className="flex-1 text-center">
              {file}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Expand the piece-placement field of a FEN into 64 squares, top-left first.
 */
function getBoardSquares(fen: string, flipped: boolean): BoardSquare[] {
  const squares: BoardSquare[] = []
  const rows = fen.split(' ')[0].split('/')

  rows.forEach((row, rowIndex) => {
    const rank = 8 - rowIndex
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < Number(char); i++) {
          squares.push({ id: `${FILES[file]}${rank}` as Square, piece: null })
          file++
        }
      } else {
        squares.push({ id: `${FILES[file]}${rank}` as Square, piece: char })
        file++
      }
    }
  })

  return flipped ? squares.reverse() : squares
}

interface SquareProps {
  square: BoardSquare
  isSelected: boolean
  isLegalMove: boolean
  isLastMove: boolean
  isCheck: boolean
  /** Hide the piece while it is still gliding in from another square. */
  hidePiece: boolean
  onSelect: (square: Square) => void
}

const BoardSquareView: React.FC<SquareProps> = React.memo(
  ({ square, isSelected, isLegalMove, isLastMove, isCheck, hidePiece, onSelect }) => {
    const file = square.id.charCodeAt(0) - 'a'.charCodeAt(0)
    const rank = Number(square.id[1]) - 1
    // a1 is a dark square
    const isLight = (file + rank) % 2 === 1

    const background = isLight ? 'bg-board-light' : 'bg-board-dark'
    const pieceColor = square.piece ? getPieceColor(square.piece) : null
    const label = square.piece
      ? `${pieceColor === 'w' ? 'White' : 'Black'} ${getPieceName(square.piece)} on ${square.id}`
      : square.id

    return (
      <button
        type="button"
        aria-label={label}
        data-square={square.id}
        onClick={() => onSelect(square.id)}
        className={`relative flex aspect-square w-full items-center justify-center text-[clamp(34px,8.2vmin,58px)] leading-none transition-[filter,box-shadow] duration-150 hover:brightness-110 ${background} ${
          isSelected ? 'z-10 ring-4 ring-inset ring-brass-300' : ''
        }`}
      >
        {/* Last move tint */}
        {isLastMove && <span aria-hidden className="pointer-events-none absolute inset-0 bg-brass-400/30 dark:bg-brass-300/20" />}

        {/* Check pulse */}
        {isCheck && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle,rgba(208,90,66,0.75)_0%,rgba(208,90,66,0.25)_55%,transparent_75%)] dark:bg-[radial-gradient(circle,rgba(231,76,60,0.75)_0%,rgba(231,76,60,0.25)_55%,transparent_75%)]"
          />
        )}

        {square.piece && !hidePiece && (
          <span
            className={`relative ${
              pieceColor === 'w'
                ? 'text-cream-100 [text-shadow:0_2px_0_rgba(60,40,20,0.85),0_3px_8px_rgba(0,0,0,0.4)]'
                : 'text-[#0f0c0a] [text-shadow:0_1px_0_rgba(255,255,255,0.18),0_2px_8px_rgba(0,0,0,0.6)]'
            }`}
          >
            {getPieceSymbol(square.piece)}
          </span>
        )}

        {/* Legal move indicator */}
        {isLegalMove && !square.piece && (
          <span className="absolute h-1/4 w-1/4 rounded-full bg-brass-400/70 shadow-glow dark:bg-brass-300/60" />
        )}

        {/* Capture indicator */}
        {isLegalMove && square.piece && (
          <span className="pointer-events-none absolute inset-0 rounded-full border-4 border-brass-300/80 dark:border-brass-200/60" />
        )}
      </button>
    )
  },
)
BoardSquareView.displayName = 'BoardSquareView'

function getPieceColor(piece: string): 'w' | 'b' {
  return piece === piece.toUpperCase() ? 'w' : 'b'
}

/** Display order for captured pieces: most valuable first. */
const CAPTURE_ORDER: Record<string, number> = { q: 0, r: 1, b: 2, n: 3, p: 4 }

/**
 * The ledger of pieces one side has taken off the board: captured pieces
 * rendered as graphics (Cburnett SVGs from public/pieces), in rank-guaranteed
 * rows beside the board, heaviest first, plus the point-advantage badge when
 * ahead. Pieces that promoted are shown by their new piece type, since that
 * is the unit that left the board.
 */
const MAX_ROWS = 8 // 8 pawns max per side can be captured
const CELL_SIZE = 24

const CaptureTray: React.FC<{
  material: CapturedMaterial
  /** Positive when this tray's owner is ahead in captured points. */
  advantage: number
  /** Colour of the pieces in this tray (the loser's colour). */
  capturedColor: 'w' | 'b'
}> = ({ material, advantage, capturedColor }) => {
  const pieces = [...material.pieces].sort((a, b) => CAPTURE_ORDER[a] - CAPTURE_ORDER[b])
  // Eight ranks of capture, grouped by piece type (each holds up to 8 pawns,
  // up to 2 rooks/bishops/knights, 1 queen/king) so nothing wraps or shifts.
  const groups: string[][] = []
  for (const piece of pieces) {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup[0] === piece && lastGroup.length < 8) lastGroup.push(piece)
    else groups.push([piece])
  }

  return (
    <div
      className="flex h-full shrink-0 flex-col justify-start gap-1 rounded-md border border-walnut-700/40 bg-walnut-800/30 p-1 shadow-inner dark:border-walnut-500/30 dark:bg-walnut-900/50"
      style={{ width: CELL_SIZE + 8, minHeight: MAX_ROWS * (CELL_SIZE + 4) }}
      aria-label={
        pieces.length
          ? `Captured: ${pieces.map((p) => getPieceName(p)).join(', ')}${advantage > 0 ? `, up ${advantage} points` : ''}`
          : 'Nothing captured yet'
      }
    >
      {advantage > 0 && (
        <span className="text-center font-mono text-xs font-semibold text-brass-600 dark:text-brass-300">
          +{advantage}
        </span>
      )}
      {groups.map((group, groupIndex) => (
        <span
          key={`${group[0]}-${groupIndex}`}
          className="grid grid-cols-2 gap-0.5"
          aria-hidden
        >
          {group.map((piece, index) => (
            <img
              key={index}
              src={`/pieces/${capturedColor}${piece}.svg`}
              alt={getPieceName(piece)}
              draggable={false}
              className="w-full select-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
            />
          ))}
        </span>
      ))}
    </div>
  )
}

const PROMOTION_ORDER: PromotionPiece[] = ['q', 'r', 'b', 'n']

/**
 * Promotion picker: four piece buttons stacked over the promotion square.
 * Anchored inside the board's relative grid container using the square's
 * percentage position, so it stays put (and opens downward or upward)
 * whichever way the board is flipped.
 */
const PromotionPicker: React.FC<{ square: Square; color: 'w' | 'b'; flipped: boolean }> = ({
  square,
  color,
  flipped,
}) => {
  const choosePromotion = useGameStore((state) => state.choosePromotion)
  const cancelPromotion = useGameStore((state) => state.cancelPromotion)

  const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
  const rank = Number(square[1])
  // Map the promotion square to its visible cell whichever way the board is
  // flipped: promotions land on rank 8 (white) or rank 1 (black), so the
  // visible row is always the top or bottom edge of the board.
  const displayRow = flipped ? rank - 1 : 8 - rank
  const displayCol = flipped ? 7 - file : file

  // Hang the stack below the square when it sits on the top edge, and let
  // it rise above the square when it sits on the bottom edge, so the picker
  // never spills off the board (which has overflow-hidden).
  const expandsDown = displayRow === 0
  const left = `${(displayCol / 8) * 100}%`
  const top = `${(expandsDown ? displayRow / 8 : (displayRow + 1) / 8) * 100}%`

  return (
    <>
      {/* Dim scrim: clicking anywhere off the picker cancels the promotion */}
      <span
        aria-hidden
        className="absolute inset-0 z-20 bg-[rgba(20,14,8,0.45)]"
        onClick={cancelPromotion}
      />
      <div
        role="menu"
        aria-label="Choose promotion piece"
        className="absolute z-30 w-[12.5%]"
        style={{ left, top }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`flex overflow-hidden rounded-sm border border-brass-500/70 shadow-lift dark:border-brass-300/50 ${
            expandsDown ? '' : 'flex-col-reverse'
          }`}
        >
          {PROMOTION_ORDER.map((piece) => (
            <button
              key={piece}
              type="button"
              role="menuitem"
              aria-label={`Promote to ${getPieceName(piece)}`}
              onClick={() => choosePromotion(piece)}
              className="flex aspect-square w-full items-center justify-center bg-[#f4ecdd] text-[clamp(34px,8.2vmin,58px)] leading-none transition hover:bg-brass-200 dark:bg-walnut-800 dark:hover:bg-walnut-700"
            >
              <span
                className={
                  color === 'w'
                    ? 'text-cream-100 [text-shadow:0_2px_0_rgba(60,40,20,0.85)] dark:text-cream-50'
                    : 'text-[#0f0c0a] [text-shadow:0_1px_0_rgba(255,255,255,0.18)] dark:text-[#2a2522]'
                }
              >
                {getPieceSymbol(color + piece)}
              </span>
            </button>
          ))}
          <button
            type="button"
            aria-label="Cancel promotion"
            onClick={cancelPromotion}
            className="border-t border-brass-500/40 bg-[#efe3c8] py-0.5 text-[10px] uppercase tracking-widest text-ink-700 transition hover:text-blood-500 dark:border-brass-300/30 dark:bg-walnut-900 dark:text-cream-300 dark:hover:text-blood-300"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  )
}

function getPieceName(piece: string): string {
  const names: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }
  return names[piece.toLowerCase()] ?? piece
}

function getPieceSymbol(piece: string): string {
  const symbols: Record<string, string> = {
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
    K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  }
  return symbols[piece] ?? piece
}

/**
 * A piece that glides across the board from `from` to `to` once when it mounts.
 * Its position is measured against the board element so it follows the same
 * grid as the squares beneath it (and stays correct when the board resizes).
 */
const GlidingPiece: React.FC<{
  flight: Flight
  durationMs: number
  delayMs: number
  boardRef: React.RefObject<HTMLDivElement>
}> = ({ flight, durationMs, delayMs, boardRef }) => {
  const { piece, from, to, landed } = flight
  // { pos, duration } — null until the start square is measured, then the
  // first frame is placed instantly (0ms) and the glide begins on the next.
  const [glide, setGlide] = useState<{ pos: { left: string; top: string }; duration: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let innerFrame = 0
    let delayTimer = 0
    const frame = requestAnimationFrame(() => {
      if (cancelled) return
      const board = boardRef.current
      if (!board) return
      // Squares live inside the grid container (the board's first child);
      // measure against it so percentages match the absolutely-positioned
      // overlay, whose origin is the board's padding box (inside its border).
      const grid = board.firstElementChild as HTMLElement | null
      if (!grid) return
      const boardRect = grid.getBoundingClientRect()
      const rects = new Map<Square, { left: string; top: string }>()
      Array.from(grid.querySelectorAll<HTMLElement>('[data-square]')).forEach((child) => {
        const square = child.dataset.square as Square | undefined
        if (!square) return
        const rect = child.getBoundingClientRect()
        rects.set(square, {
          left: `${((rect.left - boardRect.left) / boardRect.width) * 100}%`,
          top: `${((rect.top - boardRect.top) / boardRect.height) * 100}%`,
        })
      })
      const start = rects.get(from)
      const end = rects.get(to)
      if (!start || !end) return
      setGlide({ pos: start, duration: 0 })
      delayTimer = window.setTimeout(() => {
        innerFrame = requestAnimationFrame(() => {
          if (!cancelled) setGlide({ pos: end, duration: durationMs })
        })
      }, delayMs)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      cancelAnimationFrame(innerFrame)
      window.clearTimeout(delayTimer)
    }
    // Measure once when the flight starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Render nothing until measured, and nothing once the piece has landed.
  if (landed || !glide) return null

  const pieceColor = getPieceColor(piece)
  const shadowClass =
    pieceColor === 'w'
      ? 'text-cream-100 [text-shadow:0_2px_0_rgba(60,40,20,0.85),0_3px_8px_rgba(0,0,0,0.4)] dark:text-cream-50 dark:[text-shadow:0_2px_0_rgba(60,40,20,0.9),0_3px_12px_rgba(0,0,0,0.6)]'
      : 'text-[#0f0c0a] [text-shadow:0_1px_0_rgba(255,255,255,0.18),0_2px_8px_rgba(0,0,0,0.6)] dark:text-[#2a2522] dark:[text-shadow:0_1px_0_rgba(255,255,255,0.25),0_2px_10px_rgba(0,0,0,0.8)]'

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[clamp(34px,8.2vmin,58px)] leading-none transition-[left,top] ease-out will-change-[left,top] ${shadowClass}`}
      style={{
        left: glide.pos.left,
        top: glide.pos.top,
        transitionDuration: `${glide.duration}ms`,
      }}
    >
      {getPieceSymbol(piece)}
    </span>
  )
}
