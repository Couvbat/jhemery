import { describe, expect, it } from 'vitest'
import * as mines from '../games/minesweeper'

/** A deterministic `Random` that walks a fixed sequence, so mine layouts are the
 *  same on every machine. */
function seeded(seed = 1): () => number {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

const at = (state: mines.MinesweeperState, x: number, y: number) =>
  state.cells[y * mines.WIDTH + x]!

describe('newGame', () => {
  it('starts with no mines laid and nothing revealed', () => {
    const state = mines.newGame()
    expect(state.laid).toBe(false)
    expect(state.cells).toHaveLength(mines.WIDTH * mines.HEIGHT)
    expect(state.cells.every((cell) => !cell.mine && !cell.revealed && !cell.flagged)).toBe(true)
  })
})

describe('the first reveal', () => {
  /*
   * The rule that stops the game opening with a loss. Mines are laid *after* the
   * first click, excluding it and its neighbours — so the opener always flood-
   * fills a region rather than showing one number and leaving the player to guess.
   */
  it('is never a mine, wherever it lands', () => {
    for (let x = 0; x < mines.WIDTH; x++) {
      for (let y = 0; y < mines.HEIGHT; y++) {
        const state = mines.reveal(mines.newGame(), x, y, seeded(x * 31 + y))
        expect(at(state, x, y).mine).toBe(false)
        expect(state.dead).toBe(false)
      }
    }
  })

  it('leaves the opened cell with no adjacent mines, so it opens a region', () => {
    const state = mines.reveal(mines.newGame(), 8, 5, seeded())
    expect(at(state, 8, 5).near).toBe(0)
    expect(state.cells.filter((cell) => cell.revealed).length).toBeGreaterThan(1)
  })

  it('lays exactly MINES mines', () => {
    const state = mines.reveal(mines.newGame(), 3, 3, seeded())
    expect(state.cells.filter((cell) => cell.mine)).toHaveLength(mines.MINES)
  })

  it('counts each cell’s neighbours correctly', () => {
    const state = mines.reveal(mines.newGame(), 3, 3, seeded())

    for (let x = 0; x < mines.WIDTH; x++) {
      for (let y = 0; y < mines.HEIGHT; y++) {
        let expected = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= mines.WIDTH || ny < 0 || ny >= mines.HEIGHT) continue
            if (at(state, nx, ny).mine) expected++
          }
        }
        expect(at(state, x, y).near).toBe(expected)
      }
    }
  })
})

describe('reveal', () => {
  it('flood-fills only through cells with no adjacent mines', () => {
    const state = mines.reveal(mines.newGame(), 8, 5, seeded())

    // Every revealed cell is either a zero, or touches one that is — a number is
    // the edge of the region, never the middle of it.
    for (let x = 0; x < mines.WIDTH; x++) {
      for (let y = 0; y < mines.HEIGHT; y++) {
        if (!at(state, x, y).revealed || at(state, x, y).near === 0) continue

        let touchesZero = false
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || nx >= mines.WIDTH || ny < 0 || ny >= mines.HEIGHT) continue
            if (at(state, nx, ny).revealed && at(state, nx, ny).near === 0) touchesZero = true
          }
        }
        expect(touchesZero).toBe(true)
      }
    }
  })

  it('never reveals a mine while the game is alive', () => {
    const state = mines.reveal(mines.newGame(), 8, 5, seeded())
    expect(state.cells.some((cell) => cell.mine && cell.revealed)).toBe(false)
  })

  it('refuses a flagged cell — the flag is there to stop exactly this', () => {
    let state = mines.reveal(mines.newGame(), 8, 5, seeded())
    const target = state.cells.findIndex((cell) => !cell.revealed)
    const x = target % mines.WIDTH
    const y = Math.floor(target / mines.WIDTH)

    state = mines.toggleFlag(state, x, y)
    expect(mines.reveal(state, x, y).cells[target]!.revealed).toBe(false)
  })

  it('ends the game and shows every mine when one is hit', () => {
    let state = mines.reveal(mines.newGame(), 8, 5, seeded())
    const mine = state.cells.findIndex((cell) => cell.mine)

    state = mines.reveal(state, mine % mines.WIDTH, Math.floor(mine / mines.WIDTH))

    expect(state.dead).toBe(true)
    expect(state.cells.filter((cell) => cell.mine).every((cell) => cell.revealed)).toBe(true)
  })

  it('does nothing once the game is over', () => {
    let state = mines.reveal(mines.newGame(), 8, 5, seeded())
    const mine = state.cells.findIndex((cell) => cell.mine)
    state = mines.reveal(state, mine % mines.WIDTH, Math.floor(mine / mines.WIDTH))

    expect(mines.reveal(state, 0, 0)).toBe(state)
  })

  it('ignores coordinates outside the board', () => {
    const state = mines.newGame()
    expect(mines.reveal(state, -1, 0)).toBe(state)
    expect(mines.reveal(state, 0, mines.HEIGHT)).toBe(state)
  })
})

describe('winning', () => {
  it('is reached by revealing every cell that is not a mine', () => {
    let state = mines.reveal(mines.newGame(), 8, 5, seeded())

    for (let y = 0; y < mines.HEIGHT; y++) {
      for (let x = 0; x < mines.WIDTH; x++) {
        if (!at(state, x, y).mine) state = mines.reveal(state, x, y)
      }
    }

    expect(state.won).toBe(true)
    expect(state.dead).toBe(false)
  })

  it('does not require the mines to be flagged', () => {
    const cells = Array.from({ length: mines.WIDTH * mines.HEIGHT }, (_, i) => ({
      mine: i < mines.MINES,
      revealed: i >= mines.MINES,
      flagged: false,
      near: 0,
    }))
    expect(mines.isWon(cells)).toBe(true)
  })
})

describe('flags', () => {
  it('toggle on and off', () => {
    let state = mines.newGame()
    state = mines.toggleFlag(state, 2, 2)
    expect(at(state, 2, 2).flagged).toBe(true)

    state = mines.toggleFlag(state, 2, 2)
    expect(at(state, 2, 2).flagged).toBe(false)
  })

  it('cannot be placed on a revealed cell', () => {
    const state = mines.reveal(mines.newGame(), 8, 5, seeded())
    expect(mines.toggleFlag(state, 8, 5)).toBe(state)
  })

  it('count down the mines remaining, and may go negative when over-flagged', () => {
    let state = mines.newGame()
    expect(mines.minesRemaining(state)).toBe(mines.MINES)

    for (let i = 0; i <= mines.MINES; i++) {
      state = mines.toggleFlag(state, i % mines.WIDTH, Math.floor(i / mines.WIDTH))
    }
    expect(mines.minesRemaining(state)).toBe(-1)
  })
})

describe('moveCursor', () => {
  it('moves in each direction', () => {
    const start = mines.newGame()
    expect(mines.moveCursor(start, 'left').cursor.x).toBe(start.cursor.x - 1)
    expect(mines.moveCursor(start, 'right').cursor.x).toBe(start.cursor.x + 1)
    expect(mines.moveCursor(start, 'up').cursor.y).toBe(start.cursor.y - 1)
    expect(mines.moveCursor(start, 'down').cursor.y).toBe(start.cursor.y + 1)
  })

  it('clamps at the edges rather than wrapping', () => {
    let state = mines.newGame()
    for (let i = 0; i < mines.WIDTH + 5; i++) state = mines.moveCursor(state, 'left')
    expect(state.cursor.x).toBe(0)

    for (let i = 0; i < mines.HEIGHT + 5; i++) state = mines.moveCursor(state, 'down')
    expect(state.cursor.y).toBe(mines.HEIGHT - 1)
  })
})
