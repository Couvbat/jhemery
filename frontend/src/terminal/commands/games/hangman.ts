import type { Localised } from '@/content/types'
import { blank, line, segmented } from '../../format'
import * as hangman from '../../games/hangman'
import { keyStream } from '../../games/input'
import type { Command, CommandContext, OutputLine, Tone } from '../../types'
import { bestScore, play } from './shared'

const HINT: Localised<string> = {
  en: 'guess a letter · esc quits',
  fr: 'devinez une lettre · esc pour quitter',
}
const AGAIN: Localised<string> = {
  en: 'r for another word · esc quits',
  fr: 'r pour un autre mot · esc pour quitter',
}

/**
 * One frame per wrong guess, cumulative — index 0 is an empty gallows and index 6
 * is a full one. Written out rather than composed from parts: seven small
 * pictures are easier to read and to fix than the code that would assemble them.
 */
const GALLOWS: string[][] = [
  ['  ┌────┐ ', '  │      ', '  │      ', '  │      ', '  │      ', '──┴──    '],
  ['  ┌────┐ ', '  │    ○ ', '  │      ', '  │      ', '  │      ', '──┴──    '],
  ['  ┌────┐ ', '  │    ○ ', '  │    │ ', '  │      ', '  │      ', '──┴──    '],
  ['  ┌────┐ ', '  │    ○ ', '  │   ╱│ ', '  │      ', '  │      ', '──┴──    '],
  ['  ┌────┐ ', '  │    ○ ', '  │   ╱│╲', '  │      ', '  │      ', '──┴──    '],
  ['  ┌────┐ ', '  │    ○ ', '  │   ╱│╲', '  │   ╱  ', '  │      ', '──┴──    '],
  ['  ┌────┐ ', '  │    ○ ', '  │   ╱│╲', '  │   ╱ ╲', '  │      ', '──┴──    '],
]

function render(state: hangman.HangmanState, streak: number, best: number, status: string): OutputLine[] {
  const wrong = hangman.wrongGuesses(state)
  const stage = GALLOWS[Math.min(wrong.length, GALLOWS.length - 1)]!

  const out: OutputLine[] = [
    segmented([
      { text: 'streak ', tone: 'muted' },
      { text: String(streak).padEnd(8), tone: 'primary' },
      { text: 'best ', tone: 'muted' },
      { text: String(best), tone: 'accent' },
    ]),
    blank,
    ...stage.map((row) => ({
      text: `  ${row}`,
      // The drawing goes red as it fills in: it is the life counter, and a player
      // should be able to read it without counting limbs.
      tone: (wrong.length >= hangman.LIVES - 1 ? 'error' : 'muted') as Tone,
      pre: true,
    })),
    blank,
    segmented([
      { text: '  ', tone: 'muted' },
      ...hangman.reveal(state).map((char) => ({
        text: `${char} `,
        tone: (char === '_' ? 'muted' : state.status === 'lost' ? 'error' : 'success') as Tone,
      })),
    ]),
    blank,
  ]

  if (wrong.length) {
    out.push(
      segmented([
        { text: '  missed  ', tone: 'muted' },
        { text: wrong.join(' '), tone: 'error' },
      ]),
    )
  }

  out.push(line(status, 'muted'))
  return out
}

export const command: Command = {
  name: 'hangman',
  aliases: ['pendu'],
  description: { en: 'Guess the word before the drawing finishes', fr: 'Devinez le mot avant la fin du dessin' },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, 'hangman', async (session) => {
      const keys = keyStream(ctx.capture)

      let state = hangman.newGame(ctx.locale)
      let streak = 0
      let best = bestScore('hangman')

      const draw = ctx.frame()
      const paint = (status: string) => draw(render(state, streak, best, status))
      paint(ctx.t(HINT))

      try {
        // Only Esc and Ctrl+C leave this loop, which is why they abort rather than
        // return: there is no spare key for `q` when every letter is a guess. The
        // achievement line survives that path because `play()` prints it from its
        // catch block.
        for (;;) {
          const key = await keys.next(ctx.signal)

          if (state.status !== 'playing') {
            if (key !== 'r') continue
            state = hangman.newGame(ctx.locale)
            paint(ctx.t(HINT))
            continue
          }

          const next = hangman.guess(state, key)
          // A repeated letter, or a key that is not a letter at all: nothing
          // happened, so nothing is repainted.
          if (next === state) continue
          state = next

          if (state.status === 'won') {
            streak += 1
            session.score = streak
            best = Math.max(best, streak)
            session.announce('hangman')
          } else if (state.status === 'lost') {
            streak = 0
          }

          paint(ctx.t(state.status === 'playing' ? HINT : AGAIN))
        }
      } finally {
        keys.release()
      }
    }),
}
