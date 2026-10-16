import type { Locale, Localised } from './types'

/**
 * The shape of `/search.json`, the index the Ctrl+K palette searches beyond its own
 * commands (roadmap §I, *Content search in Ctrl+K*). Here rather than beside either end
 * because both ends read it: `vite-plugins/search.ts` writes it at build time, outside
 * the app's module graph, and `lib/search.ts` reads it in the browser. Only the content
 * layer is importable from both.
 */

/** What a result is, which is also how the palette groups them, in this order. */
export type SearchKind = 'work' | 'why' | 'note' | 'now' | 'lab'

export const searchKinds: SearchKind[] = ['work', 'why', 'note', 'now', 'lab']

/** Both languages where the source has them; one where it doesn't, with `lang` saying which. */
export type SearchText = string | Localised

export interface SearchEntry {
  kind: SearchKind
  /** A case study's name, a decision's topic, a note's title, `/now`, `/lab`. */
  title: SearchText
  /** Set on a note's sections: the heading the result is, inside the note `title` names. */
  heading?: string
  /** The opening of the body, cut to a couple of hundred characters. */
  text: SearchText
  /** A note's language. The notes aren't translated, so they're shown as written, and marked. */
  lang?: Locale
  /** A route (`/work/qr`), a document (`/notes/<slug>#<id>`) or a `/?run=` link. */
  target: string
}

export interface SearchIndex {
  /** Bumped when the shape changes, so a page built before it ignores an index built after. */
  version: 1
  entries: SearchEntry[]
}
