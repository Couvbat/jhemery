import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Localised } from '@/content/types'
import { isUnlocked, unlocked } from '../achievements'
import { gameCommands } from '../commands/games'
import { move } from '../games/2048'
import type { Board, Dir } from '../games/2048'
import { HEIGHT, WIDTH } from '../games/snake'
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
