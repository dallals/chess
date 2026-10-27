import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore, PIECE_VALUES } from '../store/gameStore'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const store = () => useGameStore.getState()

function playMoves(moves: [string, string][]) {
  for (const [from, to] of moves) {
    expect(store().makeMove({ from: from as any, to: to as any })).toBe(true)
  }
}

describe('gameStore', () => {
  beforeEach(() => {
    store().resetGame({ mode: '2d', playerColor: 'w' })
  })

  it('starts from the initial position with white to move', () => {
    expect(store().fen).toBe(START_FEN)
    expect(store().turn).toBe('w')
    expect(store().status).toBe('playing')
    expect(store().moveList).toEqual([])
    expect(store().canUndo).toBe(false)
  })

  it('selecting a piece shows its legal moves', () => {
    store().selectSquare('e2')
    expect(store().selectedSquare).toBe('e2')
    expect(store().legalMoves.sort()).toEqual(['e3', 'e4'])
  })

  it('selecting the same square again clears the selection', () => {
    store().selectSquare('e2')
    store().selectSquare('e2')
    expect(store().selectedSquare).toBeNull()
    expect(store().legalMoves).toEqual([])
  })

  it('clicking a square that is not a legal destination does not throw', () => {
    store().selectSquare('e2')
    expect(() => store().selectSquare('e7')).not.toThrow()
    expect(store().selectedSquare).toBeNull()
    expect(store().fen).toBe(START_FEN)
  })

  it('clicking another own piece re-selects it', () => {
    store().selectSquare('e2')
    store().selectSquare('g1')
    expect(store().selectedSquare).toBe('g1')
    expect(store().legalMoves.sort()).toEqual(['f3', 'h3'])
  })

  it('does not let the player select the opponent pieces', () => {
    store().selectSquare('e7')
    expect(store().selectedSquare).toBeNull()
  })

  it('makes a move through two clicks', () => {
    store().selectSquare('e2')
    store().selectSquare('e4')
    expect(store().fen).toMatch(/^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b KQkq/)
    expect(store().turn).toBe('b')
    expect(store().moveList.map((m) => m.san)).toEqual(['e4'])
    expect(store().lastMove).toEqual({ from: 'e2', to: 'e4' })
    expect(store().selectedSquare).toBeNull()
    expect(store().canUndo).toBe(true)
  })

  it('ignores clicks while it is the opponent turn', () => {
    playMoves([['e2', 'e4']])
    store().selectSquare('e7')
    expect(store().selectedSquare).toBeNull()
  })

  it('rejects illegal moves from makeMove', () => {
    expect(store().makeMove({ from: 'e2', to: 'e5' })).toBe(false)
    expect(store().makeMove({ from: 'e4', to: 'e5' })).toBe(false)
    expect(store().fen).toBe(START_FEN)
  })

  it('highlights the checked king', () => {
    playMoves([['e2', 'e4'], ['f7', 'f5'], ['d1', 'h5']])
    expect(store().checkSquare).toBe('e8')
    playMoves([['g7', 'g6']])
    expect(store().checkSquare).toBeNull()
  })

  it('detects checkmate and the winner', () => {
    playMoves([['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['b8', 'c6'], ['f1', 'c4'], ['g8', 'f6'], ['h5', 'f7']])
    expect(store().status).toBe('checkmate')
    expect(store().winner).toBe('w')
    expect(store().moveList.map((m) => m.san).pop()).toBe('Qxf7#')
    // No further moves are accepted
    expect(store().makeMove({ from: 'e8', to: 'f7' })).toBe(false)
  })

  it('detects threefold repetition as a draw', () => {
    const shuffle: [string, string][] = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]
    playMoves([...shuffle, ...shuffle])
    expect(store().status).toBe('draw')
  })

  it('promotion through clicks asks for a piece choice and honours it', () => {
    // 1.a4 b5 2.axb5 a6 3.bxa6 Nf6 4.a7 Ng8 leaves a white pawn on a7 that can capture the b8 knight
    playMoves([['a2', 'a4'], ['b7', 'b5'], ['a4', 'b5'], ['a7', 'a6'], ['b5', 'a6'], ['g8', 'f6'], ['a6', 'a7'], ['f6', 'g8']])
    expect(store().makeMove({ from: 'a7', to: 'b8', promotion: 'n' })).toBe(true)
    expect(store().moveList.map((m) => m.san).pop()).toBe('axb8=N')

    store().undo()
    // After undo it is white's turn again (the player), so only one ply was removed
    expect(store().turn).toBe('w')
    store().selectSquare('a7')
    expect(store().legalMoves).toEqual(['b8'])
    store().selectSquare('b8')
    // The move is not played yet — the picker is waiting for a choice
    expect(store().pendingPromotion).toEqual({ from: 'a7', to: 'b8' })
    expect(store().moveList.map((m) => m.san).pop()).toBe('Ng8')

    store().choosePromotion('r')
    expect(store().pendingPromotion).toBeNull()
    expect(store().moveList.map((m) => m.san).pop()).toBe('axb8=R')
    expect(store().selectedSquare).toBeNull()
  })

  it('canceling a promotion keeps the pawn and the selection', () => {
    playMoves([['a2', 'a4'], ['b7', 'b5'], ['a4', 'b5'], ['a7', 'a6'], ['b5', 'a6'], ['g8', 'f6'], ['a6', 'a7'], ['f6', 'g8']])
    store().selectSquare('a7')
    store().selectSquare('b8')
    expect(store().pendingPromotion).toEqual({ from: 'a7', to: 'b8' })

    store().cancelPromotion()
    expect(store().pendingPromotion).toBeNull()
    expect(store().selectedSquare).toBe('a7')
    expect(store().moveList.map((m) => m.san).pop()).toBe('Ng8')

    // Choosing again after cancel still works
    store().selectSquare('b8')
    expect(store().pendingPromotion).toEqual({ from: 'a7', to: 'b8' })
    store().choosePromotion('n')
    expect(store().moveList.map((m) => m.san).pop()).toBe('axb8=N')
  })

  it('clicking another square while the picker is open cancels it', () => {
    playMoves([['a2', 'a4'], ['b7', 'b5'], ['a4', 'b5'], ['a7', 'a6'], ['b5', 'a6'], ['g8', 'f6'], ['a6', 'a7'], ['f6', 'g8']])
    store().selectSquare('a7')
    store().selectSquare('b8')
    store().selectSquare('h7')
    expect(store().pendingPromotion).toBeNull()
    // The pawn has not moved
    expect(store().moveList.map((m) => m.san).pop()).toBe('Ng8')
  })

  it('choosePromotion is a no-op without a pending promotion', () => {
    expect(() => store().choosePromotion('q')).not.toThrow()
    expect(store().fen).toBe(START_FEN)
  })

  it('undo removes the opponent reply as well so the player is to move', () => {
    playMoves([['e2', 'e4'], ['e7', 'e5']])
    store().undo()
    expect(store().fen).toBe(START_FEN)
    expect(store().moveList).toEqual([])
    expect(store().turn).toBe('w')
    expect(store().canUndo).toBe(false)
    expect(store().canRedo).toBe(true)
  })

  it('undo of a single ply returns the move to the player', () => {
    playMoves([['e2', 'e4']])
    store().undo()
    expect(store().fen).toBe(START_FEN)
    expect(store().turn).toBe('w')
  })

  it('redo restores the undone moves', () => {
    playMoves([['e2', 'e4'], ['e7', 'e5']])
    store().undo()
    store().redo()
    expect(store().moveList.map((m) => m.san)).toEqual(['e4', 'e5'])
    expect(store().turn).toBe('w')
    expect(store().canRedo).toBe(false)
  })

  it('a new move clears the redo stack', () => {
    playMoves([['e2', 'e4'], ['e7', 'e5']])
    store().undo()
    playMoves([['d2', 'd4']])
    expect(store().canRedo).toBe(false)
  })

  it('resign ends the game in favour of the opponent', () => {
    store().resign()
    expect(store().status).toBe('resign')
    expect(store().winner).toBe('b')
    expect(store().makeMove({ from: 'e2', to: 'e4' })).toBe(false)
  })

  it('reset keeps the chosen mode and player colour', () => {
    store().resetGame({ mode: '3d', playerColor: 'b' })
    expect(store().mode).toBe('3d')
    expect(store().playerColor).toBe('b')
    store().resetGame()
    expect(store().mode).toBe('3d')
    expect(store().playerColor).toBe('b')
  })

  it('toggleMode switches between 2d and 3d', () => {
    expect(store().mode).toBe('2d')
    store().toggleMode()
    expect(store().mode).toBe('3d')
    store().toggleMode()
    expect(store().mode).toBe('2d')
  })

  describe('captured material', () => {
    it('starts empty with no advantage', () => {
      expect(store().whiteCaptured).toEqual({ pieces: [], points: 0 })
      expect(store().blackCaptured).toEqual({ pieces: [], points: 0 })
    })

    it('records a capture by White', () => {
      playMoves([['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']])
      expect(store().whiteCaptured).toEqual({ pieces: ['p'], points: 1 })
      expect(store().blackCaptured).toEqual({ pieces: [], points: 0 })
    })

    it('records captures by both sides', () => {
      // 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 — White takes a knight.
      playMoves([
        ['e2', 'e4'], ['e7', 'e5'],
        ['g1', 'f3'], ['b8', 'c6'],
        ['f1', 'b5'], ['a7', 'a6'],
        ['b5', 'c6'],
      ])
      expect(store().whiteCaptured).toEqual({ pieces: ['n'], points: 3 })
      expect(store().blackCaptured).toEqual({ pieces: [], points: 0 })
    })

    it('tracks the running point totals across many captures', () => {
      // White: pawn on d5, then the queen on e5 (10 pts). Black: pawn on d5 (1 pt).
      playMoves([
        ['e2', 'e4'], ['d7', 'd5'],
        ['e4', 'd5'], ['d8', 'd5'],
        ['g1', 'f3'], ['d5', 'e5'],
        ['f3', 'e5'],
      ])
      expect(store().whiteCaptured).toEqual({ pieces: ['p', 'q'], points: 10 })
      expect(store().blackCaptured).toEqual({ pieces: ['p'], points: 1 })
    })

    it('accounts for en passant', () => {
      // 1. e4 d6 2. e5 f5 3. exf6 en passant — the only capture of a moving pawn.
      playMoves([
        ['e2', 'e4'], ['d7', 'd6'],
        ['e4', 'e5'], ['f7', 'f5'],
        ['e5', 'f6'],
      ])
      expect(store().whiteCaptured).toEqual({ pieces: ['p'], points: 1 })
    })

    it('untracking a capture via undo restores the ledger', () => {
      playMoves([['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']])
      expect(store().whiteCaptured.points).toBe(1)
      store().resetGame()
      expect(store().whiteCaptured).toEqual({ pieces: [], points: 0 })
    })

    it('uses standard piece values', () => {
      expect(PIECE_VALUES).toEqual({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 })
    })
  })
})
