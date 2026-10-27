import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'

type MoveInput = string | { from: string; to: string; promotion?: string }

// chess.js 1.x throws on an illegal move instead of returning null.
function expectIllegal(chess: Chess, move: MoveInput) {
  expect(() => chess.move(move)).toThrow()
}

function play(chess: Chess, moves: string[]) {
  for (const m of moves) chess.move(m)
  return chess
}

describe('Chess Rules Validation', () => {
  it('should validate pawn movement patterns', () => {
    const chess = new Chess()

    // One square forward
    expect(chess.move('e3').san).toBe('e3')
    expect(chess.move('e6').san).toBe('e6')

    // Two squares only on the very first move
    expectIllegal(chess, 'e5') // e3 -> e5
    chess.reset()
    expect(chess.move('e4').san).toBe('e4')
    expect(chess.move('e5').san).toBe('e5')

    // Cannot push straight into an occupied square, and cannot move backwards
    expectIllegal(chess, { from: 'e4', to: 'e5' })
    expectIllegal(chess, { from: 'e4', to: 'e3' })

    // Captures are diagonal only
    chess.reset()
    play(chess, ['e4', 'd5'])
    const capture = chess.move('exd5')
    expect(capture.captured).toBe('p')
    expect(capture.flags).toContain('c')

    // Cannot move sideways
    chess.reset()
    expectIllegal(chess, { from: 'e2', to: 'd2' })
  })

  it('should validate knight movement patterns', () => {
    const chess = new Chess()

    // L-shaped moves, jumping over the pawns on the first move
    expect(chess.move('Nc3').san).toBe('Nc3')
    expect(chess.move('Nf6').san).toBe('Nf6')

    // Knight cannot move in a straight line or diagonally
    expectIllegal(chess, { from: 'c3', to: 'c5' })
    expectIllegal(chess, { from: 'c3', to: 'd4' })
  })

  it('should validate bishop movement patterns', () => {
    const chess = new Chess()

    // Blocked by its own pawns at the start
    expectIllegal(chess, 'Bc4')

    // Diagonal move once the pawn has moved
    play(chess, ['e4', 'e5'])
    expect(chess.move('Bc4').san).toBe('Bc4')
    chess.move('Nc6')

    // Bishop cannot move vertically or horizontally
    expectIllegal(chess, { from: 'c4', to: 'c5' })
    expectIllegal(chess, { from: 'c4', to: 'd4' })
  })

  it('should validate rook movement patterns', () => {
    const chess = new Chess()

    // Blocked by its own pawn at the start
    expectIllegal(chess, 'Ra3')

    play(chess, ['a4', 'a5'])
    // Vertical move
    expect(chess.move('Ra3').san).toBe('Ra3')
    chess.move('Ra6')
    // Horizontal move along the open third rank
    expect(chess.move('Rh3').san).toBe('Rh3')
    chess.move('Rh6')

    // Rook cannot move diagonally
    expectIllegal(chess, { from: 'h3', to: 'g4' })
  })

  it('should validate queen movement patterns', () => {
    const chess = new Chess()
    play(chess, ['e4', 'e5'])

    // Diagonal
    expect(chess.move('Qh5').san).toBe('Qh5')
    chess.move('Nc6')
    // Horizontal capture that gives check
    expect(chess.move('Qxe5+').san).toBe('Qxe5+')

    // Queen cannot move like a knight
    const chess2 = play(new Chess(), ['e4', 'e5', 'Qh5', 'Nc6'])
    expectIllegal(chess2, { from: 'h5', to: 'g3' })
  })

  it('should validate king movement patterns', () => {
    const chess = new Chess()

    // Blocked by its own pawn at the start
    expectIllegal(chess, 'Ke2')

    play(chess, ['e4', 'e5'])
    // One square in any direction
    expect(chess.move('Ke2').san).toBe('Ke2')
    expect(chess.move('Ke7').san).toBe('Ke7')
    play(chess, ['Ke3', 'Ke6'])

    // King cannot move more than one square
    expectIllegal(chess, { from: 'e3', to: 'c3' })
    expectIllegal(chess, { from: 'e3', to: 'e1' })
  })

  it('should prevent moving into check', () => {
    // e7 is attacked by the queen on h4, so the black king may not step there
    const chess = play(new Chess(), ['e4', 'e5', 'Qh5', 'Nc6', 'Qh4'])
    expect(chess.moves()).not.toContain('Ke7')
    expectIllegal(chess, 'Ke7')

    // While in check, only moves that resolve the check are legal
    const checked = play(new Chess(), ['e4', 'e5', 'Qh5', 'Nc6', 'Qxe5+'])
    expect(checked.inCheck()).toBe(true)
    const legal = checked.moves()
    expect(legal).toContain('Nxe5')
    expect(legal).toContain('Qe7')
    expect(legal).not.toContain('a6')
    expectIllegal(checked, 'a6')
  })

  it('should handle castling correctly', () => {
    // Kingside
    const chess = play(new Chess(), ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'])
    expect(chess.move('O-O').flags).toContain('k')
    expect(chess.get('g1')).toMatchObject({ type: 'k', color: 'w' })
    expect(chess.get('f1')).toMatchObject({ type: 'r', color: 'w' })
    expect(chess.get('e1')).toBeUndefined()
    expect(chess.get('h1')).toBeUndefined()

    // Queenside
    const queenside = play(new Chess(), ['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7'])
    expect(queenside.move('O-O-O').flags).toContain('q')
    expect(queenside.get('c1')).toMatchObject({ type: 'k', color: 'w' })
    expect(queenside.get('d1')).toMatchObject({ type: 'r', color: 'w' })

    // Not allowed once the king has moved
    const moved = play(new Chess(), ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'Ke2', 'Nf6', 'Ke1', 'd6'])
    expectIllegal(moved, 'O-O')

    // Not allowed through an attacked square (black bishop on a6 covers f1)
    const throughCheck = new Chess('r3k2r/8/b7/8/8/8/8/R3K2R w KQkq - 0 1')
    expect(throughCheck.moves()).toContain('O-O-O')
    expect(throughCheck.moves()).not.toContain('O-O')
  })

  it('should handle en passant', () => {
    const chess = play(new Chess(), ['e4', 'a6', 'e5', 'd5'])

    const ep = chess.moves({ verbose: true }).find((m) => m.flags.includes('e'))
    expect(ep).toBeDefined()
    expect(ep!.san).toBe('exd6')

    chess.move('exd6')
    expect(chess.get('d5')).toBeUndefined() // captured pawn is removed
    expect(chess.get('d6')).toMatchObject({ type: 'p', color: 'w' })

    // Only available immediately after the double push
    const late = play(new Chess(), ['e4', 'a6', 'e5', 'd5', 'Nf3', 'a5'])
    expectIllegal(late, 'exd6')
  })

  it('should handle pawn promotion', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1'
    const chess = new Chess(fen)

    // Promote to a queen
    const promo = chess.move('a8=Q')
    expect(promo.flags).toContain('p')
    expect(promo.promotion).toBe('q')
    expect(chess.get('a8')).toMatchObject({ type: 'q', color: 'w' })

    // Underpromote to a knight
    chess.load(fen)
    expect(chess.move({ from: 'a7', to: 'a8', promotion: 'n' }).san).toBe('a8=N')
    expect(chess.get('a8')).toMatchObject({ type: 'n', color: 'w' })

    // A promotion piece must be given
    chess.load(fen)
    expectIllegal(chess, { from: 'a7', to: 'a8' })
  })

  it('should detect insufficient material', () => {
    expect(new Chess('k7/8/8/8/8/8/8/K7 w - - 0 1').isInsufficientMaterial()).toBe(true)
    expect(new Chess('k7/8/8/8/8/8/8/K6B w - - 0 1').isInsufficientMaterial()).toBe(true)
    expect(new Chess('k7/8/8/8/8/8/8/K6N w - - 0 1').isInsufficientMaterial()).toBe(true)
    expect(new Chess('k7/8/8/8/8/8/8/K6R w - - 0 1').isInsufficientMaterial()).toBe(false)
  })

  it('should handle threefold repetition', () => {
    const chess = play(new Chess(), ['Nf3', 'Nf6', 'Ng1', 'Ng8'])
    expect(chess.isThreefoldRepetition()).toBe(false)

    play(chess, ['Nf3', 'Nf6', 'Ng1', 'Ng8'])
    expect(chess.isThreefoldRepetition()).toBe(true)
    expect(chess.isDraw()).toBe(true)
  })

  it('should detect the fifty-move rule', () => {
    const chess = play(new Chess(), ['a3', 'a6', 'b3', 'b6', 'c3', 'c6', 'd3', 'd6'])
    expect(chess.isDraw()).toBe(false)

    const nearlyDrawn = new Chess('4k3/8/8/8/8/8/8/4K2R w - - 99 80')
    nearlyDrawn.move('Rh2')
    expect(nearlyDrawn.isDrawByFiftyMoves()).toBe(true)
    expect(nearlyDrawn.isDraw()).toBe(true)
  })
})
