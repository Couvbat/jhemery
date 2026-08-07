/**
 * Hangman, as plain functions over plain objects — no Vue, no OutputLine, no
 * timers. The renderer (and the gallows art) lives in `commands/games/hangman.ts`.
 *
 * Shares `words.ts` with wordle, which is most of why this game is cheap: what is
 * left is a guessed-letter set and a life counter.
 */

import type { Locale } from '@/content/types'
import type { Random } from './2048'
import { answersFor, fold } from './words'

/** Wrong guesses allowed. Six is the number of body parts in the usual drawing,
 *  and the drawing is the reason anyone plays this rather than wordle. */
export const LIVES = 6

export type Status = 'playing' | 'won' | 'lost'

export interface HangmanState {
  /** Folded, for comparison. */
  answer: string
  /** Spelled properly, accents included — what the reveal prints. */
  display: string
  /** Every letter tried, in the order tried, folded. */
  guessed: string[]
  status: Status
}

export function newGame(locale: Locale, random: Random = Math.random): HangmanState {
  const answers = answersFor(locale)
  const display = answers[Math.floor(random() * answers.length)]!

  return { answer: fold(display), display, guessed: [], status: 'playing' }
}

export function wrongGuesses(state: HangmanState): string[] {
  return state.guessed.filter((letter) => !state.answer.includes(letter))
}

export function livesLeft(state: HangmanState): number {
  return LIVES - wrongGuesses(state).length
}

/** Every answer letter guessed. */
export function isSolved(state: HangmanState): boolean {
  return [...state.answer].every((letter) => state.guessed.includes(letter))
}

/**
 * Tries one letter.
 *
 * A letter already tried is a no-op — **it does not cost a life**. Punishing a
 * mis-key is not difficulty, and the guessed-letters row is right there on screen
 * saying which ones are spent. Anything that is not a single letter is ignored
 * too, so the caller can hand over raw keys.
 */
export function guess(state: HangmanState, key: string): HangmanState {
  if (state.status !== 'playing') return state

  const letter = fold(key)
  if (letter.length !== 1 || !/[A-Z]/.test(letter)) return state
  if (state.guessed.includes(letter)) return state

  const next: HangmanState = { ...state, guessed: [...state.guessed, letter] }

  if (isSolved(next)) return { ...next, status: 'won' }
  if (livesLeft(next) <= 0) return { ...next, status: 'lost' }
  return next
}

/** The answer as the player sees it: guessed letters shown, the rest blanked. On a
 *  loss everything is shown, since the round is over and the word is the payoff. */
export function reveal(state: HangmanState): string[] {
  return [...state.display].map((char, i) => {
    const folded = state.answer[i]!
    return state.status === 'lost' || state.guessed.includes(folded) ? char : '_'
  })
}
