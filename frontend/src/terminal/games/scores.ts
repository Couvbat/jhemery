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
  | 'connect4'

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
  // Most wins in one sitting against the same opponent: there is no score in the game.
  connect4: { key: 'couvbat:games:connect4', better: 'higher' },
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

// ---------------------------------------------------------------------------
// The daily wordle
// ---------------------------------------------------------------------------

/**
 * Today's daily, per locale, kept beside the scores. Saved after every guess, not only
 * at the end: a daily that forgot an abandoned attempt would be six new rows for the
 * price of a closed tab.
 */
export interface DailyResult {
  day: string
  /** Folded guesses, in order. */
  guesses: string[]
  /** One `h`/`n`/`m` string per guess — enough to share without the word list. */
  marks: string[]
  done: boolean
  won: boolean
  /** Sent to `POST /stats/wordle` — once, so a reload does not count the same board twice. */
  reported?: boolean
}

const DAILY_KEY = 'couvbat:games:wordle:daily'

function readDaily(): Record<string, DailyResult> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DAILY_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, DailyResult>)
      : {}
  } catch {
    return {}
  }
}

function isDaily(value: unknown): value is DailyResult {
  const v = value as DailyResult | null
  return (
    !!v &&
    typeof v.day === 'string' &&
    Array.isArray(v.guesses) &&
    Array.isArray(v.marks) &&
    typeof v.done === 'boolean' &&
    typeof v.won === 'boolean'
  )
}

/** The saved daily for `locale`, or null if there is none for `day`. */
export function dailyResult(locale: string, day: string): DailyResult | null {
  const saved = readDaily()[locale]
  return isDaily(saved) && saved.day === day ? saved : null
}

export function recordDaily(locale: string, result: DailyResult): void {
  try {
    window.localStorage.setItem(DAILY_KEY, JSON.stringify({ ...readDaily(), [locale]: result }))
  } catch {
    // Private browsing or a full quota — the daily just won't remember itself.
  }
}
