import type { Locale, Localised } from './types'

/**
 * `/corpus.json`: the site's own words, whole, for `ask` to retrieve from
 * (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md` §2). `vite-plugins/corpus.ts`
 * emits it; the backend reads it from `${FRONTEND_URL}` and mirrors this shape in
 * `backend/src/ask/corpus.types.ts`. It is the second file the backend reads from the
 * frontend, so it follows `content.json`'s rule: a change of shape is a new `version`,
 * accepted beside the old one, since the two apps deploy in no fixed order.
 */

export const CORPUS_VERSION = 1

export type PassageKind = 'work' | 'why' | 'note' | 'now' | 'hardware' | 'music' | 'gaming' | 'tools' | 'lab'

export interface Passage {
  id: string
  kind: PassageKind
  /** Localised where the source is; plain where it is a single-language note. */
  title: Localised | string
  text: Localised | string
  /**
   * What a search result already carries: a route (`/work/qr`), a note anchor, or a
   * command line a `?run=` link runs (`why polling`).
   */
  target: string
  /** A single-language note's language. */
  lang?: Locale
}

export interface Corpus {
  version: typeof CORPUS_VERSION
  generatedAt: string
  passages: Passage[]
}
