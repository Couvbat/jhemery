import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bestScore, isLowerBetter, recordScore } from '../games/scores'

beforeEach(() => {
  window.localStorage.clear()
})

describe('direction', () => {
  it('counts higher as better for every game but minesweeper', () => {
    expect(isLowerBetter('minesweeper')).toBe(true)
    for (const game of ['2048', 'snake', 'tetris', 'wordle', 'hangman', 'wpm'] as const) {
      expect(isLowerBetter(game)).toBe(false)
    }
  })
})

describe('higher-is-better games', () => {
  it('returns 0 before anything is played', () => {
    expect(bestScore('tetris')).toBe(0)
  })

  it('keeps the highest score', () => {
    recordScore('tetris', 300)
    recordScore('tetris', 100)
    expect(bestScore('tetris')).toBe(300)

    recordScore('tetris', 900)
    expect(bestScore('tetris')).toBe(900)
  })
})

describe('minesweeper, where lower wins', () => {
  it('keeps the fastest clear', () => {
    recordScore('minesweeper', 90)
    expect(bestScore('minesweeper')).toBe(90)

    recordScore('minesweeper', 45)
    expect(bestScore('minesweeper')).toBe(45)

    // Slower than the record changes nothing.
    recordScore('minesweeper', 200)
    expect(bestScore('minesweeper')).toBe(45)
  })

  /*
   * The case the direction was added for. `0` doubles as "never played", so a
   * zero-second clear would read as no record at all *and*, if it were stored,
   * could never be beaten.
   */
  it('never stores a zero as an unbeatable record', () => {
    recordScore('minesweeper', 0)
    expect(bestScore('minesweeper')).toBe(0)

    recordScore('minesweeper', 30)
    expect(bestScore('minesweeper')).toBe(30)

    recordScore('minesweeper', 0)
    expect(bestScore('minesweeper')).toBe(30)
  })
})

describe('a game that was abandoned', () => {
  it('does not overwrite a record with a zero score', () => {
    recordScore('snake', 40)
    recordScore('snake', 0)
    expect(bestScore('snake')).toBe(40)
  })
})

describe('when localStorage is unavailable', () => {
  it('reports no record rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private browsing')
    })
    expect(bestScore('wordle')).toBe(0)
    vi.restoreAllMocks()
  })

  it('accepts a score it cannot persist', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => recordScore('wordle', 5)).not.toThrow()
    vi.restoreAllMocks()
  })

  it('ignores a corrupted stored value', () => {
    window.localStorage.setItem('couvbat:games:wpm', 'not a number')
    expect(bestScore('wpm')).toBe(0)
  })
})
