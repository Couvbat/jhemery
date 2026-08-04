import { describe, expect, it } from 'vitest'
import { HEIGHT, WIDTH, newGame, step, turn } from '../games/snake'
import type { SnakeState } from '../games/snake'

/** A snake laid out head-first along a row, with the food parked out of the way. */
function state(partial: Partial<SnakeState> = {}): SnakeState {
  return {
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
    dir: 'right',
    food: { x: 20, y: 10 },
    score: 0,
    dead: false,
    ...partial,
  }
}

describe('step', () => {
  it('moves the head and drags the tail', () => {
    const next = step(state())
    expect(next.snake[0]).toEqual({ x: 6, y: 5 })
    expect(next.snake).toHaveLength(3)
  })

  it('dies against a wall', () => {
    const next = step(state({ snake: [{ x: WIDTH - 1, y: 5 }], dir: 'right' }))
    expect(next.dead).toBe(true)
  })

  it('dies against the top wall too', () => {
    expect(step(state({ snake: [{ x: 3, y: 0 }], dir: 'up' })).dead).toBe(true)
    expect(step(state({ snake: [{ x: 3, y: HEIGHT - 1 }], dir: 'down' })).dead).toBe(true)
  })

  it('dies on its own body', () => {
    // Curled into a hook: heading left walks the head into its own fourth
    // segment, which is not the tail and so does not vacate in time.
    const next = step(
      state({
        snake: [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 4, y: 6 },
          { x: 4, y: 5 },
          { x: 3, y: 5 },
        ],
        dir: 'left',
      }),
    )
    expect(next.dead).toBe(true)
  })

  it('survives moving into the cell its tail is leaving', () => {
    // The tail vacates on the same tick, so this is a legal move, not a death.
    const next = step(
      state({
        snake: [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 4, y: 6 },
          { x: 4, y: 5 },
        ],
        dir: 'left',
      }),
    )
    expect(next.dead).toBe(false)
  })

  it('grows and scores on food', () => {
    const next = step(state({ food: { x: 6, y: 5 } }), () => 0)
    expect(next.snake).toHaveLength(4)
    expect(next.score).toBe(1)
  })

  it('moves the food off the snake once eaten', () => {
    const next = step(state({ food: { x: 6, y: 5 } }), () => 0)
    expect(next.snake.some((part) => part.x === next.food.x && part.y === next.food.y)).toBe(false)
  })

  it('does nothing once dead', () => {
    const dead = state({ dead: true })
    expect(step(dead)).toBe(dead)
  })
})

describe('turn', () => {
  it('accepts a right angle', () => {
    expect(turn(state(), 'up').dir).toBe('up')
  })

  it('ignores a reversal into its own neck rather than dying', () => {
    expect(turn(state(), 'left').dir).toBe('right')
  })
})

describe('newGame', () => {
  it('starts inside the walls, heading right', () => {
    const start = newGame(() => 0)
    expect(start.dir).toBe('right')
    expect(start.dead).toBe(false)
    for (const part of start.snake) {
      expect(part.x).toBeGreaterThanOrEqual(0)
      expect(part.y).toBeGreaterThanOrEqual(0)
      expect(part.x).toBeLessThan(WIDTH)
      expect(part.y).toBeLessThan(HEIGHT)
    }
  })

  it('never puts the food under the snake', () => {
    const start = newGame(() => 0)
    expect(start.snake.some((part) => part.x === start.food.x && part.y === start.food.y)).toBe(
      false,
    )
  })

  it('has room to move before the first wall', () => {
    // A start pressed against the right wall would kill on tick one.
    expect(step(newGame(() => 0)).dead).toBe(false)
  })
})
