import { describe, expect, it } from 'vitest'
import * as c4 from '../games/connect4'

/** Moves for seat 0 and seat 1 alternating, as the server would have accepted them. */
const moves = (...columns: number[]) => columns

describe('replay', () => {
  it('stacks pieces from the bottom up', () => {
    const state = c4.replay(moves(3, 3, 3))
    expect(state.board[5]![3]).toBe(0)
    expect(state.board[4]![3]).toBe(1)
    expect(state.board[3]![3]).toBe(0)
    expect(state.next).toBe(1)
    expect(state.played).toBe(3)
  })

  it('finds four across', () => {
    // 0 plays 0,1,2,3 on the floor; 1 stacks on top of them.
    const state = c4.replay(moves(0, 0, 1, 1, 2, 2, 3))
    expect(state.winner).toBe(0)
    expect(state.over).toBe(true)
    expect(state.line).toHaveLength(4)
  })

  it('finds four down', () => {
    const state = c4.replay(moves(0, 1, 0, 1, 0, 1, 0))
    expect(state.winner).toBe(0)
    expect(state.line.every(([, c]) => c === 0)).toBe(true)
  })

  it('finds both diagonals', () => {
    // A rising diagonal for 0: (5,0) (4,1) (3,2) (2,3).
    const rising = c4.replay(moves(0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3))
    expect(rising.winner).toBe(0)
    // Mirror it for a falling one.
    const falling = c4.replay(moves(6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3))
    expect(falling.winner).toBe(0)
  })

  it('credits the second seat, and the other starter', () => {
    expect(c4.replay(moves(0, 1, 0, 1, 0, 1, 6, 1)).winner).toBe(1)
    // The same moves with seat 1 opening: now seat 1 owns column 0.
    expect(c4.replay(moves(0, 1, 0, 1, 0, 1, 0), 1).winner).toBe(1)
  })

  it('ignores whatever comes after the win', () => {
    const state = c4.replay(moves(0, 1, 0, 1, 0, 1, 0, 1, 1, 1))
    expect(state.played).toBe(7)
    expect(state.winner).toBe(0)
  })

  it('skips a move into a full column rather than trusting it', () => {
    const state = c4.replay(moves(2, 2, 2, 2, 2, 2, 2))
    expect(state.played).toBe(6)
    expect(state.next).toBe(0)
  })

  it('calls a full board with no line a draw', () => {
    // Columns filled in a pattern that never lines four up: pairs swapped each row.
    const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6]
    const state = c4.replay(order)
    expect(state.winner).toBeNull()
    expect(state.draw).toBe(true)
    expect(state.played).toBe(42)
  })
})

describe('landingRow', () => {
  it('is the lowest empty row, or null for a full or missing column', () => {
    const board = c4.replay(moves(4, 4)).board
    expect(c4.landingRow(board, 4)).toBe(3)
    expect(c4.landingRow(c4.replay(moves(1, 1, 1, 1, 1, 1)).board, 1)).toBeNull()
    expect(c4.landingRow(board, 7)).toBeNull()
  })
})
