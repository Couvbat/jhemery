/**
 * Snake, as plain functions over plain objects — no Vue, no OutputLine, no timers.
 * The tick lives in the command; every rule lives here.
 */

export const WIDTH = 24
export const HEIGHT = 12
const START_LENGTH = 3

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface Point {
  x: number
  y: number
}

export interface SnakeState {
  /** Head first, tail last. */
  snake: Point[]
  dir: Dir
  food: Point
  /** Food eaten — length is `START_LENGTH + score`. */
  score: number
  dead: boolean
}

export type Random = () => number

const STEPS: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

function same(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

/** A random empty cell, or `null` when the snake fills the board. */
function placeFood(snake: Point[], random: Random): Point | null {
  const free: Point[] = []
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (!snake.some((part) => part.x === x && part.y === y)) free.push({ x, y })
    }
  }
  return free.length ? free[Math.floor(random() * free.length)]! : null
}

export function newGame(random: Random = Math.random): SnakeState {
  const y = Math.floor(HEIGHT / 2)
  const x = Math.floor(WIDTH / 4)
  // Head first, so the body trails off to the left and `right` is a legal opener.
  const snake = Array.from({ length: START_LENGTH }, (_, i) => ({ x: x - i, y }))

  return {
    snake,
    dir: 'right',
    food: placeFood(snake, random) ?? { x: WIDTH - 1, y },
    score: 0,
    dead: false,
  }
}

/** Queues a turn. A reversal into your own neck is ignored rather than fatal —
 *  the convention every implementation of this game has settled on. */
export function turn(state: SnakeState, dir: Dir): SnakeState {
  if (dir === OPPOSITE[state.dir] || dir === state.dir) return state
  return { ...state, dir }
}

export function step(state: SnakeState, random: Random = Math.random): SnakeState {
  if (state.dead) return state

  const delta = STEPS[state.dir]
  const head = { x: state.snake[0]!.x + delta.x, y: state.snake[0]!.y + delta.y }

  // Walls kill. Wrapping makes for longer, duller games.
  if (head.x < 0 || head.x >= WIDTH || head.y < 0 || head.y >= HEIGHT) {
    return { ...state, dead: true }
  }

  const eating = same(head, state.food)
  // The tail cell frees up on the same tick unless we grow into it.
  const body = eating ? state.snake : state.snake.slice(0, -1)
  if (body.some((part) => same(part, head))) {
    return { ...state, dead: true }
  }

  const snake = [head, ...body]
  return {
    ...state,
    snake,
    score: state.score + (eating ? 1 : 0),
    food: eating ? (placeFood(snake, random) ?? state.food) : state.food,
  }
}

export function length(state: SnakeState): number {
  return state.snake.length
}
