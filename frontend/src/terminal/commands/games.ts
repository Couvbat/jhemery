import { prefersReducedMotion } from '@/composables/useCrt'
import type { Localised } from '@/content/types'
import { announce } from '../achievements'
import { blank, line, segmented } from '../format'
import * as game2048 from '../games/2048'
import { keyStream, toDirection } from '../games/input'
import { bestScore, recordScore } from '../games/scores'
import * as snake from '../games/snake'
import { sleep } from '../timing'
import type { Command, CommandContext, OutputLine, OutputSegment, Tone } from '../types'

const TICK_MS = 120
/** Length that unlocks `snake`, and tile that unlocks `game2048`. */
const SNAKE_TARGET = 10
const TILE_TARGET = 256

const HINT: Localised<string> = {
  en: 'arrows/wasd move · q quits',
  fr: 'flèches/wasd pour bouger · q pour quitter',
}
const HINT_2048: Localised<string> = {
  en: 'arrows/wasd move · r restarts · q quits',
  fr: 'flèches/wasd pour bouger · r pour recommencer · q pour quitter',
}
const HINT_STEP: Localised<string> = {
  en: 'reduced motion: one step per keypress · q quits',
  fr: 'mouvement réduit : un pas par touche · q pour quitter',
}
const GAME_OVER: Localised<string> = { en: 'game over', fr: 'partie terminée' }

/* ------------------------------------------------------------------ rendering */

const CELL_WIDTH = 6

/** Tile colour by rank, on the eight tones the terminal already has. */
function tileTone(value: number): Tone {
  if (value >= 2048) return 'success'
  if (value >= 512) return 'warning'
  if (value >= 128) return 'accent'
  if (value >= 32) return 'primary'
  if (value >= 8) return 'default'
  return 'muted'
}

function cellLabel(value: number): string {
  const label = value === 0 ? '' : String(value)
  const left = Math.floor((CELL_WIDTH - label.length) / 2)
  return `${' '.repeat(left)}${label}${' '.repeat(CELL_WIDTH - label.length - left)}`
}

function rule(left: string, join: string, right: string): OutputLine {
  const cells = Array.from({ length: game2048.SIZE }, () => '─'.repeat(CELL_WIDTH))
  return segmented([{ text: `${left}${cells.join(join)}${right}`, tone: 'muted' }])
}

function scoreLine(score: number, best: number): OutputLine {
  return segmented([
    { text: 'score ', tone: 'muted' },
    { text: String(score).padEnd(8), tone: 'primary' },
    { text: 'best ', tone: 'muted' },
    { text: String(best), tone: 'accent' },
  ])
}

function render2048(board: game2048.Board, score: number, best: number, status: string): OutputLine[] {
  const out: OutputLine[] = [scoreLine(score, best), rule('┌', '┬', '┐')]

  for (let row = 0; row < game2048.SIZE; row++) {
    const parts: OutputSegment[] = [{ text: '│', tone: 'muted' }]
    for (let col = 0; col < game2048.SIZE; col++) {
      const value = board[row * game2048.SIZE + col]!
      parts.push({ text: cellLabel(value), tone: tileTone(value) })
      parts.push({ text: '│', tone: 'muted' })
    }
    out.push(segmented(parts))
    if (row < game2048.SIZE - 1) out.push(rule('├', '┼', '┤'))
  }

  out.push(rule('└', '┴', '┘'), line(status, 'muted'))
  return out
}

/** Coalesces neighbouring cells of the same tone so a row is a handful of runs
 *  rather than 24 one-character spans. */
function runs(cells: { char: string; tone: Tone }[]): OutputSegment[] {
  const out: OutputSegment[] = []
  for (const cell of cells) {
    const last = out[out.length - 1]
    if (last && last.tone === cell.tone) last.text += cell.char
    else out.push({ text: cell.char, tone: cell.tone })
  }
  return out
}

function renderSnake(state: snake.SnakeState, best: number, status: string): OutputLine[] {
  const border = '─'.repeat(snake.WIDTH)
  const out: OutputLine[] = [
    scoreLine(state.score, best),
    segmented([{ text: `┌${border}┐`, tone: 'muted' }]),
  ]

  for (let y = 0; y < snake.HEIGHT; y++) {
    const cells = Array.from({ length: snake.WIDTH }, (_, x) => {
      if (state.snake.some((part) => part.x === x && part.y === y)) {
        return { char: '█', tone: 'primary' as Tone }
      }
      if (state.food.x === x && state.food.y === y) return { char: '◆', tone: 'accent' as Tone }
      return { char: '·', tone: 'muted' as Tone }
    })
    out.push(
      segmented([
        { text: '│', tone: 'muted' },
        ...runs(cells),
        { text: '│', tone: 'muted' },
      ]),
    )
  }

  out.push(segmented([{ text: `└${border}┘`, tone: 'muted' }]), line(status, 'muted'))
  return out
}

/* --------------------------------------------------------------------- games */

async function play2048(ctx: CommandContext): Promise<OutputLine[]> {
  // Taken before the first `await`, so the input line never blinks disabled.
  const keys = keyStream(ctx.capture)
  const unlocks: OutputLine[] = []

  let board = game2048.newGame()
  let score = 0
  let best = bestScore('2048')

  const draw = ctx.frame()
  const render = (status: string) => draw(render2048(board, score, best, status))
  const hint = ctx.t(HINT_2048)
  render(hint)

  try {
    for (;;) {
      const key = await keys.next(ctx.signal)

      if (key === 'q') {
        // Drop the controls hint: the board stays as a record, the hint would
        // only be stale advice.
        render('')
        break
      }
      if (key === 'r') {
        board = game2048.newGame()
        score = 0
        render(hint)
        continue
      }

      const dir = toDirection(key)
      if (!dir) continue

      const result = game2048.move(board, dir)
      // A move that changes nothing does not spawn a tile.
      if (!result.moved) continue

      board = game2048.spawn(result.board)
      score += result.gained
      best = Math.max(best, score)

      if (game2048.maxTile(board) >= TILE_TARGET) unlocks.push(...announce('game2048', ctx.t))

      if (game2048.isDead(board)) {
        // The board stays in the buffer as a record of how it ended.
        render(ctx.t(GAME_OVER))
        break
      }
      render(hint)
    }
  } finally {
    keys.release()
    recordScore('2048', score)
  }

  return unlocks
}

async function playSnake(ctx: CommandContext): Promise<OutputLine[]> {
  const unlocks: OutputLine[] = []
  const stepped = prefersReducedMotion()

  let state = snake.newGame()
  let best = bestScore('snake')

  const draw = ctx.frame()
  const render = (status: string) => draw(renderSnake(state, best, status))
  const hint = ctx.t(stepped ? HINT_STEP : HINT)

  const advance = () => {
    state = snake.step(state)
    best = Math.max(best, state.score)
    if (state.snake.length >= SNAKE_TARGET) unlocks.push(...announce('snake', ctx.t))
  }

  render(hint)

  try {
    if (stepped) {
      // Reduced motion: drop the tick and step once per keypress. Turn-based
      // snake is still a real game, and it beats refusing to run.
      const keys = keyStream(ctx.capture)
      try {
        while (!state.dead) {
          const key = await keys.next(ctx.signal)
          if (key === 'q') break
          const dir = toDirection(key)
          if (dir) state = snake.turn(state, dir)
          advance()
          render(hint)
        }
      } finally {
        keys.release()
      }
    } else {
      // Push-based on purpose: the handler writes, the tick reads. Awaiting a key
      // inside the loop would drop every press that landed between two ticks.
      const pressed: { dir: snake.Dir | null; quit: boolean } = { dir: null, quit: false }
      const release = ctx.capture((key) => {
        if (key === 'q') pressed.quit = true
        else pressed.dir = toDirection(key) ?? pressed.dir
      })

      try {
        while (!state.dead && !pressed.quit) {
          await sleep(TICK_MS, ctx.signal)
          if (pressed.dir) {
            state = snake.turn(state, pressed.dir)
            pressed.dir = null
          }
          advance()
          render(hint)
        }
      } finally {
        release()
      }
    }

    render(state.dead ? ctx.t(GAME_OVER) : '')
  } finally {
    recordScore('snake', state.score)
  }

  return unlocks
}

export const gameCommands: Command[] = [
  {
    name: 'games',
    aliases: ['arcade'],
    description: { en: 'List the playable games', fr: 'Lister les jeux jouables' },
    group: 'fun',
    // The one game entry in the palette: launching a game from Ctrl+K would drop
    // a visitor into a keyboard-captured surface they did not ask for.
    palette: true,
    run({ t }) {
      const rows: { name: string; blurb: Localised<string>; best: number }[] = [
        {
          name: '2048',
          blurb: { en: 'slide tiles, merge them, keep going', fr: 'glissez, fusionnez, continuez' },
          best: bestScore('2048'),
        },
        {
          name: 'snake',
          blurb: { en: 'eat, grow, mind the walls', fr: 'mangez, grandissez, attention aux murs' },
          best: bestScore('snake'),
        },
      ]

      return [
        line(t({ en: '🕹  two games, in this buffer', fr: '🕹  deux jeux, dans ce buffer' }), 'accent'),
        blank,
        ...rows.map((row) => ({
          text: `  ${row.name.padEnd(6)}  ${t(row.blurb).padEnd(38)}  best: ${row.best}`,
          tone: 'default' as Tone,
          pre: true,
        })),
        blank,
        line(t(HINT_2048), 'muted'),
        line(
          t({
            en: 'looking for what I actually play? run `gaming`.',
            fr: 'vous cherchez ce que je joue vraiment ? tapez `gaming`.',
          }),
          'muted',
        ),
      ]
    },
  },
  {
    name: '2048',
    description: { en: 'Play 2048', fr: 'Jouer à 2048' },
    group: 'fun',
    run: play2048,
  },
  {
    name: 'snake',
    description: { en: 'Play snake', fr: 'Jouer à snake' },
    group: 'fun',
    run: playSnake,
  },
]
