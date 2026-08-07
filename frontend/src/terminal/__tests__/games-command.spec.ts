import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Localised } from '@/content/types'
import { isUnlocked, unlocked } from '../achievements'
import { gameCommands } from '../commands/games'
import { move } from '../games/2048'
import type { Board, Dir } from '../games/2048'
import * as minesweeper from '../games/minesweeper'
import { HEIGHT, WIDTH } from '../games/snake'
import { answersFor } from '../games/words'
import type { Command, CommandContext, OutputLine } from '../types'

// Snake has two loops — a 120 ms tick and a reduced-motion step-per-keypress —
// and both have to reach the achievement. Flipped per test.
const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('@/composables/useCrt', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

/**
 * The achievements are the one thing the pure state modules cannot prove: they
 * live in the loop that joins state, renderer and `ctx.capture`. So these drive
 * the real commands through a stub context, exactly as a visitor's keyboard
 * would, and play until the thresholds fall.
 */

interface Harness {
  ctx: CommandContext
  /** The lines the last `ctx.frame()` draw wrote — the live board. */
  frame: () => OutputLine[]
  /** Everything the command pushed straight to the buffer. */
  printed: () => OutputLine[]
  press: (key: string) => void
  /** Ctrl+C / Esc. */
  abort: () => void
}

function harness(): Harness {
  let captured: ((key: string) => void) | null = null
  let current: OutputLine[] = []
  const written: OutputLine[] = []
  const controller = new AbortController()

  const ctx: CommandContext = {
    args: [],
    raw: '',
    locale: 'en',
    t: (<T,>(value: Localised<T>) => value.en) as CommandContext['t'],
    print: (input) => {
      written.push(...(typeof input === 'string' ? [{ text: input }] : [input].flat()))
    },
    frame: () => (lines: OutputLine[]) => {
      current = lines
    },
    clear: () => {},
    close: () => {},
    navigate: () => true,
    prompt: () => Promise.resolve(''),
    capture: (handler) => {
      captured = handler
      return () => {
        if (captured === handler) captured = null
      }
    },
    run: () => Promise.resolve(),
    effects: {} as CommandContext['effects'],
    signal: controller.signal,
  }

  return {
    ctx,
    frame: () => current,
    printed: () => written,
    press: (key: string) => captured?.(key),
    abort: () => controller.abort(),
  }
}

function command(name: string): Command {
  return gameCommands.find((c) => c.name === name)!
}

/** Board rows are the only lines built out of `│`. */
function gridRows(frame: OutputLine[]): string[] {
  return frame.filter((l) => l.text.startsWith('│')).map((l) => l.text)
}

beforeEach(() => {
  unlocked.value = new Set()
  window.localStorage.clear()
  motion.reduced = true
})

afterEach(() => {
  vi.useRealTimers()
})

describe('2048', () => {
  /** Reads the board back out of the rendered frame, the way a player does. */
  function readBoard(frame: OutputLine[]): Board {
    return gridRows(frame).flatMap((row) =>
      row
        .split('│')
        .slice(1, -1)
        .map((cell) => Number.parseInt(cell.trim(), 10) || 0),
    )
  }

  /** The usual gradient heuristic: reward big tiles pinned to the top-left and
   *  an open board. Greedy on this reaches 256 comfortably; "most merges now"
   *  does not, which is also why a casual player rarely gets there by accident. */
  const GRADIENT = [
    65536, 32768, 16384, 8192, 512, 1024, 2048, 4096, 256, 128, 64, 32, 2, 4, 8, 16,
  ]

  function score(board: Board): number {
    return board.reduce(
      (total, value, i) => total + value * GRADIENT[i]! + (value === 0 ? 20000 : 0),
      0,
    )
  }

  it('unlocks `game2048` when a 256 tile appears', async () => {
    // Seeded so the run is identical on every machine — a game this long would
    // otherwise be a coin flip in CI.
    let seed = 0x2048
    vi.spyOn(Math, 'random').mockImplementation(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0x100000000
    })

    const { ctx, frame, press } = harness()
    const finished = command('2048').run(ctx) as Promise<OutputLine[]>
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

    const KEYS: Record<Dir, string> = {
      left: 'ArrowLeft',
      up: 'ArrowUp',
      down: 'ArrowDown',
      right: 'ArrowRight',
    }

    let best = 0
    for (let i = 0; i < 4000 && best < 256; i++) {
      const board = readBoard(frame())
      best = Math.max(...board)

      const [choice] = (Object.keys(KEYS) as Dir[])
        .map((dir) => ({ dir, ...move(board, dir) }))
        .filter((option) => option.moved)
        .sort((a, b) => score(b.board) - score(a.board))

      // Dead: restart rather than ending the run early.
      press(choice ? KEYS[choice.dir] : 'r')
      await settle()
    }

    press('q')
    const lines = await finished

    expect(best).toBeGreaterThanOrEqual(256)
    expect(isUnlocked('game2048')).toBe(true)
    expect(lines.some((l) => l.text.includes('Tile Merchant'))).toBe(true)
  })

  it('does not unlock before 256', async () => {
    const { ctx, press } = harness()
    const finished = command('2048').run(ctx) as Promise<OutputLine[]>

    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
      press(key)
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    press('q')
    await finished

    expect(isUnlocked('game2048')).toBe(false)
  })
})

describe('snake', () => {
  interface Point {
    x: number
    y: number
  }

  function cells(frame: OutputLine[], glyph: string): Point[] {
    return gridRows(frame).flatMap((row, y) =>
      [...row.slice(1, -1)].flatMap((char, x) => (char === glyph ? [{ x, y }] : [])),
    )
  }

  const DIRS: Record<string, Point> = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
  }

  /** Chases the food until the snake is long enough. `advance` is what makes the
   *  game move on: a keypress in reduced motion, a tick otherwise. */
  async function chaseFood(
    { frame, press }: Pick<Harness, 'frame' | 'press'>,
    advance: () => Promise<unknown>,
  ): Promise<number> {
    // The head is whichever body cell was not there a step ago.
    let previous = new Set(cells(frame(), '█').map((p) => `${p.x},${p.y}`))
    let head = cells(frame(), '█').reduce((a, b) => (a.x > b.x ? a : b))
    let length = previous.size

    for (let i = 0; i < 500 && length < 10; i++) {
      const body = new Set(cells(frame(), '█').map((p) => `${p.x},${p.y}`))
      const food = cells(frame(), '◆')[0]!

      const [best] = Object.entries(DIRS)
        .map(([key, delta]) => ({ key, next: { x: head.x + delta.x, y: head.y + delta.y } }))
        .filter(
          ({ next }) =>
            next.x >= 0 &&
            next.x < WIDTH &&
            next.y >= 0 &&
            next.y < HEIGHT &&
            !body.has(`${next.x},${next.y}`),
        )
        .sort(
          (a, b) =>
            Math.abs(a.next.x - food.x) +
            Math.abs(a.next.y - food.y) -
            (Math.abs(b.next.x - food.x) + Math.abs(b.next.y - food.y)),
        )
      if (!best) break

      press(best.key)
      await advance()

      const now = cells(frame(), '█')
      const fresh = now.find((p) => !previous.has(`${p.x},${p.y}`))
      if (fresh) head = fresh
      previous = new Set(now.map((p) => `${p.x},${p.y}`))
      length = now.length
    }

    return length
  }

  it('unlocks `snake` at length 10, one step per keypress', async () => {
    const game = harness()
    const finished = command('snake').run(game.ctx) as Promise<OutputLine[]>

    const length = await chaseFood(game, () => new Promise((resolve) => setTimeout(resolve, 0)))

    game.press('q')
    const lines = await finished

    expect(length).toBeGreaterThanOrEqual(10)
    expect(isUnlocked('snake')).toBe(true)
    expect(lines.some((l) => l.text.includes('Nokia Nostalgia'))).toBe(true)
  })

  it('unlocks `snake` at length 10 on the 120 ms tick', async () => {
    // The loop a visitor without reduced motion actually plays: the handler only
    // queues a direction, and the tick is what steps the snake.
    motion.reduced = false
    vi.useFakeTimers()

    const game = harness()
    const finished = command('snake').run(game.ctx) as Promise<OutputLine[]>

    const length = await chaseFood(game, () => vi.advanceTimersByTimeAsync(120))

    game.press('q')
    await vi.advanceTimersByTimeAsync(120)
    const lines = await finished

    expect(length).toBeGreaterThanOrEqual(10)
    expect(isUnlocked('snake')).toBe(true)
    expect(lines.some((l) => l.text.includes('Nokia Nostalgia'))).toBe(true)
  })

  it('still reports the unlock when the game is aborted rather than quit', async () => {
    // Ctrl+C and Esc are the documented way out, and `execute()` throws away a
    // command's return value when it rejects — so the achievement line has to
    // reach the buffer some other way.
    const game = harness()
    const finished = command('snake').run(game.ctx) as Promise<OutputLine[]>

    await chaseFood(game, () => new Promise((resolve) => setTimeout(resolve, 0)))
    game.abort()

    await expect(finished).rejects.toThrow()
    expect(isUnlocked('snake')).toBe(true)
    expect(game.printed().some((l) => l.text.includes('Nokia Nostalgia'))).toBe(true)
  })

  it('does not unlock on a short game', async () => {
    const { ctx, press } = harness()
    const finished = command('snake').run(ctx) as Promise<OutputLine[]>

    press('ArrowRight')
    await new Promise((resolve) => setTimeout(resolve, 0))
    press('q')
    await finished

    expect(isUnlocked('snake')).toBe(false)
  })
})

/*
 * The five games added in vol. 2. Same idea as the two above: the pure modules
 * prove the rules, and these prove the wiring between state, renderer, capture
 * and achievement — the part no unit test reaches.
 *
 * `keyStream` buffers, so a whole sequence can be pressed synchronously and then
 * drained by awaiting one macrotask: every `keys.next()` resolves from that
 * buffer through an already-settled promise, and microtasks run to completion
 * before a timer fires.
 */
const drain = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A deterministic `Math.random`, rebuildable from the same seed so two passes
 *  can consume an identical sequence of draws. */
function generator(seed: number): () => number {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0
    return value / 0x100000000
  }
}

describe('minesweeper', () => {
  const SEED = 0x31337

  /** Arrow presses that walk the cursor from one cell to another. */
  function walk(from: { x: number; y: number }, to: { x: number; y: number }): string[] {
    return [
      ...Array.from({ length: Math.abs(to.x - from.x) }, () =>
        to.x > from.x ? 'ArrowRight' : 'ArrowLeft',
      ),
      ...Array.from({ length: Math.abs(to.y - from.y) }, () =>
        to.y > from.y ? 'ArrowDown' : 'ArrowUp',
      ),
    ]
  }

  it('unlocks `minesweeper` when every safe cell is revealed', async () => {
    // Two passes over the same seed: the first works out where the mines will
    // land, the second drives the command into an identical layout. The cursor
    // starts at the centre, which is therefore also the first reveal.
    const start = minesweeper.newGame().cursor
    const layout = minesweeper.reveal(minesweeper.newGame(), start.x, start.y, generator(SEED))
    vi.spyOn(Math, 'random').mockImplementation(generator(SEED))

    const game = harness()
    const finished = command('minesweeper').run(game.ctx) as Promise<OutputLine[]>

    let at = start
    game.press(' ')

    for (let y = 0; y < minesweeper.HEIGHT; y++) {
      for (let x = 0; x < minesweeper.WIDTH; x++) {
        if (layout.cells[y * minesweeper.WIDTH + x]!.mine) continue
        for (const key of walk(at, { x, y })) game.press(key)
        game.press(' ')
        at = { x, y }
      }
    }

    await drain()
    const lines = await finished

    expect(isUnlocked('minesweeper')).toBe(true)
    expect(lines.some((l) => l.text.includes('Clean Sweep'))).toBe(true)
  })

  it('does not unlock when a mine is hit', async () => {
    const start = minesweeper.newGame().cursor
    const layout = minesweeper.reveal(minesweeper.newGame(), start.x, start.y, generator(SEED))
    vi.spyOn(Math, 'random').mockImplementation(generator(SEED))

    const game = harness()
    const finished = command('minesweeper').run(game.ctx) as Promise<OutputLine[]>

    const mine = layout.cells.findIndex((cell) => cell.mine)
    const target = { x: mine % minesweeper.WIDTH, y: Math.floor(mine / minesweeper.WIDTH) }

    game.press(' ')
    for (const key of walk(start, target)) game.press(key)
    game.press(' ')

    await drain()
    await finished

    expect(isUnlocked('minesweeper')).toBe(false)
  })

  it('will not reveal a flagged cell, so a flag cannot lose the game', async () => {
    const start = minesweeper.newGame().cursor
    const layout = minesweeper.reveal(minesweeper.newGame(), start.x, start.y, generator(SEED))
    vi.spyOn(Math, 'random').mockImplementation(generator(SEED))

    const game = harness()
    const finished = command('minesweeper').run(game.ctx) as Promise<OutputLine[]>

    const mine = layout.cells.findIndex((cell) => cell.mine)
    const target = { x: mine % minesweeper.WIDTH, y: Math.floor(mine / minesweeper.WIDTH) }

    game.press(' ')
    for (const key of walk(start, target)) game.press(key)
    game.press('f')
    game.press(' ')
    await drain()

    // Still alive: the board is on screen and the status line is the hint, not
    // the loss message.
    expect(game.frame().some((l) => l.text.includes('boom'))).toBe(false)

    game.press('q')
    await drain()
    await finished
  })
})

describe('wordle', () => {
  /** `() => 0` picks the first answer, so the test knows what to type. */
  const ANSWER = answersFor('en')[0]!

  it('unlocks `wordle` on a solve', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0)

    const game = harness()
    const finished = command('wordle').run(game.ctx) as Promise<OutputLine[]>

    for (const letter of ANSWER) game.press(letter.toLowerCase())
    game.press('Enter')
    await drain()

    expect(isUnlocked('wordle')).toBe(true)

    // There is no `q` to quit on — every letter is a guess — so Esc is the exit,
    // and the achievement line has to survive that path.
    game.abort()
    await expect(finished).rejects.toThrow()
    expect(game.printed().some((l) => l.text.includes('Word Play'))).toBe(true)
  })

  it('does not unlock on a loss', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0)

    const game = harness()
    const finished = command('wordle').run(game.ctx) as Promise<OutputLine[]>

    const wrong = answersFor('en').find((word) => word !== ANSWER)!
    for (let row = 0; row < 6; row++) {
      for (const letter of wrong) game.press(letter.toLowerCase())
      game.press('Enter')
    }
    await drain()

    expect(isUnlocked('wordle')).toBe(false)
    // The answer is printed once the round is lost.
    expect(game.frame().some((l) => l.text === ANSWER)).toBe(true)

    game.abort()
    await expect(finished).rejects.toThrow()
  })

  it('refuses a word that is not in the list without spending a row', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0)

    const game = harness()
    const finished = command('wordle').run(game.ctx) as Promise<OutputLine[]>

    for (const letter of 'zzzzz') game.press(letter)
    game.press('Enter')
    await drain()

    expect(game.frame().some((l) => l.text.includes('not in the word list'))).toBe(true)

    // The row survived the refusal, so the same letters can be corrected.
    for (let i = 0; i < 5; i++) game.press('Backspace')
    for (const letter of ANSWER) game.press(letter.toLowerCase())
    game.press('Enter')
    await drain()

    expect(isUnlocked('wordle')).toBe(true)

    game.abort()
    await expect(finished).rejects.toThrow()
  })
})

describe('hangman', () => {
  const ANSWER = answersFor('en')[0]!

  it('unlocks `hangman` on a win', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0)

    const game = harness()
    const finished = command('hangman').run(game.ctx) as Promise<OutputLine[]>

    for (const letter of new Set(ANSWER)) game.press(letter.toLowerCase())
    await drain()

    expect(isUnlocked('hangman')).toBe(true)

    game.abort()
    await expect(finished).rejects.toThrow()
    expect(game.printed().some((l) => l.text.includes('Last Word'))).toBe(true)
  })

  it('does not unlock when the drawing finishes first', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0)

    const game = harness()
    const finished = command('hangman').run(game.ctx) as Promise<OutputLine[]>

    // Six letters that are certainly not in the answer.
    const wrong = 'abcdefghijklmnopqrstuvwxyz'
      .toUpperCase()
      .split('')
      .filter((letter) => !ANSWER.includes(letter))
      .slice(0, 6)

    for (const letter of wrong) game.press(letter.toLowerCase())
    await drain()

    expect(isUnlocked('hangman')).toBe(false)

    game.abort()
    await expect(finished).rejects.toThrow()
  })
})

describe('wpm', () => {
  it('unlocks `wpm` on a fast, accurate run', async () => {
    // 20 ms a character is about 600 wpm, comfortably past the threshold, and
    // every character is correct so accuracy is 100.
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 20))

    const game = harness()
    const finished = command('wpm').run(game.ctx) as Promise<OutputLine[]>

    // The prompt is whatever the renderer put on screen: the target line is the
    // only one built from segments and indented by two spaces.
    const target = game.frame().find((l) => l.text.startsWith('  ') && l.segments)!.text.slice(2)
    for (const char of target) game.press(char)
    await drain()

    expect(isUnlocked('wpm')).toBe(true)

    game.abort()
    await expect(finished).rejects.toThrow()
    expect(game.printed().some((l) => l.text.includes('Touch Typist'))).toBe(true)
  })

  it('does not unlock a sloppy run, however fast', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 20))

    const game = harness()
    const finished = command('wpm').run(game.ctx) as Promise<OutputLine[]>

    const target = game.frame().find((l) => l.text.startsWith('  ') && l.segments)!.text.slice(2)
    // Every character wrong: fast, and worth nothing.
    for (let i = 0; i < target.length; i++) game.press('~')
    await drain()

    expect(isUnlocked('wpm')).toBe(false)

    game.abort()
    await expect(finished).rejects.toThrow()
  })
})

describe('tetris', () => {
  /**
   * Five O pieces side by side fill two rows of a ten-wide well, so five bands
   * of five pieces clear ten lines. `always('O')` keeps the piece predictable;
   * the offsets walk the spawn column to each pair of columns in turn.
   */
  const OFFSETS = [-4, -2, 0, 2, 4]

  function clearTenLines(press: (key: string) => void) {
    for (let band = 0; band < 5; band++) {
      for (const offset of OFFSETS) {
        for (let i = 0; i < Math.abs(offset); i++) {
          press(offset < 0 ? 'ArrowLeft' : 'ArrowRight')
        }
        press(' ')
      }
    }
  }

  /** Always the O piece: `PIECE_IDS.indexOf('O')` is 1 of 7. */
  const onlyO = () => 1 / 7

  it('unlocks `tetris` at ten lines, one gravity step per keypress', async () => {
    vi.spyOn(Math, 'random').mockImplementation(onlyO)

    const game = harness()
    const finished = command('tetris').run(game.ctx) as Promise<OutputLine[]>

    clearTenLines(game.press)
    await drain()

    expect(isUnlocked('tetris')).toBe(true)

    game.press('q')
    await drain()
    const lines = await finished
    expect(lines.some((l) => l.text.includes('Line Clear'))).toBe(true)
  })

  it('unlocks `tetris` on the 500 ms tick too', async () => {
    // The loop a visitor without reduced motion plays: the handler only records
    // the keys, and the tick is what applies them.
    motion.reduced = false
    vi.spyOn(Math, 'random').mockImplementation(onlyO)
    vi.useFakeTimers()

    const game = harness()
    const finished = command('tetris').run(game.ctx) as Promise<OutputLine[]>

    for (let band = 0; band < 5; band++) {
      for (const offset of OFFSETS) {
        for (let i = 0; i < Math.abs(offset); i++) {
          game.press(offset < 0 ? 'ArrowLeft' : 'ArrowRight')
        }
        game.press(' ')
        // One tick applies everything pressed during it, in order.
        await vi.advanceTimersByTimeAsync(500)
      }
    }

    expect(isUnlocked('tetris')).toBe(true)

    game.press('q')
    await vi.advanceTimersByTimeAsync(500)
    await finished
  })

  it('does not unlock on a short game', async () => {
    vi.spyOn(Math, 'random').mockImplementation(onlyO)

    const game = harness()
    const finished = command('tetris').run(game.ctx) as Promise<OutputLine[]>

    game.press(' ')
    await drain()
    game.press('q')
    await drain()
    await finished

    expect(isUnlocked('tetris')).toBe(false)
  })
})

describe('the games listing', () => {
  it('counts the games rather than hardcoding a number', () => {
    const listed = command('games').run(harness().ctx) as OutputLine[]
    // Every game command except the listing itself.
    const playable = gameCommands.length - 1
    expect(listed[0]!.text).toContain(String(playable))
  })

  it('names every playable game', () => {
    const listed = command('games').run(harness().ctx) as OutputLine[]
    const text = listed.map((l) => l.text).join('\n')

    for (const game of gameCommands.filter((c) => c.name !== 'games')) {
      expect(text).toContain(game.name)
    }
  })

  it('shows minesweeper’s best in seconds, since a lower one is better', () => {
    window.localStorage.setItem('couvbat:games:minesweeper', '42')
    const listed = command('games').run(harness().ctx) as OutputLine[]
    expect(listed.some((l) => l.text.includes('best: 42s'))).toBe(true)
  })
})
