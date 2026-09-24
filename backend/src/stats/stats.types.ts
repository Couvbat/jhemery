/**
 * The whole dataset: one running total, and a few days of wordle tallies.
 *
 * Not per command, not per visitor. `useTerminal.ts` calls `/stats/session` once when
 * the overlay is first opened in a session, so what it counts is "times someone
 * opened the shell" — never *which* command they ran, matching the `ask` route's
 * "questions and answers are never logged".
 */
export interface StatsReport {
  /** Terminal sessions opened, ever. */
  sessions: number;
}

export type WordleLocale = 'en' | 'fr';

/**
 * How the day's daily wordle went for everyone who reported it, in one language:
 * `counts[0]` solved in one guess … `counts[5]` in six, `counts[6]` not solved.
 * Seven integers per day, and nothing that says who any of them were.
 */
export interface WordleHistogram {
  day: string;
  locale: WordleLocale;
  counts: number[];
}

/** What `stats.json` holds. `wordle` is keyed `YYYY-MM-DD:locale`. */
export interface StatsFile {
  sessions: number;
  wordle?: Record<string, number[]>;
}
