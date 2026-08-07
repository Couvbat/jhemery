import { describe, expect, it } from 'vitest'
import * as tetris from '../games/tetris'

/** Always hands out the same piece, so a test can reason about one shape. */
const always = (id: tetris.PieceId) => {
  const at = tetris.PIECE_IDS.indexOf(id)
  return () => at / tetris.PIECE_IDS.length
}

function emptyWell(): tetris.TetrisState['well'] {
  return Array.from({ length: tetris.WIDTH * tetris.HEIGHT }, () => null)
}

/** Fills a row, optionally leaving one column open. */
function fillRow(well: tetris.TetrisState['well'], y: number, gapAt?: number) {
  for (let x = 0; x < tetris.WIDTH; x++) {
    if (x !== gapAt) well[y * tetris.WIDTH + x] = 'O'
  }
}

describe('piece tables', () => {
  it('gives every piece four rotations of four cells', () => {
    for (const id of tetris.PIECE_IDS) {
      expect(tetris.PIECES[id]).toHaveLength(4)
      for (const rotation of tetris.PIECES[id]) expect(rotation).toHaveLength(4)
    }
  })

  it('keeps every cell inside the 4×4 box', () => {
    for (const id of tetris.PIECE_IDS) {
      for (const rotation of tetris.PIECES[id]) {
        for (const [x, y] of rotation) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThan(4)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThan(4)
        }
      }
    }
  })

  it('leaves the O piece unchanged by rotation', () => {
    const [first, ...rest] = tetris.PIECES.O
    for (const rotation of rest) expect(rotation).toEqual(first)
  })
})

describe('gravity', () => {
  it('moves the piece down one row', () => {
    const state = tetris.newGame(always('I'))
    expect(tetris.tick(state, always('I')).piece.y).toBe(state.piece.y + 1)
  })

  it('settles the piece into the well when it reaches the floor', () => {
    let state = tetris.newGame(always('O'))

    // Stop at the tick that locks, rather than a fixed count — past that point
    // the *replacement* piece is falling and its position proves nothing.
    let ticks = 0
    while (state.well.every((cell) => cell === null) && ticks++ < 100) {
      state = tetris.tick(state, always('O'))
    }

    expect(state.well.filter((cell) => cell !== null)).toHaveLength(4)
    // The settled piece has been replaced by a fresh one at the top.
    expect(state.piece.y).toBe(0)
  })
})

describe('shift', () => {
  it('moves sideways', () => {
    const state = tetris.newGame(always('O'))
    expect(tetris.shift(state, -1).piece.x).toBe(state.piece.x - 1)
    expect(tetris.shift(state, 1).piece.x).toBe(state.piece.x + 1)
  })

  it('refuses to leave the well rather than sliding along the wall', () => {
    let state = tetris.newGame(always('O'))
    for (let i = 0; i < tetris.WIDTH; i++) state = tetris.shift(state, -1)

    const stuck = tetris.shift(state, -1)
    expect(stuck).toBe(state)
    expect(tetris.cellsOf(state.piece).every(([x]) => x >= 0)).toBe(true)
  })

  it('refuses to move into a settled cell', () => {
    const well = emptyWell()
    fillRow(well, 5)
    const state: tetris.TetrisState = {
      ...tetris.newGame(always('O')),
      well,
      piece: { id: 'O', rotation: 0, x: 4, y: 4 },
    }

    // Down is blocked by the filled row, so a tick must lock rather than pass through.
    expect(tetris.tick(state, always('O')).piece.y).toBeLessThan(4)
  })
})

describe('rotate', () => {
  it('cycles through the four rotations', () => {
    let state = tetris.newGame(always('T'))
    const seen = [state.piece.rotation]
    for (let i = 0; i < 4; i++) {
      state = tetris.rotate(state)
      seen.push(state.piece.rotation)
    }
    expect(seen).toEqual([0, 1, 2, 3, 0])
  })

  /*
   * Not SRS: try in place, then one cell left, then one right, then refuse. A
   * full kick table legalises rotations a player never attempts on a 10-wide
   * well; this is what they actually feel as "the rotation works".
   */
  it('nudges off a wall rather than refusing', () => {
    // An I piece flat against the left wall cannot rotate in place at every
    // rotation, but shifting one cell makes it fit.
    const state: tetris.TetrisState = {
      ...tetris.newGame(always('I')),
      piece: { id: 'I', rotation: 1, x: -2, y: 5 },
    }

    const rotated = tetris.rotate(state)
    expect(tetris.collides(rotated.well, rotated.piece)).toBe(false)
  })

  it('refuses when no nudge fits', () => {
    // Walled in on both sides: nothing to give.
    const well = emptyWell()
    for (let y = 0; y < tetris.HEIGHT; y++) {
      for (let x = 0; x < tetris.WIDTH; x++) {
        if (x < 3 || x > 5) well[y * tetris.WIDTH + x] = 'O'
      }
    }

    const state: tetris.TetrisState = {
      ...tetris.newGame(always('I')),
      well,
      piece: { id: 'I', rotation: 1, x: 2, y: 5 },
    }
    expect(tetris.rotate(state)).toBe(state)
  })
})

describe('line clears', () => {
  it('removes a full row and drops what was above it', () => {
    const well = emptyWell()
    fillRow(well, tetris.HEIGHT - 1, 0)
    well[(tetris.HEIGHT - 3) * tetris.WIDTH + 9] = 'T' // a marker to watch fall

    const state: tetris.TetrisState = {
      ...tetris.newGame(always('I')),
      well,
      piece: { id: 'I', rotation: 1, x: -2, y: tetris.HEIGHT - 4 },
    }

    const dropped = tetris.hardDrop(state, always('I'))

    expect(dropped.lines).toBe(1)
    expect(dropped.score).toBe(100)
    // The marker was two rows above the cleared line and is now one row lower.
    expect(dropped.well[(tetris.HEIGHT - 2) * tetris.WIDTH + 9]).toBe('T')
  })

  it('scores four rows at once far above four singles', () => {
    const well = emptyWell()
    for (let y = tetris.HEIGHT - 4; y < tetris.HEIGHT; y++) fillRow(well, y, 0)

    const state: tetris.TetrisState = {
      ...tetris.newGame(always('I')),
      well,
      piece: { id: 'I', rotation: 1, x: -2, y: tetris.HEIGHT - 4 },
    }

    const dropped = tetris.hardDrop(state, always('I'))
    expect(dropped.lines).toBe(4)
    expect(dropped.score).toBe(800)
  })

  it('leaves an incomplete row alone', () => {
    const well = emptyWell()
    fillRow(well, tetris.HEIGHT - 1, 0)
    fillRow(well, tetris.HEIGHT - 2, 0)

    const state: tetris.TetrisState = {
      ...tetris.newGame(always('O')),
      well,
      piece: { id: 'O', rotation: 0, x: 4, y: 0 },
    }

    const dropped = tetris.hardDrop(state, always('O'))
    expect(dropped.lines).toBe(0)
    expect(dropped.score).toBe(0)
  })
})

describe('hardDrop', () => {
  it('lands the piece on the floor in one move', () => {
    const state = tetris.newGame(always('O'))
    const dropped = tetris.hardDrop(state, always('O'))

    // Bottom two rows now hold the O piece.
    const bottom = dropped.well.slice((tetris.HEIGHT - 1) * tetris.WIDTH)
    expect(bottom.filter((cell) => cell !== null)).toHaveLength(2)
  })

  it('stacks on what is already there', () => {
    let state = tetris.newGame(always('O'))
    state = tetris.hardDrop(state, always('O'))
    state = tetris.hardDrop(state, always('O'))

    expect(state.well.filter((cell) => cell !== null)).toHaveLength(8)
  })
})

describe('game over', () => {
  it('ends when a new piece has nowhere to spawn', () => {
    let state = tetris.newGame(always('O'))

    // Drop O pieces down one column until they reach the ceiling.
    for (let i = 0; i < tetris.HEIGHT && !state.dead; i++) {
      state = tetris.hardDrop(state, always('O'))
    }

    expect(state.dead).toBe(true)
  })

  it('ignores every input once dead', () => {
    const dead: tetris.TetrisState = { ...tetris.newGame(always('O')), dead: true }
    expect(tetris.tick(dead)).toBe(dead)
    expect(tetris.shift(dead, 1)).toBe(dead)
    expect(tetris.rotate(dead)).toBe(dead)
    expect(tetris.hardDrop(dead)).toBe(dead)
  })
})
