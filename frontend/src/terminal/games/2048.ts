/**
 * 2048, as plain functions over plain arrays — no Vue, no OutputLine, no timers.
 * The renderer lives in `commands/games.ts`; everything interesting lives here so
 * it can be tested without a terminal.
 */

export const SIZE = 4
const CELLS = SIZE * SIZE

/** 16 cells in row-major order, `0` meaning empty. */
export type Board = number[]

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface MoveResult {
  board: Board
  /** Points scored by this move — the sum of every tile it created. */
  gained: number
  /** False when the move changed nothing, in which case no tile spawns. */
  moved: boolean
}

/** A source of randomness, injected so tests can be deterministic. */
export type Random = () => number

export function emptyBoard(): Board {
  return Array.from({ length: CELLS }, () => 0)
}

/** The indices of one row/column, ordered so that index 0 is the end tiles slide towards. */
function lane(dir: Dir, index: number): number[] {
  const forward =
    dir === 'left' || dir === 'right'
      ? Array.from({ length: SIZE }, (_, i) => index * SIZE + i)
      : Array.from({ length: SIZE }, (_, i) => i * SIZE + index)

  return dir === 'right' || dir === 'down' ? forward.reverse() : forward
}

/** Compacts one lane towards its start, merging each pair at most once. */
function slide(values: number[]): { values: number[]; gained: number } {
  const filled = values.filter((value) => value !== 0)
  const out: number[] = []
  let gained = 0

  for (let i = 0; i < filled.length; i++) {
    if (filled[i] === filled[i + 1]) {
      const merged = filled[i]! * 2
      out.push(merged)
      gained += merged
      // Skip the tile we just absorbed: 2 2 2 2 becomes 4 4, never 8.
      i++
    } else {
      out.push(filled[i]!)
    }
  }

  while (out.length < SIZE) out.push(0)
  return { values: out, gained }
}

export function move(board: Board, dir: Dir): MoveResult {
  const next = [...board]
  let gained = 0

  for (let i = 0; i < SIZE; i++) {
    const indices = lane(dir, i)
    const slid = slide(indices.map((cell) => board[cell]!))
    gained += slid.gained
    indices.forEach((cell, position) => {
      next[cell] = slid.values[position]!
    })
  }

  return { board: next, gained, moved: next.some((value, i) => value !== board[i]) }
}

/** Drops a 2 (90%) or a 4 (10%) into a random empty cell. A full board is returned as-is. */
export function spawn(board: Board, random: Random = Math.random): Board {
  const empty = board.flatMap((value, i) => (value === 0 ? [i] : []))
  if (!empty.length) return board

  const next = [...board]
  next[empty[Math.floor(random() * empty.length)]!] = random() < 0.9 ? 2 : 4
  return next
}

export function newGame(random: Random = Math.random): Board {
  return spawn(spawn(emptyBoard(), random), random)
}

/** Dead means no empty cell and no equal neighbours — every direction is a no-op. */
export function isDead(board: Board): boolean {
  if (board.some((value) => value === 0)) return false

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const value = board[row * SIZE + col]!
      if (col + 1 < SIZE && value === board[row * SIZE + col + 1]) return false
      if (row + 1 < SIZE && value === board[(row + 1) * SIZE + col]) return false
    }
  }
  return true
}

export function maxTile(board: Board): number {
  return board.reduce((max, value) => Math.max(max, value), 0)
}
