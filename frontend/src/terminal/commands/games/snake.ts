import { prefersReducedMotion } from '@/composables/useCrt'
import type { Localised } from '@/content/types'
import { line, segmented } from '../../format'
import { keyStream, toDirection } from '../../games/input'
import * as snake from '../../games/snake'
import { sleep } from '../../timing'
import type { Command, CommandContext, OutputLine, Tone } from '../../types'
import { GAME_OVER, bestScore, border, play, runs, scoreLine } from './shared'

const TICK_MS = 120
/** Length that unlocks the achievement. */
const TARGET = 10

const HINT: Localised<string> = {
  en: 'arrows/wasd move · q quits',
  fr: 'flèches/wasd pour bouger · q pour quitter',
}
const HINT_STEP: Localised<string> = {
  en: 'reduced motion: one step per keypress · q quits',
  fr: 'mouvement réduit : un pas par touche · q pour quitter',
}

function render(state: snake.SnakeState, best: number, status: string): OutputLine[] {
  const out: OutputLine[] = [
    scoreLine('snake', state.score, best),
    border('┌', '┐', snake.WIDTH),
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
      segmented([{ text: '│', tone: 'muted' }, ...runs(cells), { text: '│', tone: 'muted' }]),
    )
  }

  out.push(border('└', '┘', snake.WIDTH), line(status, 'muted'))
  return out
}

export const command: Command = {
  name: 'snake',
  description: { en: 'Play snake', fr: 'Jouer à snake' },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, 'snake', async (session) => {
      const stepped = prefersReducedMotion()

      let state = snake.newGame()
      let best = bestScore('snake')

      const draw = ctx.frame()
      const hint = ctx.t(stepped ? HINT_STEP : HINT)
      const paint = (status: string) => draw(render(state, best, status))

      const advance = () => {
        state = snake.step(state)
        session.score = state.score
        best = Math.max(best, state.score)
        if (state.snake.length >= TARGET) session.announce('snake')
      }

      paint(hint)

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
            paint(hint)
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
            paint(hint)
          }
        } finally {
          release()
        }
      }

      paint(state.dead ? ctx.t(GAME_OVER) : '')
    }),
}
