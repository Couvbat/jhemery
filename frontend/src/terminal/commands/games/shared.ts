/**
 * Rendering and lifecycle bits every game in this directory uses.
 *
 * The games were one file until there were seven of them. Splitting them left
 * three things that genuinely belong to all of them: the score header, the
 * run-coalescing helper every grid renderer needs, and `play()` — the try/
 * catch/finally dance around achievements and score recording, which was
 * duplicated in both original games and would have been duplicated seven times.
 */

import type { Localised } from '@/content/types'
import { announce as announceAchievement } from '../../achievements'
import { segmented } from '../../format'
import { type GameId, bestScore, isLowerBetter, recordScore } from '../../games/scores'
import type { CommandContext, OutputLine, OutputSegment, Tone } from '../../types'

export const GAME_OVER: Localised<string> = { en: 'game over', fr: 'partie terminée' }

/** Renders a best score, with a unit when the game counts something other than
 *  points — `best: 48s` cannot be misread as a high score the way `best: 48` can. */
export function formatBest(game: GameId, value: number): string {
  if (value === 0) return '—'
  return isLowerBetter(game) ? `${value}s` : String(value)
}

export function scoreLine(game: GameId, score: number, best: number, label = 'score'): OutputLine {
  return segmented([
    { text: `${label} `, tone: 'muted' },
    { text: String(score).padEnd(8), tone: 'primary' },
    { text: 'best ', tone: 'muted' },
    { text: formatBest(game, best), tone: 'accent' },
  ])
}

/** Coalesces neighbouring cells of the same tone so a row is a handful of runs
 *  rather than one span per character. */
export function runs(cells: { char: string; tone: Tone }[]): OutputSegment[] {
  const out: OutputSegment[] = []
  for (const cell of cells) {
    const last = out[out.length - 1]
    if (last && last.tone === cell.tone) last.text += cell.char
    else out.push({ text: cell.char, tone: cell.tone })
  }
  return out
}

/** A boxed grid's top/middle/bottom rule, `width` characters wide. */
export function border(left: string, right: string, width: number): OutputLine {
  return segmented([{ text: `${left}${'─'.repeat(width)}${right}`, tone: 'muted' }])
}

/**
 * What a game reports back while it runs. `score` is a mutable field rather than
 * a return value on purpose: `play()` reads it in `finally`, so a game abandoned
 * with Ctrl+C still records what the player earned before quitting.
 */
export interface Session {
  /** Unlocks an achievement and queues its line for the buffer. Safe to call every
   *  frame — `announce` itself is idempotent. */
  announce: (id: string) => void
  score: number
}

/**
 * Wraps a game's loop with the three things all of them need: achievement lines
 * that survive an abort, a recorded score that survives an abort, and a return
 * value for the normal path.
 *
 * The abort case is the subtle one. `Ctrl+C` and `Esc` reject out of the loop,
 * and `execute()` drops a command's return value when it throws — so an
 * achievement earned in the last second before quitting would leave no trace in
 * the buffer unless it is printed here instead.
 */
export async function play(
  ctx: CommandContext,
  game: GameId,
  loop: (session: Session) => Promise<void>,
): Promise<OutputLine[]> {
  const unlocks: OutputLine[] = []
  const session: Session = {
    announce: (id) => unlocks.push(...announceAchievement(id, ctx.t)),
    score: 0,
  }

  try {
    await loop(session)
  } catch (error) {
    if (unlocks.length) ctx.print(unlocks)
    throw error
  } finally {
    recordScore(game, session.score)
  }

  return unlocks
}

export { bestScore, recordScore }
