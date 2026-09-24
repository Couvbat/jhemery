/**
 * Connect four, as plain functions over plain data — the rules half of the two-player
 * game. The server (`backend/src/rooms`) keeps the move list and enforces only whose
 * turn it is and that a column has room; everything else, a win above all, is decided
 * here, on both players' machines, from the same list. So the state is never stored,
 * only replayed: `replay(moves)` is the whole game.
 */

export const COLUMNS = 7
export const ROWS = 6
/** How many in a line win. */
export const CONNECT = 4

export type Seat = 0 | 1
export type Cell = Seat | null

export interface Connect4 {
  /** `board[row][column]`, row 0 at the top — the way it is drawn. */
  board: Cell[][]
  /** Whose move it is; meaningless once `over`. */
  next: Seat
  winner: Seat | null
  /** The winning cells, `[row, column]`, for the renderer to mark. */
  line: Array<[number, number]>
  draw: boolean
  over: boolean
  /** Moves that counted — a move after the end, or into a full column, does not. */
  played: number
}

const DIRECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

/** The row a piece dropped in `column` would land in, or null when it is full. */
export function landingRow(board: Cell[][], column: number): number | null {
  if (column < 0 || column >= COLUMNS) return null
  for (let row = ROWS - 1; row >= 0; row--) if (board[row]![column] === null) return row
  return null
}

/** Every cell in a line of `CONNECT` or more through `[row, column]`, or empty. */
function lineThrough(board: Cell[][], row: number, column: number): Array<[number, number]> {
  const seat = board[row]![column]
  if (seat === null || seat === undefined) return []
  const found: Array<[number, number]> = []
  for (const [dr, dc] of DIRECTIONS) {
    const cells: Array<[number, number]> = [[row, column]]
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = column + dc * sign
      while (r >= 0 && r < ROWS && c >= 0 && c < COLUMNS && board[r]![c] === seat) {
        cells.push([r, c])
        r += dr * sign
        c += dc * sign
      }
    }
    if (cells.length >= CONNECT) found.push(...cells)
  }
  return found
}

export function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => new Array<Cell>(COLUMNS).fill(null))
}

/**
 * The game after `moves`, `starter` having opened. A move that could not have been
 * played — into a full column, off the board, after the end — is skipped rather than
 * trusted: the server refuses those, but the rules do not rely on it.
 */
export function replay(moves: readonly number[], starter: Seat = 0): Connect4 {
  const board = emptyBoard()
  let next: Seat = starter
  let winner: Seat | null = null
  let line: Array<[number, number]> = []
  let played = 0

  for (const column of moves) {
    if (winner !== null || played === ROWS * COLUMNS) break
    const row = landingRow(board, column)
    if (row === null) continue
    board[row]![column] = next
    played++
    line = lineThrough(board, row, column)
    if (line.length) winner = next
    next = next === 0 ? 1 : 0
  }

  const draw = winner === null && played === ROWS * COLUMNS
  return { board, next, winner, line, draw, over: winner !== null || draw, played }
}
