import { prefersReducedMotion } from '@/composables/useCrt'
import type { Localised } from '@/content/types'
import { line, segmented } from '../../format'
import { keyStream, toDirection } from '../../games/input'
import * as tetris from '../../games/tetris'
import { sleep } from '../../timing'
import type { Command, CommandContext, OutputLine, Tone } from '../../types'
import { GAME_OVER, bestScore, border, play, runs, scoreLine } from './shared'

const TICK_MS = 500
/** Lines cleared in one game that unlock the achievement. */
const LINE_TARGET = 10

const HINT: Localised<string> = {
  en: 'a/d move · w rotates · s drops one · space hard-drops · q quits',
  fr: 'a/d pour bouger · w pour tourner · s descend · espace lâche · q pour quitter',
}
const HINT_STEP: Localised<string> = {
  en: 'reduced motion: every key drops one row · space hard-drops · q quits',
  fr: 'mouvement réduit : chaque touche descend d’une ligne · espace lâche · q pour quitter',
}

/** One tone per piece, so a settled well reads as blocks rather than a wall. */
const PIECE_TONES: Record<tetris.PieceId, Tone> = {
  I: 'accent',
  O: 'warning',
  T: 'primary',
  S: 'success',
  Z: 'error',
  J: 'secondary',
  L: 'default',
}

/**
 * Two characters per cell.
 *
 * This is the answer to the "reads worse in a monospace grid" objection that kept
 * tetris out of the first games spec: a character cell is roughly 1:2, so a well
 * drawn one character per cell is squashed to half its height and the pieces stop
 * looking like themselves. At two characters wide it is square.
 */
const BLOCK = '██'
const EMPTY = ' ·'

function render(state: tetris.TetrisState, best: number, status: string): OutputLine[] {
  // The falling piece is painted over a copy rather than into the well, so it can
  // move without the well needing to be un-drawn.
  const view = [...state.well]
  if (!state.dead) {
    for (const [x, y] of tetris.cellsOf(state.piece)) {
      if (y >= 0 && y < tetris.HEIGHT && x >= 0 && x < tetris.WIDTH) {
        view[y * tetris.WIDTH + x] = state.piece.id
      }
    }
  }

  const out: OutputLine[] = [
    scoreLine('tetris', state.score, best),
    segmented([
      { text: 'lines ', tone: 'muted' },
      { text: String(state.lines).padEnd(8), tone: 'primary' },
      { text: 'next ', tone: 'muted' },
      { text: state.next, tone: PIECE_TONES[state.next] },
    ]),
    border('┌', '┐', tetris.WIDTH * 2),
  ]

  for (let y = 0; y < tetris.HEIGHT; y++) {
    const cells = Array.from({ length: tetris.WIDTH }, (_, x) => {
      const piece = view[y * tetris.WIDTH + x]
      return piece
        ? { char: BLOCK, tone: PIECE_TONES[piece] }
        : { char: EMPTY, tone: 'muted' as Tone }
    })
    out.push(
      segmented([{ text: '│', tone: 'muted' }, ...runs(cells), { text: '│', tone: 'muted' }]),
    )
  }

  out.push(border('└', '┘', tetris.WIDTH * 2), line(status, 'muted'))
  return out
}

/** Everything a keypress can do except gravity, shared by both loops. */
function applyKey(state: tetris.TetrisState, key: string): tetris.TetrisState {
  if (key === ' ') return tetris.hardDrop(state)

  const dir = toDirection(key)
  if (dir === 'left') return tetris.shift(state, -1)
  if (dir === 'right') return tetris.shift(state, 1)
  if (dir === 'up') return tetris.rotate(state)
  if (dir === 'down') return tetris.tick(state)
  return state
}

export const command: Command = {
  name: 'tetris',
  description: { en: 'Play tetris', fr: 'Jouer à tetris' },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, 'tetris', async (session) => {
      const stepped = prefersReducedMotion()

      let state = tetris.newGame()
      let best = bestScore('tetris')

      const draw = ctx.frame()
      const hint = ctx.t(stepped ? HINT_STEP : HINT)
      const paint = (status: string) => draw(render(state, best, status))

      const settle = () => {
        session.score = state.score
        best = Math.max(best, state.score)
        if (state.lines >= LINE_TARGET) session.announce('tetris')
      }

      paint(hint)

      if (stepped) {
        /*
         * Reduced motion gets a different game rather than a refusal, which is
         * the rule everywhere else in this codebase. Snake's fallback (one step
         * per keypress) does not transfer, though: in snake the step is a move
         * you chose, whereas here gravity is the opponent. So every keypress
         * both does what you asked *and* advances gravity one row — the piece
         * falls exactly as fast as you play, and stalling is not a strategy.
         */
        const keys = keyStream(ctx.capture)
        try {
          while (!state.dead) {
            const key = await keys.next(ctx.signal)
            if (key === 'q') break

            // A hard drop has already landed the piece and a soft drop *is* the
            // gravity step, so neither gets a second one on top.
            if (key === ' ') state = tetris.hardDrop(state)
            else if (toDirection(key) === 'down') state = tetris.tick(state)
            else state = tetris.tick(applyKey(state, key))

            settle()
            paint(hint)
          }
        } finally {
          keys.release()
        }
      } else {
        // Same shape as snake's tick loop: the handler only records what was
        // pressed, and the tick is what moves the game on. Awaiting a key inside
        // the loop would drop every press that landed between two ticks.
        const pressed: { keys: string[]; quit: boolean } = { keys: [], quit: false }
        const release = ctx.capture((key) => {
          if (key === 'q') pressed.quit = true
          else pressed.keys.push(key)
        })

        try {
          while (!state.dead && !pressed.quit) {
            await sleep(TICK_MS, ctx.signal)

            // Everything pressed during the tick, in order — dropping the extras
            // would make a quick rotate-then-shift feel like it missed.
            for (const key of pressed.keys.splice(0)) state = applyKey(state, key)
            if (!state.dead) state = tetris.tick(state)

            settle()
            paint(hint)
          }
        } finally {
          release()
        }
      }

      paint(state.dead ? ctx.t(GAME_OVER) : '')
    }),
}
