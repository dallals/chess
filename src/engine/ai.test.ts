import { describe, it, expect } from 'vitest'
import { Chess } from 'chess.js'
import { ChessAI, DIFFICULTY_SETTINGS } from '../engine/ai'

function queenCanBeCaptured(chess: Chess): boolean {
  return chess.moves({ verbose: true }).some((m) => m.captured === 'q')
}

describe('Chess AI', () => {
  it('should find a valid move for beginner difficulty', () => {
    const ai = new ChessAI('beginner')
    const chess = new Chess()

    const move = ai.findBestMove(chess)
    expect(move).not.toBeNull()
    expect(chess.moves({ verbose: true }).map((m) => m.san)).toContain(move!.san)
  })

  it('should find a valid move for expert difficulty', () => {
    const ai = new ChessAI('expert')
    const chess = new Chess()

    const move = ai.findBestMove(chess)
    expect(move).not.toBeNull()
    expect(chess.moves({ verbose: true }).map((m) => m.san)).toContain(move!.san)
    // Searching must leave the position untouched
    expect(chess.fen()).toBe(new Chess().fen())
  })

  it('should return null when there are no legal moves', () => {
    const ai = new ChessAI('casual')
    expect(ai.findBestMove(new Chess('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'))).toBeNull()
  })

  it('should capture a hanging queen as black', () => {
    const ai = new ChessAI('casual')
    // White queen on d4 can be taken by the e5 pawn for free
    const chess = new Chess('rnb1kbnr/pppp1ppp/8/4p3/3Q4/8/PPP1PPPP/RNB1KBNR b KQkq - 0 3')

    expect(ai.findBestMove(chess)?.san).toBe('exd4')
  })

  it('should not leave its queen en prise as white', () => {
    const ai = new ChessAI('casual')
    // White queen on d4 is attacked by the e5 pawn; white to move must save it
    const chess = new Chess('rnbqkbnr/pppp1ppp/8/4p3/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3')

    const move = ai.findBestMove(chess)
    expect(move).not.toBeNull()
    expect(move!.piece).toBe('q')
    chess.move(move!)
    expect(queenCanBeCaptured(chess)).toBe(false)
  })

  it('should not leave its queen en prise as black', () => {
    const ai = new ChessAI('casual')
    // Black queen on e4 is attacked by the d3 pawn; black to move must save it.
    // Black's pawns are all at home so no intermezzo check is available.
    const chess = new Chess('rnb1kbnr/pppppppp/8/8/4q3/3P4/PPP1PPPP/RNBQKBNR b KQkq - 0 4')

    const move = ai.findBestMove(chess)
    expect(move).not.toBeNull()
    expect(move!.piece).toBe('q')
    chess.move(move!)
    expect(queenCanBeCaptured(chess)).toBe(false)
  })

  it('should find mate in one as white', () => {
    const ai = new ChessAI('casual')
    const chess = new Chess('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4')

    expect(ai.findBestMove(chess)?.san).toBe('Qxf7#')
  })

  it('should find mate in one as black', () => {
    const ai = new ChessAI('casual')
    const chess = new Chess('rnb1k1nr/pppp1ppp/8/2b1p3/2B1P2q/8/PPPP1PPP/RNBQK1NR b KQkq - 4 4')

    expect(ai.findBestMove(chess)?.san).toBe('Qxf2#')
  })

  it('should find mate in two at expert depth', () => {
    const ai = new ChessAI('expert')
    // White rooks on a1/b1 against a boxed-in king on g8. A rook check on the
    // back rank forces ...Re8 to interpose, and the rook is then captured with mate.
    const chess = new Chess('6k1/4rppp/8/8/8/8/8/RR4K1 w - - 0 1')

    const first = ai.findBestMove(chess)
    expect(['Ra8+', 'Rb8+']).toContain(first?.san)
    chess.move(first!)
    expect(chess.moves()).toEqual(['Re8'])
    chess.move('Re8')
    expect(ai.findBestMove(chess)?.san).toBe('Rxe8#')
  })

  it('should find a move in a bare-kings endgame', () => {
    const ai = new ChessAI('casual')
    const chess = new Chess('k7/8/8/8/8/8/8/K7 w - - 0 1')

    const move = ai.findBestMove(chess)
    expect(move).not.toBeNull()
  })

  it('should set difficulty correctly', () => {
    const ai = new ChessAI('beginner')
    expect(ai.getDepth()).toBe(DIFFICULTY_SETTINGS.beginner.depth)

    ai.setDifficulty('expert')
    expect(ai.getDepth()).toBe(DIFFICULTY_SETTINGS.expert.depth)
    expect(ai.getDepth()).toBe(4)
  })
})
