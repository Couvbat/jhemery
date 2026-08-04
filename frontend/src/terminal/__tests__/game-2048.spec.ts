import { describe, expect, it } from 'vitest'
import { emptyBoard, isDead, maxTile, move, newGame, spawn } from '../games/2048'
import type { Board } from '../games/2048'

/**
 * The board is the whole game, and it is pure — so every rule that would
 * otherwise only be checkable by playing (merge once per move, no spawn on a
 * no-op move, dead only when truly stuck) is checkable here instead.
 */

/** Reads a board as four rows of four, so the fixtures look like the grid. */
function board(rows: number[][]): Board {
  return rows.flat()
}

describe('move', () => {
  it('slides tiles to the wall', () => {
    const result = move(
      board([
        [0, 0, 0, 2],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    )
    expect(result.board.slice(0, 4)).toEqual([2, 0, 0, 0])
    expect(result.moved).toBe(true)
  })

  it('merges an equal pair and scores the result', () => {
    const result = move(
      board([
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    )
    expect(result.board.slice(0, 4)).toEqual([4, 0, 0, 0])
    expect(result.gained).toBe(4)
  })

  it('merges each tile at most once per move', () => {
    // 2 2 2 2 is 4 4, never 8 — the classic off-by-one in this game.
    const result = move(
      board([
        [2, 2, 2, 2],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    )
    expect(result.board.slice(0, 4)).toEqual([4, 4, 0, 0])
    expect(result.gained).toBe(8)
  })

  it('merges the pair nearest the wall first', () => {
    const result = move(
      board([
        [2, 2, 4, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'left',
    )
    expect(result.board.slice(0, 4)).toEqual([4, 4, 0, 0])
  })

  it('reports a move that changes nothing', () => {
    const stuck = board([
      [2, 4, 2, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(move(stuck, 'up').moved).toBe(false)
  })

  it('moves columns as well as rows', () => {
    const result = move(
      board([
        [2, 0, 0, 0],
        [2, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
      'down',
    )
    expect(result.board).toEqual(board([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [4, 0, 0, 0],
    ]))
  })

  it('leaves the input board untouched', () => {
    const before = board([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    move(before, 'left')
    expect(before[0]).toBe(2)
    expect(before[1]).toBe(2)
  })
})

describe('spawn', () => {
  it('fills exactly one empty cell', () => {
    const next = spawn(emptyBoard(), () => 0)
    expect(next.filter((value) => value !== 0)).toHaveLength(1)
  })

  it('spawns a 4 one time in ten', () => {
    // First draw picks the cell, second decides the value.
    const draws = [0, 0.95]
    const next = spawn(emptyBoard(), () => draws.shift() ?? 0)
    expect(next[0]).toBe(4)
  })

  it('leaves a full board alone', () => {
    const full = Array.from({ length: 16 }, (_, i) => i + 1)
    expect(spawn(full, () => 0)).toEqual(full)
  })
})

describe('newGame', () => {
  it('opens with two tiles', () => {
    const draws = [0, 0, 0.5, 0]
    const start = newGame(() => draws.shift() ?? 0)
    expect(start.filter((value) => value !== 0)).toHaveLength(2)
  })
})

describe('isDead', () => {
  it('is alive while a cell is empty', () => {
    expect(isDead(emptyBoard())).toBe(false)
  })

  it('is alive on a full board with a merge left', () => {
    expect(
      isDead(
        board([
          [2, 2, 4, 8],
          [4, 8, 16, 32],
          [2, 4, 8, 16],
          [4, 8, 16, 32],
        ]),
      ),
    ).toBe(false)
  })

  it('is dead when no neighbours match', () => {
    expect(
      isDead(
        board([
          [2, 4, 2, 4],
          [4, 2, 4, 2],
          [2, 4, 2, 4],
          [4, 2, 4, 2],
        ]),
      ),
    ).toBe(true)
  })
})

describe('maxTile', () => {
  it('finds the biggest tile — the achievement threshold reads it', () => {
    expect(maxTile(board([
      [2, 4, 8, 16],
      [0, 0, 256, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]))).toBe(256)
  })
})
