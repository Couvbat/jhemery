import type { Localised } from '@/content/types'
import { line, segmented } from '../../format'
import * as game2048 from '../../games/2048'
import { keyStream, toDirection } from '../../games/input'
import type { Command, CommandContext, OutputLine, OutputSegment, Tone } from '../../types'
import { GAME_OVER, bestScore, play, scoreLine } from './shared'

/** The tile that unlocks the achievement. */
const TILE_TARGET = 256

const HINT: Localised<string> = {
  en: 'arrows/wasd move · r restarts · q quits',
  fr: 'flèches/wasd pour bouger · r pour recommencer · q pour quitter',
}

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

function render(board: game2048.Board, score: number, best: number, status: string): OutputLine[] {
  const out: OutputLine[] = [scoreLine('2048', score, best), rule('┌', '┬', '┐')]

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

export const command: Command = {
  name: '2048',
  description: { en: 'Play 2048', fr: 'Jouer à 2048' },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, '2048', async (session) => {
      // Taken before the first `await`, so the input line never blinks disabled.
      const keys = keyStream(ctx.capture)

      let board = game2048.newGame()
      let best = bestScore('2048')

      const draw = ctx.frame()
      const hint = ctx.t(HINT)
      const paint = (status: string) => draw(render(board, session.score, best, status))
      paint(hint)

      try {
        for (;;) {
          const key = await keys.next(ctx.signal)

          if (key === 'q') {
            // Drop the controls hint: the board stays as a record, the hint would
            // only be stale advice.
            paint('')
            break
          }
          if (key === 'r') {
            board = game2048.newGame()
            session.score = 0
            paint(hint)
            continue
          }

          const dir = toDirection(key)
          if (!dir) continue

          const result = game2048.move(board, dir)
          // A move that changes nothing does not spawn a tile.
          if (!result.moved) continue

          board = game2048.spawn(result.board)
          session.score += result.gained
          best = Math.max(best, session.score)

          if (game2048.maxTile(board) >= TILE_TARGET) session.announce('game2048')

          if (game2048.isDead(board)) {
            // The board stays in the buffer as a record of how it ended.
            paint(ctx.t(GAME_OVER))
            break
          }
          paint(hint)
        }
      } finally {
        keys.release()
      }
    }),
}
