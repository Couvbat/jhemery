/** Local high scores. Private browsing means they don't persist, which is not an
 *  error worth surfacing — same posture as the achievement store. */

export type GameId = '2048' | 'snake'

const KEYS: Record<GameId, string> = {
  '2048': 'couvbat:games:2048',
  snake: 'couvbat:games:snake',
}

export function bestScore(game: GameId): number {
  if (typeof window === 'undefined') return 0
  try {
    const stored = Number(window.localStorage.getItem(KEYS[game]))
    return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0
  } catch {
    return 0
  }
}

/** Stores `score` if it beats the stored best. Returns the best either way. */
export function recordScore(game: GameId, score: number): number {
  const best = Math.max(bestScore(game), score)
  try {
    window.localStorage.setItem(KEYS[game], String(best))
  } catch {
    // Private browsing or a full quota — the score just won't outlive the tab.
  }
  return best
}
