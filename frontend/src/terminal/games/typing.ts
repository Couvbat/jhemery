/**
 * A typing test, as plain functions over plain objects — no Vue, no OutputLine,
 * and notably **no timer of its own**: the clock is `Date.now()`, read on each
 * keystroke and passed in, so there is nothing to start, stop or tear down when
 * the command aborts. The renderer lives in `commands/games/wpm.ts`.
 */

import type { Random } from './2048'

export interface TypingState {
  /** The line being typed. */
  target: string
  /** What has been typed so far, correct or not. */
  typed: string
  /** Set by the first keystroke, not by launching the command — thinking time
   *  before you commit is not part of the run. */
  startedAt: number | null
  /** Finished at, once the last character lands. */
  endedAt: number | null
  /**
   * Positions typed wrong at least once, ever.
   *
   * "Ever" is the point: `Backspace` fixes the text but not the record. A test
   * where you can backspace your way to 100% measures nothing, and every typing
   * test worth the name works this way.
   */
  mistakes: Set<number>
}

/** Words per generated line. Twelve lands around 70 characters in both locales —
 *  long enough for the speed to mean something, short enough to finish. */
export const WORDS_PER_LINE = 12

/**
 * Builds a line from randomly drawn common words.
 *
 * Random words rather than prose: a sentence lets you predict what comes next
 * and coast, which measures reading as much as typing. Drawing with replacement
 * is deliberate too — a repeated word inside one line is normal English and
 * normal French, and de-duplicating would bias the draw towards rare words.
 */
export function newGame(
  words: string[],
  random: Random = Math.random,
  count: number = WORDS_PER_LINE,
): TypingState {
  const line = Array.from({ length: count }, () => words[Math.floor(random() * words.length)]!)

  return {
    target: line.join(' '),
    typed: '',
    startedAt: null,
    endedAt: null,
    mistakes: new Set(),
  }
}

export function isDone(state: TypingState): boolean {
  return state.typed.length >= state.target.length
}

/** Accepts one character. Anything that is not a single printable character is
 *  ignored, so the caller can hand over raw keys (`Shift`, `ArrowLeft`, …). */
export function type(state: TypingState, key: string, now: number): TypingState {
  if (isDone(state) || key.length !== 1) return state

  const position = state.typed.length
  const mistakes = key === state.target[position] ? state.mistakes : new Set(state.mistakes).add(position)
  const typed = state.typed + key
  const done = typed.length >= state.target.length

  return {
    ...state,
    typed,
    mistakes,
    startedAt: state.startedAt ?? now,
    endedAt: done ? now : null,
  }
}

/** Un-types one character. The mistake it may have recorded stays recorded — see
 *  `mistakes`. */
export function backspace(state: TypingState): TypingState {
  if (isDone(state) || !state.typed) return state
  return { ...state, typed: state.typed.slice(0, -1) }
}

/** The standard definition: a "word" is five characters, including spaces. Using
 *  actual words would make a line of short words score higher than a line of long
 *  ones for identical effort. */
export function wpm(state: TypingState, now: number): number {
  if (state.startedAt === null) return 0
  const minutes = ((state.endedAt ?? now) - state.startedAt) / 60000
  if (minutes <= 0) return 0
  return Math.round(state.typed.length / 5 / minutes)
}

/** Share of positions reached without ever being typed wrong, as a percentage.
 *  100 before anything is typed, which is the only honest starting value. */
export function accuracy(state: TypingState): number {
  if (!state.typed.length) return 100
  const reached = Math.max(state.typed.length, state.mistakes.size)
  return Math.round(((reached - state.mistakes.size) / reached) * 100)
}
