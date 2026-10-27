import { describe, expect, it } from 'vitest'
import { diffMoves, fenToMap } from './fenDiff'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('fenToMap', () => {
  it('maps every occupied square to its piece letter', () => {
    const map = fenToMap('4k3/8/8/8/8/8/8/R3K2R w - - 0 1')
    expect(map.get('e8')).toBe('k')
    expect(map.get('a1')).toBe('R')
    expect(map.get('h1')).toBe('R')
    expect(map.get('e1')).toBe('K')
    expect(map.has('a8')).toBe(false)
  })
})

describe('diffMoves', () => {
  it('returns no moves or captures for the same position', () => {
    expect(diffMoves(START, START)).toEqual({ moves: [], captures: [] })
  })

  it('detects a simple pawn move', () => {
    const next = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(diffMoves(START, next)).toEqual({
      moves: [{ from: 'e2', to: 'e4', piece: 'P' }],
      captures: [],
    })
  })

  it('detects a capture', () => {
    // White's e4 pawn captures Black's pawn on d5.
    const before = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'
    const after = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2'
    const diff = diffMoves(before, after)
    expect(diff.moves).toContainEqual({ from: 'e4', to: 'd5', piece: 'P' })
    expect(diff.captures).toContainEqual({ square: 'd5', piece: 'p' })
  })

  it('detects a knight move', () => {
    const next = 'rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1'
    const { moves } = diffMoves(START, next)
    expect(moves).toContainEqual({ from: 'b1', to: 'c3', piece: 'N' })
  })

  it('detects a castling move as two glides (king and rook)', () => {
    const before = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 4 1'
    const after = 'r3k2r/8/8/8/8/8/8/R4RK1 w kq - 4 1'
    const { moves } = diffMoves(before, after)
    expect(moves).toContainEqual({ from: 'e1', to: 'g1', piece: 'K' })
    expect(moves).toContainEqual({ from: 'h1', to: 'f1', piece: 'R' })
    expect(moves).toHaveLength(2)
  })

  it('treats a pawn reaching the last rank as a promotion, not a capture', () => {
    const before = '7k/6P1/8/8/8/8/8/6K1 w - - 0 1'
    const after = '6Qk/8/8/8/8/8/8/6K1 b - - 1 1'
    const diff = diffMoves(before, after)
    expect(diff.moves).toContainEqual({ from: 'g7', to: 'g8', piece: 'Q' })
    expect(diff.captures).toHaveLength(0)
  })

  it('detects an en passant capture', () => {
    // Black's e5 pawn captures White's d5 pawn en passant, landing on d6.
    const before = '8/4k3/8/3Pp3/8/8/8/4K3 b - c6 0 3'
    const after = '8/4k3/3p4/8/8/8/8/4K3 w - - 1 4'
    const diff = diffMoves(before, after)
    expect(diff.moves).toContainEqual({ from: 'e5', to: 'd6', piece: 'p' })
    expect(diff.captures).toContainEqual({ square: 'd5', piece: 'P' })
  })
})
