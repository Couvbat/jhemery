/**
 * Tetris, as plain functions over plain arrays — no Vue, no OutputLine, no
 * timers. The renderer lives in `commands/games/tetris.ts` and owns the tick.
 *
 * The 2026-08-04 games spec put this out of scope as "an order of magnitude more
 * code, for a game that reads worse in a monospace grid". Both halves stopped
 * being true: snake built the tick loop this copies, and the rendering objection
 * is answered by drawing two characters per cell so the well is square rather
 * than squashed to half height. See the vol. 2 spec.
 */

import type { Random } from './2048'

export const WIDTH = 10
export const HEIGHT = 18

export type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

export const PIECE_IDS: PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

/**
 * The seven pieces, written as the shapes they are.
 *
 * Four rotations each, spelled out rather than derived: a rotation function is
 * shorter to write and much harder to read than the picture, and these never
 * change. Parsed once at module load into `[x, y]` offset lists, so the hot path
 * is an array walk rather than string indexing.
 */
const SHAPES: Record<PieceId, string[]> = {
  I: [
    '....|####|....|....',
    '..#.|..#.|..#.|..#.',
    '....|....|####|....',
    '.#..|.#..|.#..|.#..',
  ],
  O: [
    '.##.|.##.|....|....',
    '.##.|.##.|....|....',
    '.##.|.##.|....|....',
    '.##.|.##.|....|....',
  ],
  T: [
    '.#..|###.|....|....',
    '.#..|.##.|.#..|....',
    '....|###.|.#..|....',
    '.#..|##..|.#..|....',
  ],
  S: [
    '.##.|##..|....|....',
    '.#..|.##.|..#.|....',
    '....|.##.|##..|....',
    '#...|##..|.#..|....',
  ],
  Z: [
    '##..|.##.|....|....',
    '..#.|.##.|.#..|....',
    '....|##..|.##.|....',
    '.#..|##..|#...|....',
  ],
  J: [
    '#...|###.|....|....',
    '.##.|.#..|.#..|....',
    '....|###.|..#.|....',
    '.#..|.#..|##..|....',
  ],
  L: [
    '..#.|###.|....|....',
    '.#..|.#..|.##.|....',
    '....|###.|#...|....',
    '##..|.#..|.#..|....',
  ],
}

export type Offsets = ReadonlyArray<readonly [number, number]>

/** Turns one piece's four pictures into its filled cells. */
function parse(id: PieceId): Offsets[] {
  return SHAPES[id].map((rotation) =>
    rotation
      .split('|')
      .flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [[x, y] as const] : []))),
  )
}

/** `PIECES[id][rotation]` → the filled cells of that rotation, as `[x, y]`. */
export const PIECES: Record<PieceId, Offsets[]> = {
  I: parse('I'),
  O: parse('O'),
  T: parse('T'),
  S: parse('S'),
  Z: parse('Z'),
  J: parse('J'),
  L: parse('L'),
}

export interface Piece {
  id: PieceId
  rotation: number
  x: number
  y: number
}

export interface TetrisState {
  /** `WIDTH * HEIGHT` cells in row-major order; `null` is empty. Cells keep the id
   *  of the piece that settled there so the renderer can colour by piece. */
  well: (PieceId | null)[]
  piece: Piece
  next: PieceId
  score: number
  lines: number
  dead: boolean
}

const index = (x: number, y: number) => y * WIDTH + x

function randomPiece(random: Random): PieceId {
  return PIECE_IDS[Math.floor(random() * PIECE_IDS.length)]!
}

/** Spawned centred, and high enough that the 4×4 box clears the top edge. */
function spawn(id: PieceId): Piece {
  return { id, rotation: 0, x: Math.floor(WIDTH / 2) - 2, y: 0 }
}

export function newGame(random: Random = Math.random): TetrisState {
  return {
    well: Array.from({ length: WIDTH * HEIGHT }, () => null),
    piece: spawn(randomPiece(random)),
    next: randomPiece(random),
    score: 0,
    lines: 0,
    dead: false,
  }
}

/** The absolute cells a piece occupies. */
export function cellsOf(piece: Piece): Array<[number, number]> {
  return PIECES[piece.id][piece.rotation]!.map(([x, y]) => [piece.x + x, piece.y + y])
}

/** True when a piece would overlap a wall, the floor or a settled cell. Above the
 *  top edge is allowed, so a piece can spawn partly off-screen and fall in. */
export function collides(well: TetrisState['well'], piece: Piece): boolean {
  return cellsOf(piece).some(
    ([x, y]) => x < 0 || x >= WIDTH || y >= HEIGHT || (y >= 0 && well[index(x, y)] !== null),
  )
}

/** Standard scoring table: clearing four rows at once is worth more than four
 *  singles, which is the entire reason to stack rather than tidy. */
const LINE_SCORES = [0, 100, 300, 500, 800]

/** Drops every full row and returns the compacted well. */
function clearLines(well: TetrisState['well']): { well: TetrisState['well']; cleared: number } {
  const kept: (PieceId | null)[][] = []

  for (let y = 0; y < HEIGHT; y++) {
    const row = well.slice(y * WIDTH, (y + 1) * WIDTH)
    if (row.some((cell) => cell === null)) kept.push(row)
  }

  const cleared = HEIGHT - kept.length
  const empty = Array.from({ length: cleared }, () => Array.from({ length: WIDTH }, () => null))
  return { well: [...empty, ...kept].flat(), cleared }
}

/** Settles the current piece, clears what it filled, and brings in the next one.
 *  A new piece that has nowhere to go is the end of the game. */
function lock(state: TetrisState, random: Random): TetrisState {
  const well = [...state.well]
  for (const [x, y] of cellsOf(state.piece)) {
    if (y >= 0) well[index(x, y)] = state.piece.id
  }

  const { well: settled, cleared } = clearLines(well)
  const piece = spawn(state.next)

  return {
    ...state,
    well: settled,
    piece,
    next: randomPiece(random),
    score: state.score + LINE_SCORES[cleared]!,
    lines: state.lines + cleared,
    dead: collides(settled, piece),
  }
}

/** One row of gravity: the piece falls, or settles where it is. */
export function tick(state: TetrisState, random: Random = Math.random): TetrisState {
  if (state.dead) return state

  const moved = { ...state.piece, y: state.piece.y + 1 }
  return collides(state.well, moved) ? lock(state, random) : { ...state, piece: moved }
}

/** Sideways. Refused rather than clamped, so a piece against a wall stays put
 *  instead of sliding along it. */
export function shift(state: TetrisState, dx: number): TetrisState {
  if (state.dead) return state
  const moved = { ...state.piece, x: state.piece.x + dx }
  return collides(state.well, moved) ? state : { ...state, piece: moved }
}

/**
 * Rotates clockwise.
 *
 * Deliberately **not** SRS: try in place, then one cell left, then one cell right,
 * then refuse. A real kick table is a page of data to make rotations legal that a
 * player never attempts on a 10-wide well, and this three-step version is what
 * they actually feel as "the rotation works".
 */
export function rotate(state: TetrisState): TetrisState {
  if (state.dead) return state

  const rotation = (state.piece.rotation + 1) % 4
  for (const dx of [0, -1, 1]) {
    const candidate = { ...state.piece, rotation, x: state.piece.x + dx }
    if (!collides(state.well, candidate)) return { ...state, piece: candidate }
  }
  return state
}

/** Drops the piece as far as it goes and settles it immediately. */
export function hardDrop(state: TetrisState, random: Random = Math.random): TetrisState {
  if (state.dead) return state

  let piece = state.piece
  while (!collides(state.well, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 }
  return lock({ ...state, piece }, random)
}
