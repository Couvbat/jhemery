/**
 * Minesweeper, as plain functions over plain arrays — no Vue, no OutputLine, no
 * timers. The renderer lives in `commands/games/minesweeper.ts`.
 *
 * Turn-based like 2048, so there is no tick loop and `prefers-reduced-motion` is
 * a non-issue.
 */

import type { Dir, Random } from './2048'

export const WIDTH = 16
export const HEIGHT = 10
export const MINES = 25

export interface Cell {
  mine: boolean
  revealed: boolean
  flagged: boolean
  /** Mines among the eight neighbours. Meaningless until mines are laid. */
  near: number
}

export interface MinesweeperState {
  /** `WIDTH * HEIGHT` cells in row-major order. */
  cells: Cell[]
  cursor: { x: number; y: number }
  /** False until the first reveal — see `layMines`. */
  laid: boolean
  dead: boolean
  won: boolean
}

const index = (x: number, y: number) => y * WIDTH + x

const inside = (x: number, y: number) => x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT

/** The up-to-eight neighbours of a cell, as indices. */
function neighbours(x: number, y: number): number[] {
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if ((dx || dy) && inside(x + dx, y + dy)) out.push(index(x + dx, y + dy))
    }
  }
  return out
}

export function newGame(): MinesweeperState {
  return {
    cells: Array.from({ length: WIDTH * HEIGHT }, () => ({
      mine: false,
      revealed: false,
      flagged: false,
      near: 0,
    })),
    cursor: { x: Math.floor(WIDTH / 2), y: Math.floor(HEIGHT / 2) },
    laid: false,
    dead: false,
    won: false,
  }
}

/**
 * Lays `MINES` mines anywhere except the opened cell **and its neighbours**, then
 * fills in the neighbour counts.
 *
 * Deferring this to the first reveal is what stops the game opening with a loss.
 * Excluding the neighbours too (not just the cell itself) is the other half: it
 * guarantees the first reveal flood-fills a region rather than showing one number
 * and leaving the player to guess, which is the same problem one move later.
 */
function layMines(cells: Cell[], safeX: number, safeY: number, random: Random): Cell[] {
  const forbidden = new Set([index(safeX, safeY), ...neighbours(safeX, safeY)])
  const candidates = cells.flatMap((_, i) => (forbidden.has(i) ? [] : [i]))

  // Partial Fisher–Yates: only the first MINES draws matter.
  for (let i = 0; i < MINES && i < candidates.length; i++) {
    const pick = i + Math.floor(random() * (candidates.length - i))
    ;[candidates[i], candidates[pick]] = [candidates[pick]!, candidates[i]!]
  }

  const next = cells.map((cell) => ({ ...cell }))
  for (const cell of candidates.slice(0, MINES)) next[cell]!.mine = true

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      next[index(x, y)]!.near = neighbours(x, y).filter((i) => next[i]!.mine).length
    }
  }
  return next
}

/** Every non-mine cell revealed. Flags are irrelevant: mis-flagging every mine and
 *  clearing the rest is still a win, which is how the game has always worked. */
export function isWon(cells: Cell[]): boolean {
  return cells.every((cell) => cell.mine || cell.revealed)
}

/**
 * Reveals `(x, y)`, flood-filling outwards while the region has no adjacent mines.
 * A flagged or already-revealed cell is a no-op — the flag is there precisely to
 * stop a mis-aimed reveal.
 */
export function reveal(
  state: MinesweeperState,
  x: number,
  y: number,
  random: Random = Math.random,
): MinesweeperState {
  if (state.dead || state.won || !inside(x, y)) return state

  const start = index(x, y)
  if (state.cells[start]!.flagged || state.cells[start]!.revealed) return state

  const cells = state.laid
    ? state.cells.map((cell) => ({ ...cell }))
    : layMines(state.cells, x, y, random)

  if (cells[start]!.mine) {
    // Losing shows the whole field, as every implementation does — the board is
    // left in the buffer and there is nothing left to protect.
    for (const cell of cells) if (cell.mine) cell.revealed = true
    return { ...state, cells, laid: true, dead: true }
  }

  const queue = [start]
  while (queue.length) {
    const current = queue.pop()!
    const cell = cells[current]!
    if (cell.revealed || cell.flagged) continue
    cell.revealed = true
    // Only a zero opens its neighbours; a number is the edge of the region.
    if (cell.near === 0) {
      queue.push(...neighbours(current % WIDTH, Math.floor(current / WIDTH)))
    }
  }

  return { ...state, cells, laid: true, won: isWon(cells) }
}

/** Flags are advisory: they cost nothing and block a reveal. Revealed cells cannot
 *  be flagged, since there is no longer anything to warn about. */
export function toggleFlag(state: MinesweeperState, x: number, y: number): MinesweeperState {
  if (state.dead || state.won || !inside(x, y)) return state
  const at = index(x, y)
  if (state.cells[at]!.revealed) return state

  const cells = state.cells.map((cell) => ({ ...cell }))
  cells[at]!.flagged = !cells[at]!.flagged
  return { ...state, cells }
}

/** Clamped, not wrapped: a cursor that teleports across the board on a held arrow
 *  loses the player their place. */
export function moveCursor(state: MinesweeperState, dir: Dir): MinesweeperState {
  const { x, y } = state.cursor
  const next = {
    left: { x: x - 1, y },
    right: { x: x + 1, y },
    up: { x, y: y - 1 },
    down: { x, y: y + 1 },
  }[dir]

  return {
    ...state,
    cursor: {
      x: Math.min(WIDTH - 1, Math.max(0, next.x)),
      y: Math.min(HEIGHT - 1, Math.max(0, next.y)),
    },
  }
}

/** Mines left to find, by the player's own flag count — it can go negative if they
 *  over-flag, and showing that is more useful than clamping it at zero. */
export function minesRemaining(state: MinesweeperState): number {
  return MINES - state.cells.filter((cell) => cell.flagged).length
}
