import type { Localised } from '@/content/types'
import { line, segmented } from '../../format'
import { keyStream, toDirection } from '../../games/input'
import * as mines from '../../games/minesweeper'
import type { Command, CommandContext, OutputLine, OutputSegment, Tone } from '../../types'
import { bestScore, border, play, scoreLine } from './shared'

const HINT: Localised<string> = {
  en: 'arrows/wasd move · space reveals · f flags · q quits',
  fr: 'flèches/wasd pour bouger · espace pour révéler · f pour marquer · q pour quitter',
}
const WON: Localised<string> = { en: 'cleared', fr: 'terrain déminé' }
const LOST: Localised<string> = { en: 'boom', fr: 'boum' }

/** The classic 1–8 ladder, walked up the tones the terminal already has, so a 7
 *  reads as louder than a 1 without inventing a palette. */
const NEAR_TONES: Tone[] = [
  'muted',
  'primary',
  'success',
  'accent',
  'warning',
  'warning',
  'error',
  'error',
  'error',
]

function glyphFor(cell: mines.Cell, dead: boolean): OutputSegment {
  if (cell.flagged) return { text: '⚑', tone: 'warning' }
  if (!cell.revealed) return { text: '·', tone: 'muted' }
  if (cell.mine) return { text: '✱', tone: 'error' }
  if (cell.near === 0) return { text: ' ', tone: dead ? 'muted' : 'default' }
  return { text: String(cell.near), tone: NEAR_TONES[cell.near]! }
}

/**
 * Two characters per cell — the glyph and one space — so the board is roughly
 * square rather than squashed to half height by the ~1:2 character cell. The
 * cursor spends that second character on a bracket, which is why it can be shown
 * without a colour the colour-blind cannot see.
 */
function render(state: mines.MinesweeperState, elapsed: number, best: number, status: string): OutputLine[] {
  const out: OutputLine[] = [
    scoreLine('minesweeper', elapsed, best, 'time '),
    line(
      `  ⚑ ${mines.minesRemaining(state)}`,
      mines.minesRemaining(state) < 0 ? 'warning' : 'muted',
    ),
    border('┌', '┐', mines.WIDTH * 2 + 1),
  ]

  const live = !state.dead && !state.won

  for (let y = 0; y < mines.HEIGHT; y++) {
    const parts: OutputSegment[] = [{ text: '│', tone: 'muted' }]
    const onRow = live && state.cursor.y === y

    // Each cell is `<marker><glyph>`, plus one trailing marker to close the last
    // one — so a cell's closing bracket is the next cell's marker slot, and the
    // row is always WIDTH * 2 + 1 characters wide however the cursor moves.
    for (let x = 0; x < mines.WIDTH; x++) {
      const marker = onRow && state.cursor.x === x ? '[' : onRow && state.cursor.x === x - 1 ? ']' : ' '
      parts.push({ text: marker, tone: 'accent' })
      parts.push(glyphFor(state.cells[y * mines.WIDTH + x]!, state.dead))
    }

    parts.push({ text: onRow && state.cursor.x === mines.WIDTH - 1 ? ']' : ' ', tone: 'accent' })
    parts.push({ text: '│', tone: 'muted' })
    out.push(segmented(parts))
  }

  out.push(border('└', '┘', mines.WIDTH * 2 + 1), line(status, 'muted'))
  return out
}

export const command: Command = {
  name: 'minesweeper',
  aliases: ['mines'],
  description: { en: 'Play minesweeper', fr: 'Jouer au démineur' },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, 'minesweeper', async (session) => {
      const keys = keyStream(ctx.capture)

      let state = mines.newGame()
      const best = bestScore('minesweeper')

      // Wall-clock, started by the first reveal rather than by the command, so
      // reading the board before committing costs nothing.
      let startedAt: number | null = null
      const elapsed = () => (startedAt === null ? 0 : Math.round((Date.now() - startedAt) / 1000))

      const draw = ctx.frame()
      const hint = ctx.t(HINT)
      const paint = (status: string) => draw(render(state, elapsed(), best, status))
      paint(hint)

      try {
        while (!state.dead && !state.won) {
          const key = await keys.next(ctx.signal)
          if (key === 'q') break

          const dir = toDirection(key)
          if (dir) {
            state = mines.moveCursor(state, dir)
          } else if (key === ' ' || key === 'Enter') {
            if (startedAt === null) startedAt = Date.now()
            state = mines.reveal(state, state.cursor.x, state.cursor.y)
          } else if (key === 'f') {
            state = mines.toggleFlag(state, state.cursor.x, state.cursor.y)
          } else {
            continue
          }

          if (state.won) {
            // Only a win has a time worth keeping — losing in four seconds is not
            // a record, and `recordScore` counts lower as better for this game.
            session.score = Math.max(1, elapsed())
            session.announce('minesweeper')
          }

          paint(hint)
        }
      } finally {
        keys.release()
      }

      paint(state.won ? ctx.t(WON) : state.dead ? ctx.t(LOST) : '')
    }),
}
