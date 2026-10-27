import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import {
  evaluatePosition,
  evaluateMaterial,
  evaluateWithWeights,
  getMobilityBonus,
  getCenterControlBonus,
  PIECE_VALUES,
} from '../engine/evaluation'

describe('Evaluation Engine', () => {
  it('should assign correct piece values', () => {
    expect(PIECE_VALUES.p).toBe(100)
    expect(PIECE_VALUES.n).toBe(320)
    expect(PIECE_VALUES.b).toBe(330)
    expect(PIECE_VALUES.r).toBe(500)
    expect(PIECE_VALUES.q).toBe(900)
    expect(PIECE_VALUES.k).toBe(20000)
  })

  it('should evaluate equal material as zero', () => {
    const chess = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    expect(evaluateMaterial(chess)).toBe(0)
    expect(evaluatePosition(new Chess())).toBe(0)
  })

  it('should reflect a material advantage', () => {
    // 1.e4 d5 2.Nf3 dxe4 — black is a pawn up
    const chess = new Chess('rnbqkbnr/ppp1pppp/8/8/4p3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3')
    expect(evaluateMaterial(chess)).toBe(-PIECE_VALUES.p)
  })

  it('should reward better piece placement symmetrically', () => {
    // White has e4 and Nf3 developed against ...c5
    const whiteDeveloped = new Chess('rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')
    // Colour-mirrored: black has ...e5 and ...Nf6 developed against c4
    const blackDeveloped = new Chess('rnbqkb1r/pppp1ppp/5n2/4p3/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 1 3')

    expect(evaluatePosition(whiteDeveloped)).toBeGreaterThan(0)
    expect(evaluatePosition(blackDeveloped)).toBeLessThan(0)
    expect(evaluatePosition(whiteDeveloped)).toBe(-evaluatePosition(blackDeveloped))
  })

  it('should orient the piece-square tables correctly for both colours', () => {
    // A white pawn about to promote is worth more than one on its starting square
    const whiteAdvanced = new Chess('4k3/4P3/8/8/8/8/8/4K3 w - - 0 1')
    const whiteHome = new Chess('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')
    expect(evaluatePosition(whiteAdvanced)).toBeGreaterThan(evaluatePosition(whiteHome))

    // And the same holds for black (evaluation is from white's point of view)
    const blackAdvanced = new Chess('4k3/8/8/8/8/8/4p3/4K3 w - - 0 1')
    const blackHome = new Chess('4k3/4p3/8/8/8/8/8/4K3 w - - 0 1')
    expect(evaluatePosition(blackAdvanced)).toBeLessThan(evaluatePosition(blackHome))

    // A castled white king scores better than one wandering in the centre
    const castled = new Chess('4k3/8/8/8/8/8/8/6K1 w - - 0 1')
    const wandering = new Chess('4k3/8/8/8/4K3/8/8/8 w - - 0 1')
    expect(evaluatePosition(castled)).toBeGreaterThan(evaluatePosition(wandering))
  })

  it('should count center control for both sides', () => {
    expect(getCenterControlBonus(new Chess())).toBe(0)
    const afterE4 = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    expect(getCenterControlBonus(afterE4)).toBeGreaterThan(0)
    const afterE4D5 = new Chess('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    expect(getCenterControlBonus(afterE4D5)).toBe(0)
  })

  it('should measure mobility for the side to move and its opponent', () => {
    // Both sides have 20 legal moves in the initial position
    expect(getMobilityBonus(new Chess())).toBe(0)
    // After 1.e4 white has 30 moves available against black's 20
    const afterE4 = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    expect(getMobilityBonus(afterE4)).toBe(10)
    // And the mirror image favours black by the same amount
    const afterE5 = new Chess('rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2')
    expect(getMobilityBonus(afterE5)).toBe(-10)
  })

  it('should combine terms with the given weights', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
    const materialOnly = evaluateWithWeights(chess, {
      material: 100, mobility: 0, centerControl: 0, kingSafety: 0, pawnStructure: 0, development: 0,
    })
    expect(materialOnly).toBe(evaluatePosition(chess))
    const withMobility = evaluateWithWeights(chess, {
      material: 100, mobility: 1, centerControl: 0, kingSafety: 0, pawnStructure: 0, development: 0,
    })
    expect(withMobility).toBe(evaluatePosition(chess) + 10)
  })

  it('should handle checkmate detection', () => {
    const chess = new Chess('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1')
    expect(chess.isCheckmate()).toBe(true)
  })

  it('should handle stalemate detection', () => {
    const chess = new Chess('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1')
    expect(chess.isStalemate()).toBe(true)
  })
})
