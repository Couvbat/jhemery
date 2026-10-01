import type { Decision } from './types'

/**
 * The choices the site made and what it turned down, for `why <topic>`. Each entry is a
 * pointer into the design docs (`source`), which stay the authority: `because` is one
 * sentence, and the spec has the rest. Seeded from the specs' rejected alternatives,
 * the roadmap's departures and features-spec.
 */
export const decisions: Decision[] = []

export function findDecision(id: string): Decision | undefined {
  return decisions.find((decision) => decision.id === id.toLowerCase())
}
