/** Local high scores. Private browsing means they don't persist, which is not an
 *  error worth surfacing — same posture as the achievement store. */

export type GameId =
  | '2048'
  | 'snake'
  | 'minesweeper'
  | 'tetris'
  | 'wordle'
  | 'hangman'
  | 'wpm'

/**
 * `better` exists for exactly one game: minesweeper is scored on how long the
 * clear took, so a smaller number is the record. Inverting it at the source
 * (storing `1000 - seconds` to keep one direction) would make the stored value
 * meaningless and turn every read into a second piece of arithmetic — cheaper to
 * teach this module that a direction exists.
 */
const GAMES: Record<GameId, { key: string; better: 'higher' | 'lower' }> = {
  '2048': { key: 'couvbat:games:2048', better: 'higher' },
  snake: { key: 'couvbat:games:snake', better: 'higher' },
  minesweeper: { key: 'couvbat:games:minesweeper', better: 'lower' },
  tetris: { key: 'couvbat:games:tetris', better: 'higher' },
  wordle: { key: 'couvbat:games:wordle', better: 'higher' },
  hangman: { key: 'couvbat:games:hangman', better: 'higher' },
  wpm: { key: 'couvbat:games:wpm', better: 'higher' },
}

export function isLowerBetter(game: GameId): boolean {
  return GAMES[game].better === 'lower'
}

/** `0` means "never played", in both directions — a cleared board always takes at
 *  least a second, so there is no real score a zero could be confused with. */
export function bestScore(game: GameId): number {
  if (typeof window === 'undefined') return 0
  try {
    const stored = Number(window.localStorage.getItem(GAMES[game].key))
    return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0
  } catch {
    return 0
  }
}

/**
 * Stores `score` if it beats the stored best, in whichever direction this game
 * counts. Returns the best either way.
 *
 * A non-positive score is never stored: for a lower-is-better game a 0 would be
 * an unbeatable record, and for the others it is the same as not having played.
 */
export function recordScore(game: GameId, score: number): number {
  const current = bestScore(game)
  if (score <= 0) return current

  const best =
    current === 0
      ? score
      : GAMES[game].better === 'lower'
        ? Math.min(current, score)
        : Math.max(current, score)

  try {
    window.localStorage.setItem(GAMES[game].key, String(best))
  } catch {
    // Private browsing or a full quota — the score just won't outlive the tab.
  }
  return best
}
