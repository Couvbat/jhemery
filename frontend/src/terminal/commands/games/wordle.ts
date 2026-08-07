import type { Localised } from '@/content/types'
import { blank, line, segmented } from '../../format'
import { keyStream } from '../../games/input'
import * as wordle from '../../games/wordle'
import type { Command, CommandContext, OutputLine, OutputSegment, Tone } from '../../types'
import { bestScore, play } from './shared'

const HINT: Localised<string> = {
  en: 'type a word · enter submits · backspace deletes · esc quits',
  fr: 'tapez un mot · entrée valide · retour efface · esc pour quitter',
}
const AGAIN: Localised<string> = {
  en: 'r for another word · esc quits',
  fr: 'r pour un autre mot · esc pour quitter',
}
const SHORT: Localised<string> = { en: 'not enough letters', fr: 'pas assez de lettres' }
const UNKNOWN: Localised<string> = { en: 'not in the word list', fr: 'absent de la liste' }

const MARK_TONES: Record<wordle.Mark, Tone> = {
  hit: 'success',
  near: 'warning',
  miss: 'muted',
}

/** The keyboard row, in the layout a player's hands expect. `W` sits where it
 *  does on the locale's own keyboard: guessing on an AZERTY layout while reading
 *  a QWERTY row is a small, constant irritation. */
const ROWS: Record<'en' | 'fr', string[]> = {
  en: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  fr: ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'],
}

function guessRow(letters: string, marks: wordle.Mark[] | null): OutputLine {
  const parts: OutputSegment[] = [{ text: '  ', tone: 'muted' }]

  for (let i = 0; i < wordle.LENGTH; i++) {
    const letter = letters[i] ?? '·'
    parts.push({
      text: ` ${letter} `,
      tone: marks ? MARK_TONES[marks[i]!] : letters[i] ? 'default' : 'muted',
    })
  }

  return segmented(parts)
}

function keyboard(state: wordle.WordleState): OutputLine[] {
  const best = wordle.letterMarks(state)

  return ROWS[state.locale].map((row, i) =>
    segmented([
      { text: '  ' + ' '.repeat(i), tone: 'muted' },
      ...[...row].map((letter) => ({
        text: `${letter} `,
        // Untouched letters stay `default`, not `muted` — `muted` is what a
        // ruled-out letter looks like, and the two must not be the same colour.
        tone: best.has(letter) ? MARK_TONES[best.get(letter)!] : ('default' as Tone),
      })),
    ]),
  )
}

function render(state: wordle.WordleState, streak: number, best: number, status: string): OutputLine[] {
  const out: OutputLine[] = [
    segmented([
      { text: 'streak ', tone: 'muted' },
      { text: String(streak).padEnd(8), tone: 'primary' },
      { text: 'best ', tone: 'muted' },
      { text: String(best), tone: 'accent' },
    ]),
    blank,
  ]

  for (let row = 0; row < wordle.ROWS; row++) {
    const guess = state.guesses[row]
    if (guess) out.push(guessRow(guess, wordle.score(guess, state.answer)))
    else if (row === state.guesses.length && state.status === 'playing') {
      out.push(guessRow(state.current, null))
    } else out.push(guessRow('', null))
  }

  out.push(blank, ...keyboard(state), blank)

  // The word is only printed on a loss. Printing it on a win too would be
  // redundant — the top row already spells it out in green.
  if (state.status === 'lost') out.push(line(state.display, 'error'))
  out.push(line(status, 'muted'))

  return out
}

export const command: Command = {
  name: 'wordle',
  aliases: ['motus'],
  description: { en: 'Guess the five-letter word', fr: 'Devinez le mot de cinq lettres' },
  group: 'fun',
  run: (ctx: CommandContext) =>
    play(ctx, 'wordle', async (session) => {
      const keys = keyStream(ctx.capture)

      let state = wordle.newGame(ctx.locale)
      let streak = 0
      let best = bestScore('wordle')

      const draw = ctx.frame()
      const paint = (status: string) => draw(render(state, streak, best, status))
      paint(ctx.t(HINT))

      try {
        for (;;) {
          const key = await keys.next(ctx.signal)

          if (state.status !== 'playing') {
            // Between rounds only `r` does anything; Esc and Ctrl+C are the exit,
            // and there is no `q` because `q` is a letter the next round needs.
            if (key !== 'r') continue
            state = wordle.nextWord(state, ctx.locale)
            paint(ctx.t(HINT))
            continue
          }

          if (key === 'Enter') {
            const result = wordle.submit(state)
            if (result.refused) {
              // A refusal costs nothing: the row is not consumed and the typed
              // letters stay put, so this is a correction rather than a wasted
              // guess.
              paint(ctx.t(result.refused === 'short' ? SHORT : UNKNOWN))
              continue
            }

            state = result.state
            if (state.status === 'won') {
              streak += 1
              session.score = streak
              best = Math.max(best, streak)
              session.announce('wordle')
            } else if (state.status === 'lost') {
              streak = 0
            }

            paint(ctx.t(state.status === 'playing' ? HINT : AGAIN))
            continue
          }

          const next =
            key === 'Backspace' ? wordle.backspace(state) : wordle.typeLetter(state, key)
          // Ignore keys that changed nothing rather than repainting for them.
          if (next === state) continue

          state = next
          paint(ctx.t(HINT))
        }
      } finally {
        keys.release()
      }
    }),
}
