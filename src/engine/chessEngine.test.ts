import { describe, it, expect, beforeEach } from 'vitest'
import { ChessEngine } from '../engine/chessEngine'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
// Black rook on a1 checks the white king on e1 along the first rank
const CHECK_FEN = '4k3/8/8/8/8/8/8/r3K3 w - - 0 1'
// Back-rank mate: white rook on a8, black king boxed in by its own pawns
const MATE_FEN = 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'
// Black king on a8 has no legal move and is not in check
const STALEMATE_FEN = 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1'

describe('ChessEngine Wrapper', () => {
  let engine: ChessEngine

  beforeEach(() => {
    engine = new ChessEngine()
  })

  it('should initialize with standard starting position', () => {
    expect(engine.getFen()).toBe(START_FEN)
  })

  it('should get the current turn', () => {
    expect(engine.getTurn()).toBe('w')
    expect(engine.makeMove({ from: 'e2', to: 'e4' })).toBe(true)
    expect(engine.getTurn()).toBe('b')
  })

  it('should accept SAN moves', () => {
    expect(engine.makeMove('e4')).toBe(true)
    expect(engine.getMoveList()).toEqual(['e4'])
  })

  it('should reject illegal moves without throwing', () => {
    expect(engine.makeMove({ from: 'e2', to: 'e5' })).toBe(false)
    expect(engine.makeMove('Ke2')).toBe(false)
    expect(engine.getFen()).toBe(START_FEN)
  })

  it('should detect check', () => {
    engine.loadFen(CHECK_FEN)
    expect(engine.isCheck()).toBe(true)
    expect(engine.isCheckmate()).toBe(false)
    expect(engine.getGameStatus()).toBe('playing')
  })

  it('should detect checkmate and the winner', () => {
    engine.loadFen(MATE_FEN)
    expect(engine.isCheckmate()).toBe(true)
    expect(engine.isGameOver()).toBe(true)
    expect(engine.getGameStatus()).toBe('checkmate')
    expect(engine.getWinner()).toBe('w')
  })

  it('should detect stalemate', () => {
    engine.loadFen(STALEMATE_FEN)
    expect(engine.isCheck()).toBe(false)
    expect(engine.isStalemate()).toBe(true)
    expect(engine.getGameStatus()).toBe('stalemate')
    expect(engine.getWinner()).toBeNull()
  })

  it('should detect draw conditions', () => {
    engine.loadFen('k7/8/8/8/8/8/8/K7 w - - 0 1')
    expect(engine.isDraw()).toBe(true)
    expect(engine.getGameStatus()).toBe('draw')
  })

  it('should get legal moves for a square', () => {
    const moves = engine.getLegalMovesForSquare('e2')
    expect(moves).toContain('e3')
    expect(moves).toContain('e4')
    expect(moves).toHaveLength(2)
    expect(engine.getLegalMovesForSquare('e4')).toHaveLength(0)
  })

  it('should validate moves', () => {
    expect(engine.isValidMove('e2', 'e4')).toBe(true)
    expect(engine.isValidMove('e2', 'e5')).toBe(false)
  })

  it('should find the king square', () => {
    expect(engine.getKingSquare('w')).toBe('e1')
    expect(engine.getKingSquare('b')).toBe('e8')
  })

  it('should get the check square when in check', () => {
    expect(engine.getCheckSquare()).toBeNull()
    engine.loadFen(CHECK_FEN)
    expect(engine.getCheckSquare()).toBe('e1')
  })

  it('should reset the game', () => {
    engine.makeMove({ from: 'e2', to: 'e4' })
    engine.reset()
    expect(engine.getFen()).toBe(START_FEN)
  })

  it('should undo a move', () => {
    engine.makeMove('e4')
    expect(engine.undoMove()).toBe(true)
    expect(engine.getFen()).toBe(START_FEN)
    expect(engine.undoMove()).toBe(false)
  })

  it('should get move count', () => {
    expect(engine.moveCount()).toBe(0)
    engine.makeMove({ from: 'e2', to: 'e4' })
    expect(engine.moveCount()).toBe(1)
  })

  it('should get move list', () => {
    engine.makeMove({ from: 'e2', to: 'e4' })
    engine.makeMove({ from: 'e7', to: 'e5' })
    expect(engine.getMoveList()).toEqual(['e4', 'e5'])
  })

  it('should get board state', () => {
    const board = engine.getBoard()
    expect(board.length).toBe(8)
    expect(board[0].length).toBe(8)
    expect(board[0][0]?.type).toBe('r')
    expect(board[0][0]?.color).toBe('b')
  })

  it('should get piece at specific square', () => {
    const piece = engine.getPieceAt('e2')
    expect(piece?.type).toBe('p')
    expect(piece?.color).toBe('w')
    expect(engine.getPieceAt('e4')).toBeNull()
  })

  it('should check if square is attacked', () => {
    engine.loadFen(CHECK_FEN)
    expect(engine.isSquareAttacked('e1', 'b')).toBe(true)
    expect(engine.isSquareAttacked('h8', 'b')).toBe(false)
    expect(engine.isSquareAttacked('e2', 'w')).toBe(true)
  })

  it('should promote with the requested piece', () => {
    engine.loadFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    expect(engine.makeMove({ from: 'a7', to: 'a8', promotion: 'n' })).toBe(true)
    expect(engine.getPieceAt('a8')?.type).toBe('n')
  })
})
