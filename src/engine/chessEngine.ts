import { Chess, type Color, type Move, type Piece, type PieceSymbol, type Square } from 'chess.js'

export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

/** A move given either as SAN ("Nf3") or as coordinates. */
export type MoveInput = string | { from: Square; to: Square; promotion?: PromotionPiece }

export type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw'

/**
 * Chess rules engine wrapper around chess.js (1.x API) with a few
 * conveniences for move validation, check detection and game state analysis.
 */
export class ChessEngine {
  private chess: Chess

  constructor(fen?: string) {
    this.chess = new Chess(fen)
  }

  getBoard() {
    return this.chess.board()
  }

  getFen(): string {
    return this.chess.fen()
  }

  getPgn(): string {
    return this.chess.pgn()
  }

  getTurn(): Color {
    return this.chess.turn()
  }

  isCheck(): boolean {
    return this.chess.inCheck()
  }

  isCheckmate(): boolean {
    return this.chess.isCheckmate()
  }

  isStalemate(): boolean {
    return this.chess.isStalemate()
  }

  /** Any drawn position: stalemate, fifty-move rule, threefold repetition or insufficient material. */
  isDraw(): boolean {
    return this.chess.isDraw()
  }

  isGameOver(): boolean {
    return this.chess.isGameOver()
  }

  getGameStatus(): GameStatus {
    if (this.chess.isCheckmate()) return 'checkmate'
    if (this.chess.isStalemate()) return 'stalemate'
    if (this.chess.isDraw()) return 'draw'
    return 'playing'
  }

  getWinner(): Color | null {
    if (!this.chess.isCheckmate()) return null
    return this.chess.turn() === 'w' ? 'b' : 'w'
  }

  getLegalMoves(square?: Square): Move[] {
    return this.chess.moves({ square, verbose: true })
  }

  getLegalMovesForSquare(square: Square): Square[] {
    return this.chess.moves({ square, verbose: true }).map((m) => m.to)
  }

  isValidMove(from: Square, to: Square): boolean {
    return this.chess.moves({ square: from, verbose: true }).some((m) => m.to === to)
  }

  /** Plays a move. Returns false (instead of throwing) when the move is illegal. */
  makeMove(move: MoveInput): boolean {
    try {
      this.chess.move(move)
      return true
    } catch {
      return false
    }
  }

  undoMove(): boolean {
    return this.chess.undo() != null
  }

  getPieceAt(square: Square): Piece | null {
    return this.chess.get(square) ?? null
  }

  getKingSquare(color: Color): Square | null {
    return this.chess.findPiece({ type: 'k', color })[0] ?? null
  }

  isSquareAttacked(square: Square, byColor: Color): boolean {
    return this.chess.isAttacked(square, byColor)
  }

  /** The square of the king that is currently in check, if any. */
  getCheckSquare(): Square | null {
    if (!this.chess.inCheck()) return null
    return this.getKingSquare(this.chess.turn())
  }

  /** Pieces each side has captured so far, keyed by the capturing colour. */
  getCapturedPieces(): { w: PieceSymbol[]; b: PieceSymbol[] } {
    const captured: { w: PieceSymbol[]; b: PieceSymbol[] } = { w: [], b: [] }
    for (const move of this.chess.history({ verbose: true })) {
      if (move.captured) captured[move.color].push(move.captured)
    }
    return captured
  }

  reset(): void {
    this.chess.reset()
  }

  loadFen(fen: string): void {
    this.chess.load(fen)
  }

  moveCount(): number {
    return this.chess.history().length
  }

  getMoveList(): string[] {
    return this.chess.history()
  }
}
