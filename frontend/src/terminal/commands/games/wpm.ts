import type { Localised } from '@/content/types'
import { blank, line, segmented, wrapRanges } from '../../format'
import { keyStream } from '../../games/input'
import * as typing from '../../games/typing'
import { loadTypingWords } from '../../games/words'
import type { Command, CommandContext, OutputLine, OutputSegment, Tone } from '../../types'
import { bestScore, play } from './shared'

/** Words per minute and accuracy that together unlock the achievement. Speed alone
 *  does not pay: typing gibberish fast is not typing. */
const WPM_TARGET = 60
const ACCURACY_TARGET = 95

const LOADING: Localised<string> = { en: 'loading words…', fr: 'chargement des mots…' }
const HINT: Localised<string> = {
  en: 'just start typing · backspace corrects · esc quits',
  fr: 'commencez à taper · retour corrige · esc pour quitter',
}
const AGAIN: Localised<string> = {
  en: 'r for another line · esc quits',
  fr: 'r pour une autre ligne · esc pour quitter',
}

/**
 * Content width of a wrapped prompt line.
 *
 * `segmented()` is always `pre`, because every other thing it draws is a game
 * board that must not reflow. The typing prompt is the exception: an unwrapped
 * line pushed a horizontal scrollbar onto the whole panel. So the wrapping
 * happens here, at a width that matches `wrap()`'s house column minus the
 * two-space indent.
 */
const WRAP_WIDTH = 74

function targetLines(state: typing.TypingState): OutputLine[] {
  return wrapRanges(state.target, WRAP_WIDTH).map(({ start, end }) => {
    const parts: OutputSegment[] = [{ text: '  ', tone: 'muted' }]

    for (let i = start; i < end; i++) {
      const expected = state.target[i]!
      const typed = state.typed[i]

      let tone: Tone = 'muted'
      if (typed !== undefined) tone = typed === expected ? 'success' : 'error'
      else if (i === state.typed.length) tone = 'accent'

      // Always the *expected* character, never the typed one: a line that mutates
      // into your typos is unreadable exactly when you need to read it. Wrong
      // characters are shown by colour, and a wrong space by an underscore, since
      // a red space is invisible.
      parts.push({
        text: typed !== undefined && typed !== expected && expected === ' ' ? '_' : expected,
        tone,
      })
    }

    return segmented(parts)
  })
}

function render(state: typing.TypingState, now: number, best: number, status: string): OutputLine[] {
  const speed = typing.wpm(state, now)
  const percent = typing.accuracy(state)

  return [
    segmented([
      { text: 'wpm ', tone: 'muted' },
      { text: String(speed).padEnd(6), tone: 'primary' },
      { text: 'acc ', tone: 'muted' },
      { text: `${percent}%`.padEnd(6), tone: percent >= ACCURACY_TARGET ? 'success' : 'warning' },
      { text: 'best ', tone: 'muted' },
      { text: best === 0 ? '—' : String(best), tone: 'accent' },
    ]),
    blank,
    ...targetLines(state),
    blank,
    line(status, 'muted'),
  ]
}

export const command: Command = {
  name: 'wpm',
  aliases: ['typing'],
  description: { en: 'Typing test', fr: 'Test de frappe' },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, 'wpm', async (session) => {
      const keys = keyStream(ctx.capture)
      const draw = ctx.frame()

      // Lazily-fetched chunk — see `words.ts`.
      draw([line(ctx.t(LOADING), 'muted')])
      const words = await loadTypingWords(ctx.locale)

      let state = typing.newGame(words)
      let best = bestScore('wpm')

      const paint = (status: string) => draw(render(state, Date.now(), best, status))
      paint(ctx.t(HINT))

      try {
        // Esc and Ctrl+C are the only way out — every printable key is part of the
        // test. See `play()` for why the achievement still reaches the buffer.
        for (;;) {
          const key = await keys.next(ctx.signal)

          if (typing.isDone(state)) {
            if (key !== 'r') continue
            state = typing.newGame(words)
            paint(ctx.t(HINT))
            continue
          }

          const next = key === 'Backspace' ? typing.backspace(state) : typing.type(state, key, Date.now())
          if (next === state) continue
          state = next

          if (typing.isDone(state)) {
            const speed = typing.wpm(state, Date.now())
            const percent = typing.accuracy(state)

            // Only a completed line scores, and only an accurate one counts
            // towards the record — a 200 wpm run at 40% accuracy is not a result.
            if (percent >= ACCURACY_TARGET) {
              session.score = speed
              best = Math.max(best, speed)
              if (speed >= WPM_TARGET) session.announce('wpm')
            }

            paint(ctx.t(AGAIN))
            continue
          }

          paint(ctx.t(HINT))
        }
      } finally {
        keys.release()
      }
    }),
}
