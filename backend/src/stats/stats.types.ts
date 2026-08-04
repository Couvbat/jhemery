/**
 * The whole dataset: one running total.
 *
 * Not per command, not per visitor, not per day. `useTerminal.ts` calls this
 * once when the overlay is first opened in a session, so what it counts is
 * "times someone opened the shell" — never *which* command they ran, matching
 * the `ask` route's "questions and answers are never logged".
 */
export interface StatsReport {
  /** Terminal sessions opened, ever. */
  sessions: number;
}
