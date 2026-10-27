import { Chess, type Move, type PieceSymbol } from 'chess.js'
import { evaluateWithWeights, evaluateMaterial, type EvaluationWeights } from './evaluation'

export type Difficulty = 'beginner' | 'casual' | 'advanced' | 'expert'

/**
 * AI difficulty levels with their search depths and evaluation strategies
 */
export interface DifficultySettings {
  depth: number
  evaluationWeights: EvaluationWeights
  usePositionalEval: boolean
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  beginner: {
    depth: 1,
    evaluationWeights: { material: 100, mobility: 0, centerControl: 0, kingSafety: 0, pawnStructure: 0, development: 0 },
    usePositionalEval: false,
  },
  casual: {
    depth: 2,
    evaluationWeights: { material: 100, mobility: 5, centerControl: 3, kingSafety: 10, pawnStructure: 5, development: 5 },
    usePositionalEval: true,
  },
  advanced: {
    depth: 3,
    evaluationWeights: { material: 100, mobility: 5, centerControl: 3, kingSafety: 20, pawnStructure: 10, development: 8 },
    usePositionalEval: true,
  },
  expert: {
    depth: 4,
    evaluationWeights: { material: 100, mobility: 5, centerControl: 3, kingSafety: 20, pawnStructure: 10, development: 8 },
    usePositionalEval: true,
  },
}

/** Score for delivering checkmate. Larger than any material swing. */
const MATE_SCORE = 100_000

/** Relative piece values used only for move ordering. */
const ORDER_VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/**
 * Negamax search with alpha-beta pruning.
 *
 * Scores are always from the point of view of the side to move, which keeps
 * the search symmetric for white and black.
 */
export class ChessAI {
  private depth = 1
  private usePositionalEval = false
  private weights: EvaluationWeights = DIFFICULTY_SETTINGS.beginner.evaluationWeights

  constructor(difficulty: Difficulty = 'casual') {
    this.setDifficulty(difficulty)
  }

  /**
   * Find the best move for the side to move. The position is left unchanged.
   */
  findBestMove(chess: Chess): Move | null {
    const moves = chess.moves({ verbose: true })
    if (moves.length === 0) return null

    // Beginner just plays a random legal move.
    if (this.depth <= 1 && !this.usePositionalEval) {
      return moves[Math.floor(Math.random() * moves.length)]
    }

    let bestMove: Move | null = null
    let bestValue = -Infinity
    let alpha = -Infinity
    const beta = Infinity

    for (const move of this.orderMoves(moves)) {
      chess.move(move)
      const value = -this.negamax(chess, this.depth - 1, -beta, -alpha)
      chess.undo()

      if (value > bestValue) {
        bestValue = value
        bestMove = move
      }
      alpha = Math.max(alpha, value)
    }

    return bestMove
  }

  private negamax(chess: Chess, depth: number, alpha: number, beta: number): number {
    if (depth === 0) return this.evaluateLeaf(chess)

    if (chess.isDrawByFiftyMoves() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) {
      return 0
    }

    const moves = chess.moves({ verbose: true })
    if (moves.length === 0) {
      // Prefer quicker mates: a mate with more depth remaining was found sooner.
      return chess.inCheck() ? -(MATE_SCORE + depth) : 0
    }

    let best = -Infinity
    for (const move of this.orderMoves(moves)) {
      chess.move(move)
      const value = -this.negamax(chess, depth - 1, -beta, -alpha)
      chess.undo()

      if (value > best) best = value
      if (value > alpha) alpha = value
      if (alpha >= beta) break
    }

    return best
  }

  /**
   * Static evaluation from the side to move's point of view, with terminal
   * positions (mate / stalemate) recognised so the horizon does not hide them.
   */
  private evaluateLeaf(chess: Chess): number {
    const moveCount = chess.moves().length
    if (moveCount === 0) return chess.inCheck() ? -MATE_SCORE : 0

    const whiteScore = this.usePositionalEval
      ? evaluateWithWeights(chess, this.weights, moveCount)
      : evaluateMaterial(chess)

    return chess.turn() === 'w' ? whiteScore : -whiteScore
  }

  /**
   * Order moves so that the most forcing ones are searched first, which lets
   * alpha-beta prune more of the tree.
   */
  private orderMoves(moves: Move[]): Move[] {
    return moves
      .map((move) => ({ move, score: this.scoreMove(move) }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.move)
  }

  private scoreMove(move: Move): number {
    let score = 0
    if (move.san.endsWith('#')) score += 1000
    else if (move.san.endsWith('+')) score += 5
    // Most valuable victim, least valuable attacker
    if (move.captured) score += 10 * ORDER_VALUE[move.captured] - ORDER_VALUE[move.piece]
    if (move.promotion) score += 8 + ORDER_VALUE[move.promotion]
    return score
  }

  getDepth(): number {
    return this.depth
  }

  setDifficulty(difficulty: Difficulty): void {
    const settings = DIFFICULTY_SETTINGS[difficulty] ?? DIFFICULTY_SETTINGS.casual
    this.depth = settings.depth
    this.usePositionalEval = settings.usePositionalEval
    this.weights = settings.evaluationWeights
  }
}
