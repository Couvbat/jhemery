/**
 * Wordle, as plain functions over plain objects — no Vue, no OutputLine, no
 * timers. The renderer lives in `commands/games/wordle.ts`.
 *
 * Turn-based, so there is no tick loop and `prefers-reduced-motion` is a
 * non-issue.
 */

import type { Locale } from '@/content/types'
import type { Random } from './2048'
import { type WordleWords, fold } from './words'

export { fold }
export type { WordleWords }

export const LENGTH = 5
export const ROWS = 6

export type Mark = 'hit' | 'near' | 'miss'

export type Status = 'playing' | 'won' | 'lost'

/** Why a submitted guess was refused. `null` means it was accepted. */
export type Refusal = 'short' | 'unknown'

export interface WordleState {
  /** Folded, for comparison. */
  answer: string
  /** Spelled properly, accents included — what the reveal prints on a loss. */
  display: string
  /** Folded, in order played. */
  guesses: string[]
  /** The row being typed, folded. */
  current: string
  status: Status
  accepted: Set<string>
  /** Kept on the state because it decides two things the renderer needs — which
   *  word list is in play, and which keyboard layout to draw the used letters on. */
  locale: Locale
}

/**
 * Marks a guess against an answer.
 *
 * The two passes are the whole difficulty, and skipping them is how naive
 * implementations end up marking both `E`s of `ERASE` as near-misses against
 * `SPEED`, which has only one to give. So: exact hits are spent first, and only
 * the letters left over can be claimed as near-misses, left to right.
 */
export function score(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from({ length: guess.length }, () => 'miss')

  const remaining = new Map<string, number>()
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'hit'
    else remaining.set(answer[i]!, (remaining.get(answer[i]!) ?? 0) + 1)
  }

  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'hit') continue
    const left = remaining.get(guess[i]!) ?? 0
    if (left > 0) {
      marks[i] = 'near'
      remaining.set(guess[i]!, left - 1)
    }
  }

  return marks
}

/** Takes its words rather than fetching them: the lists are lazily loaded (see
 *  `words.ts`), and this module stays pure and testable against a handful of
 *  fixture words instead of several thousand real ones. */
export function newGame(
  words: WordleWords,
  locale: Locale,
  random: Random = Math.random,
): WordleState {
  const display = words.answers[Math.floor(random() * words.answers.length)]!

  return {
    answer: fold(display),
    display,
    guesses: [],
    current: '',
    status: 'playing',
    accepted: words.accepted,
    locale,
  }
}

/** Ignores anything that is not a single letter, and anything past the row width —
 *  the caller does not have to filter keys before handing them over. */
export function typeLetter(state: WordleState, key: string): WordleState {
  if (state.status !== 'playing' || state.current.length >= LENGTH) return state
  const letter = fold(key)
  if (letter.length !== 1 || !/[A-Z]/.test(letter)) return state
  return { ...state, current: state.current + letter }
}

export function backspace(state: WordleState): WordleState {
  if (state.status !== 'playing' || !state.current) return state
  return { ...state, current: state.current.slice(0, -1) }
}

/**
 * Commits the current row, or refuses it.
 *
 * A refusal costs nothing — the row is not consumed and the typed letters stay
 * put, so a mistyped word is a correction rather than a wasted guess. Six rows is
 * already tight.
 */
export function submit(state: WordleState): { state: WordleState; refused: Refusal | null } {
  if (state.status !== 'playing') return { state, refused: null }
  if (state.current.length < LENGTH) return { state, refused: 'short' }
  if (!state.accepted.has(state.current)) return { state, refused: 'unknown' }

  const guesses = [...state.guesses, state.current]
  const won = state.current === state.answer

  return {
    state: {
      ...state,
      guesses,
      current: '',
      status: won ? 'won' : guesses.length >= ROWS ? 'lost' : 'playing',
    },
    refused: null,
  }
}

/**
 * The best mark each guessed letter has earned so far, for the used-letter row
 * under the grid. Best-so-far and not latest: learning a letter is a hit and then
 * playing it in the wrong place must not downgrade it back to `near`.
 */
export function letterMarks(state: WordleState): Map<string, Mark> {
  const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 }
  const best = new Map<string, Mark>()

  for (const guess of state.guesses) {
    const marks = score(guess, state.answer)
    for (let i = 0; i < guess.length; i++) {
      const letter = guess[i]!
      const mark = marks[i]!
      const known = best.get(letter)
      if (!known || rank[mark] > rank[known]) best.set(letter, mark)
    }
  }

  return best
}

/** Starts the next word, reusing the loaded lists. */
export function nextWord(
  state: WordleState,
  words: WordleWords,
  random: Random = Math.random,
): WordleState {
  return newGame(words, state.locale, random)
}

// ---------------------------------------------------------------------------
// The daily word
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` in UTC — the day a daily wordle belongs to, the same everywhere at once. */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

/**
 * Which answer a day gets: FNV-1a over the date string, modulo the list. Stable across
 * engines and sessions, which anything seeded from `Math.random` is not, so everyone
 * reading the same language gets the same word on the same day.
 */
export function dailyIndex(day: string, count: number): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < day.length; i++) {
    hash ^= day.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % count
}

export function newDailyGame(words: WordleWords, locale: Locale, day: string): WordleState {
  const display = words.answers[dailyIndex(day, words.answers.length)]!
  return { ...newGame(words, locale), answer: fold(display), display }
}

/** Replays guesses already made today onto a fresh daily board — how a daily
 *  survives a closed tab without handing out a second set of six rows. */
export function resumeDaily(state: WordleState, guesses: readonly string[]): WordleState {
  let next = state
  for (const guess of guesses) next = submit({ ...next, current: guess }).state
  return next
}

/** One letter per mark, which is how a finished grid is stored. */
export const MARK_CODES: Record<Mark, string> = { hit: 'h', near: 'n', miss: 'm' }

const SHARE_GLYPHS: Record<string, string> = { h: '🟩', n: '🟨', m: '⬛' }

/**
 * The text `wordle share` copies. Emoji go to the clipboard and nowhere else: in the
 * buffer they render double-width and shear the grid, the reason `weather-art.ts` has
 * none. The link at the end is a `?run=` link, so pasting it invites someone straight
 * into the same day's word.
 */
export function shareText(result: {
  day: string
  locale: Locale
  marks: readonly string[]
  won: boolean
}): string {
  const tally = result.won ? String(result.marks.length) : 'X'
  return [
    `jhemery.xyz wordle ${result.locale} ${result.day} ${tally}/${ROWS}`,
    ...result.marks.map((row) => [...row].map((code) => SHARE_GLYPHS[code] ?? '⬛').join('')),
    'https://jhemery.xyz/?run=wordle%20daily',
  ].join('\n')
}
