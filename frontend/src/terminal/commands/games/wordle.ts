import type { Localised } from '@/content/types'
import { copyText } from '@/tools/clipboard'
import { blank, line, segmented } from '../../format'
import { keyStream } from '../../games/input'
import { dailyResult, recordDaily, type DailyResult } from '../../games/scores'
import * as wordle from '../../games/wordle'
import { loadWordleWords } from '../../games/words'
import type { Command, CommandContext, OutputLine, OutputSegment, Tone } from '../../types'
import { bestScore, play } from './shared'

const LOADING: Localised<string> = { en: 'loading words…', fr: 'chargement des mots…' }
const HINT: Localised<string> = {
  en: 'type a word · enter submits · backspace deletes · esc quits',
  fr: 'tapez un mot · entrée valide · retour efface · esc pour quitter',
}
const AGAIN: Localised<string> = {
  en: 'r for another word · esc quits',
  fr: 'r pour un autre mot · esc pour quitter',
}
const DAILY_DONE: Localised<string> = {
  en: '`wordle share` copies your grid · a new word at midnight UTC',
  fr: '`wordle share` copie votre grille · un nouveau mot à minuit UTC',
}
const DAILY_AGAIN: Localised<string> = {
  en: 'already played today — `wordle share` copies the grid, `wordle` plays a random word',
  fr: 'déjà joué aujourd’hui — `wordle share` copie la grille, `wordle` joue un mot au hasard',
}
const SHARE_NONE: Localised<string> = {
  en: 'wordle: nothing to share yet — finish `wordle daily` first',
  fr: 'wordle : rien à partager — terminez d’abord `wordle daily`',
}
const SHARED: Localised<string> = {
  en: 'copied — the grid is emoji, so it only goes to the clipboard',
  fr: 'copié — la grille est en emoji, elle ne va que dans le presse-papiers',
}
const NO_CLIPBOARD: Localised<string> = {
  en: 'wordle: the clipboard is not available here',
  fr: 'wordle : le presse-papiers n’est pas disponible ici',
}
const USAGE: Localised<string> = {
  en: 'usage: wordle [daily|share]',
  fr: 'usage : wordle [daily|share]',
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

function freeHeader(streak: number, best: number): OutputLine {
  return segmented([
    { text: 'streak ', tone: 'muted' },
    { text: String(streak).padEnd(8), tone: 'primary' },
    { text: 'best ', tone: 'muted' },
    { text: String(best), tone: 'accent' },
  ])
}

function dailyHeader(day: string, locale: string): OutputLine {
  return segmented([
    { text: 'daily ', tone: 'muted' },
    { text: day, tone: 'primary' },
    { text: `  ${locale}`, tone: 'muted' },
  ])
}

function render(state: wordle.WordleState, header: OutputLine, status: string): OutputLine[] {
  const out: OutputLine[] = [header, blank]

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

/** What a daily board looks like in storage: its guesses and their marks, and whether it is over. */
function snapshot(state: wordle.WordleState, day: string): DailyResult {
  return {
    day,
    guesses: state.guesses,
    marks: state.guesses.map((guess) =>
      wordle
        .score(guess, state.answer)
        .map((mark) => wordle.MARK_CODES[mark])
        .join(''),
    ),
    done: state.status !== 'playing',
    won: state.status === 'won',
  }
}

/** Free play: a random word, a streak, `r` for another. */
function freePlay(ctx: CommandContext) {
  return play(ctx, 'wordle', async (session) => {
    const keys = keyStream(ctx.capture)
    const draw = ctx.frame()

    // The list is a lazily-fetched chunk (see `words.ts`), so say so rather
    // than leaving a blank frame. On a warm cache this is one paint nobody
    // sees; on a cold one it is the difference between "loading" and "broken".
    draw([line(ctx.t(LOADING), 'muted')])
    const words = await loadWordleWords(ctx.locale)

    let state = wordle.newGame(words, ctx.locale)
    let streak = 0
    let best = bestScore('wordle')

    const paint = (status: string) => draw(render(state, freeHeader(streak, best), status))
    paint(ctx.t(HINT))

    try {
      for (;;) {
        const key = await keys.next(ctx.signal)

        if (state.status !== 'playing') {
          // Between rounds only `r` does anything; Esc and Ctrl+C are the exit,
          // and there is no `q` because `q` is a letter the next round needs.
          if (key !== 'r') continue
          state = wordle.nextWord(state, words)
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
  })
}

/**
 * The day's word: the same for everyone reading the same language, one board a day.
 * The board is saved after every guess, so closing the tab resumes it rather than
 * starting six fresh rows, and a finished one is shown again instead of replayed. It
 * does not touch the free-play streak.
 */
function daily(ctx: CommandContext) {
  const day = wordle.utcDay(new Date())
  return play(ctx, 'wordle', async (session) => {
    const draw = ctx.frame()
    draw([line(ctx.t(LOADING), 'muted')])
    const words = await loadWordleWords(ctx.locale)

    const saved = dailyResult(ctx.locale, day)
    let state = wordle.resumeDaily(wordle.newDailyGame(words, ctx.locale, day), saved?.guesses ?? [])
    const header = dailyHeader(day, ctx.locale)
    const paint = (status: string) => draw(render(state, header, status))

    if (state.status !== 'playing') {
      paint(ctx.t(DAILY_AGAIN))
      return
    }

    const keys = keyStream(ctx.capture)
    paint(ctx.t(HINT))
    try {
      while (state.status === 'playing') {
        const key = await keys.next(ctx.signal)

        if (key === 'Enter') {
          const result = wordle.submit(state)
          if (result.refused) {
            paint(ctx.t(result.refused === 'short' ? SHORT : UNKNOWN))
            continue
          }
          state = result.state
          recordDaily(ctx.locale, snapshot(state, day))
          if (state.status === 'won') session.announce('wordle')
          paint(ctx.t(state.status === 'playing' ? HINT : DAILY_DONE))
          continue
        }

        const next = key === 'Backspace' ? wordle.backspace(state) : wordle.typeLetter(state, key)
        if (next === state) continue
        state = next
        paint(ctx.t(HINT))
      }
    } finally {
      keys.release()
    }
  })
}

async function share(ctx: CommandContext): Promise<OutputLine[]> {
  const saved = dailyResult(ctx.locale, wordle.utcDay(new Date()))
  if (!saved?.done) return [line(ctx.t(SHARE_NONE), 'muted')]

  const copied = await copyText(wordle.shareText({ ...saved, locale: ctx.locale }))
  return [line(ctx.t(copied ? SHARED : NO_CLIPBOARD), copied ? 'success' : 'error')]
}

export const command: Command = {
  name: 'wordle',
  aliases: ['motus'],
  usage: 'wordle [daily|share]',
  description: { en: 'Guess the five-letter word', fr: 'Devinez le mot de cinq lettres' },
  group: 'fun',
  linkable: true,
  complete: ({ index }) => (index === 0 ? ['daily', 'share'] : []),
  run: (ctx: CommandContext) => {
    const mode = ctx.args[0]?.toLowerCase()
    if (!mode) return freePlay(ctx)
    if (mode === 'daily') return daily(ctx)
    if (mode === 'share') return share(ctx)
    return [line(ctx.t(USAGE), 'error')]
  },
}
