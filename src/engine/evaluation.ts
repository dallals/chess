import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'

/**
 * Position evaluation weights for different aspects of chess
 */
export interface EvaluationWeights {
  material: number
  mobility: number
  centerControl: number
  kingSafety: number
  pawnStructure: number
  development: number
}

export const DEFAULT_WEIGHTS: EvaluationWeights = {
  material: 100,
  mobility: 5,
  centerControl: 3,
  kingSafety: 20,
  pawnStructure: 10,
  development: 8,
}

/**
 * Piece values (centipawns) for material evaluation
 */
export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
}

/**
 * Piece-square tables, written from white's point of view: row 0 is the
 * eighth rank (far side of the board), row 7 is the first rank. This matches
 * the layout of chess.board(), so white pieces index the tables directly and
 * black pieces use the vertically mirrored row.
 */
const PAWN_TABLE = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0],
]

const KNIGHT_TABLE = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50],
]

const BISHOP_TABLE = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20],
]

const ROOK_TABLE = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [5, 10, 10, 10, 10, 10, 10,  5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [-5,  0,  0,  0,  0,  0,  0, -5],
  [0,  0,  0,  5,  5,  0,  0,  0],
]

const QUEEN_TABLE = [
  [-20,-10,-10, -5, -5,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5,  5,  5,  5,  0,-10],
  [-5,  0,  5,  5,  5,  5,  0, -5],
  [0,  0,  5,  5,  5,  5,  0, -5],
  [-10,  5,  5,  5,  5,  5,  0,-10],
  [-10,  0,  5,  0,  0,  0,  0,-10],
  [-20,-10,-10, -5, -5,-10,-10,-20],
]

const KING_TABLE = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20, 20,  0,  0,  0,  0, 20, 20],
  [20, 30, 10,  0,  0, 10, 30, 20],
]

const TABLES: Record<PieceSymbol, number[][]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_TABLE,
}

/**
 * Material plus piece-square evaluation.
 * Positive favours white, negative favours black.
 */
export function evaluatePosition(chess: Chess): number {
  const board = chess.board()
  let total = 0

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col]
      if (!piece) continue
      const value = PIECE_VALUES[piece.type] + getPositionValue(piece.type, piece.color, row, col)
      total += piece.color === 'w' ? value : -value
    }
  }

  return total
}

/**
 * Piece-square bonus for a piece at a chess.board() coordinate (row 0 = rank 8).
 */
export function getPositionValue(type: PieceSymbol, color: Color, row: number, col: number): number {
  const tableRow = color === 'w' ? row : 7 - row
  return TABLES[type][tableRow][col]
}

const CENTER_SQUARES: Square[] = ['d4', 'd5', 'e4', 'e5']

/**
 * Bonus for occupying the four central squares (+3 per white piece, -3 per black piece).
 */
export function getCenterControlBonus(chess: Chess): number {
  let bonus = 0
  for (const square of CENTER_SQUARES) {
    const piece = chess.get(square)
    if (piece) bonus += piece.color === 'w' ? 3 : -3
  }
  return bonus
}

/**
 * Difference in the number of legal moves (white minus black).
 *
 * chess.js only generates moves for the side to move, so the opponent's
 * mobility is measured on the same position with the turn passed. That is not
 * possible while the side to move is in check, in which case the term is 0.
 *
 * @param ownMoveCount number of legal moves for the side to move, if the caller already has it
 */
export function getMobilityBonus(chess: Chess, ownMoveCount?: number): number {
  if (chess.inCheck()) return 0

  const own = ownMoveCount ?? chess.moves().length
  const fields = chess.fen().split(' ')
  fields[1] = fields[1] === 'w' ? 'b' : 'w'
  fields[3] = '-' // an en passant target is meaningless once the turn is passed
  const opponent = new Chess(fields.join(' ')).moves().length

  const diff = own - opponent
  return chess.turn() === 'w' ? diff : -diff
}

/**
 * Combined evaluation with weights. Positive favours white.
 */
export function evaluateWithWeights(
  chess: Chess,
  weights: EvaluationWeights = DEFAULT_WEIGHTS,
  ownMoveCount?: number,
): number {
  let score = evaluatePosition(chess)
  if (weights.centerControl) score += getCenterControlBonus(chess) * weights.centerControl
  if (weights.mobility) score += getMobilityBonus(chess, ownMoveCount) * weights.mobility
  return score
}

/**
 * Simple material-only evaluation (for beginner difficulty)
 */
export function evaluateMaterial(chess: Chess): number {
  let total = 0

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue
      const value = PIECE_VALUES[piece.type]
      total += piece.color === 'w' ? value : -value
    }
  }

  return total
}
