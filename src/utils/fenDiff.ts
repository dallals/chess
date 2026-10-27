import type { Square } from 'chess.js'

/** A piece travelling between two FEN positions. `piece` is the FEN letter at the destination. */
export interface FenMove {
  from: Square
  to: Square
  piece: string
}

/** Everything that changed between two FEN positions. */
export interface FenDiff {
  /** Pieces that moved (or were promoted) from one square to another. */
  moves: FenMove[]
  /** Pieces that disappeared — i.e. were captured. */
  captures: { square: Square; piece: string }[]
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

/** Map every square in the FEN placement field to its piece letter (upper case = white). */
export function fenToMap(fen: string): Map<Square, string> {
  const map = new Map<Square, string>()
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, rowIndex) => {
    const rank = 8 - rowIndex
    let file = 0
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char)
      } else {
        map.set(`${FILES[file]}${rank}` as Square, char)
        file++
      }
    }
  })
  return map
}

function distance(from: Square, to: Square): number {
  const fileDiff = Math.abs(from.charCodeAt(0) - to.charCodeAt(0))
  const rankDiff = Math.abs(Number(from[1]) - Number(to[1]))
  return fileDiff + rankDiff
}

/**
 * Pair pieces that left and arrived between two FENs to recover the moves that
 * connect them. Pieces pair by type (nearest first); a lone pawn leaving with a
 * queen/rook/bishop/knight arriving on its file's last rank is treated as a
 * promotion. Castling yields two moves (king and rook). Departed pieces with no
 * match are reported as captures.
 */
export function diffMoves(prev: string, next: string): FenDiff {
  const before = fenToMap(prev)
  const after = fenToMap(next)

  const departed: { square: Square; piece: string }[] = []
  const arrived: { square: Square; piece: string }[] = []
  for (let file = 0; file < 8; file++) {
    for (let rank = 1; rank <= 8; rank++) {
      const square = `${FILES[file]}${rank}` as Square
      const was = before.get(square)
      const is = after.get(square)
      if (was && is) {
        if (was !== is) {
          departed.push({ square, piece: was })
          arrived.push({ square, piece: is })
        }
      } else if (was) {
        departed.push({ square, piece: was })
      } else if (is) {
        arrived.push({ square, piece: is })
      }
    }
  }

  const used = new Set<number>()
  const findArrival = (dep: { square: Square; piece: string }, predicate: (arr: { square: Square; piece: string }) => boolean): number => {
    let best = -1
    let bestDistance = Infinity
    arrived.forEach((arr, index) => {
      if (used.has(index) || !predicate(arr)) return
      const d = distance(dep.square, arr.square)
      if (d < bestDistance) {
        best = index
        bestDistance = d
      }
    })
    return best
  }

  const moves: FenMove[] = []
  const paired = new Set<number>()
  for (let depIndex = 0; depIndex < departed.length; depIndex++) {
    const dep = departed[depIndex]
    const white = dep.piece === dep.piece.toUpperCase()
    const isPawn = dep.piece.toLowerCase() === 'p'
    const index = findArrival(dep, (arr) => {
      if (arr.piece === dep.piece) return true
      // Promotion: arriving on the promoting colour's last rank, on the pawn's
      // file or an adjacent one (capture-promotion), from the seventh rank.
      const sameColour = white
        ? arr.piece === arr.piece.toUpperCase()
        : arr.piece === arr.piece.toLowerCase()
      return (
        isPawn &&
        ['q', 'r', 'b', 'n'].includes(arr.piece.toLowerCase()) &&
        sameColour &&
        Number(arr.square[1]) === (white ? 8 : 1) &&
        Number(dep.square[1]) === (white ? 7 : 2) &&
        Math.abs(arr.square.charCodeAt(0) - dep.square.charCodeAt(0)) <= 1
      )
    })
    if (index >= 0) {
      used.add(index)
      paired.add(depIndex)
      moves.push({ from: dep.square, to: arrived[index].square, piece: arrived[index].piece })
    }
  }

  const captures = departed
    .map((dep, depIndex) => ({ dep, depIndex }))
    .filter(({ depIndex }) => !paired.has(depIndex))
    .map(({ dep }) => ({ square: dep.square, piece: dep.piece }))

  return { moves, captures }
}
