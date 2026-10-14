import { searchKinds, type SearchEntry, type SearchIndex, type SearchKind, type SearchText } from '@/content/search'
import type { Locale } from '@/content/types'
import { fold } from '@/terminal/games/words'
import { linkTarget, type LinkTarget } from '@/terminal/links'

/**
 * What the Ctrl+K palette matches with, for its own entries and for `/search.json`
 * (roadmap §I, *Content search in Ctrl+K*). In the eager chunk with the palette, so it
 * stays small: no dependency, and at a couple of hundred entries a linear scan of
 * pre-split words is instant.
 *
 * A query is split into words, and every one of them has to start a word somewhere in
 * an entry, so `vim key` finds the vim note's *Key mapping* and `ey` finds nothing.
 * Folded as the word games fold, so `decision` finds *Décisions* and `ecran` *écran*.
 * Where a word lands decides the rank: in a title, in a note's heading, then in the text.
 */

/** Shorter than this, a query matches the palette's own entries only, and the index isn't fetched. */
export const MIN_QUERY = 3

/** Per kind, so the 130-odd note headings can't push a case study off the list. */
export const PER_KIND = 6

export const SEARCH_URL = '/search.json'

const WEIGHT = { title: 4, heading: 2, text: 1 } as const

/** A query word that is a whole word of the entry counts this much more than one that only starts it. */
const WHOLE = 1.5

type Field = keyof typeof WEIGHT

/** An entry's words per field, split once so a keystroke only splits the query. */
export type Words = Record<Field, string[]>

export interface Searchable<T> {
  item: T
  words: Words
}

/** Folded, then split on anything that isn't a letter or a digit: `l’écran` is `L`, `ECRAN`. */
export function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

export function searchable<T>(item: T, fields: Partial<Record<Field, string>>): Searchable<T> {
  return {
    item,
    words: { title: words(fields.title ?? ''), heading: words(fields.heading ?? ''), text: words(fields.text ?? '') },
  }
}

/** 0 when a query word starts no word of the entry; otherwise the sum of each word's best field. */
export function score(query: string[], entry: Words): number {
  let total = 0
  for (const wanted of query) {
    let best = 0
    for (const field of Object.keys(WEIGHT) as Field[]) {
      for (const word of entry[field]) {
        if (word === wanted) best = Math.max(best, WEIGHT[field] * WHOLE)
        else if (word.startsWith(wanted)) best = Math.max(best, WEIGHT[field])
      }
    }
    if (!best) return 0
    total += best
  }
  return total
}

/** The items that match, best first, ties in their own order. A query with no words matches everything. */
export function rank<T>(pool: readonly Searchable<T>[], query: string): T[] {
  const wanted = words(query)
  if (!wanted.length) return pool.map((entry) => entry.item)
  return pool
    .map((entry, order) => ({ item: entry.item, order, score: score(wanted, entry.words) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((match) => match.item)
}

/** Whether a query is long enough to search the index with, and so to fetch it. */
export function wantsIndex(query: string): boolean {
  return query.trim().length >= MIN_QUERY
}

export interface SearchResult {
  entry: SearchEntry
  /** A note section's heading; anything else's title. */
  label: string
  /** The note a section belongs to; anything else's opening text. */
  hint: string
  /** A note's own language, which the palette marks when it isn't the page's. */
  lang?: Locale
}

export interface SearchGroup {
  kind: SearchKind
  results: SearchResult[]
}

function resolve(text: SearchText, locale: Locale): string {
  return typeof text === 'string' ? text : text[locale]
}

/**
 * The index as a pool for one locale. A section is ranked by its heading, and its note's
 * title only counts as text there: otherwise `vim` would rank every heading of a vim
 * note as high as the note itself. Kept for the last index and locale asked for, since
 * the palette asks again on every keystroke.
 */
let pooled: { index: SearchIndex; locale: Locale; pool: Searchable<SearchResult>[] } | null = null

function poolOf(index: SearchIndex, locale: Locale): Searchable<SearchResult>[] {
  if (pooled?.index === index && pooled.locale === locale) return pooled.pool
  const pool = index.entries.map((entry) => {
    const title = resolve(entry.title, locale)
    const text = resolve(entry.text, locale)
    const result: SearchResult = {
      entry,
      label: entry.heading ?? title,
      hint: entry.heading ? title : text,
      ...(entry.lang ? { lang: entry.lang } : {}),
    }
    return entry.heading
      ? searchable(result, { heading: entry.heading, text: `${text} ${title}` })
      : searchable(result, { title, text })
  })
  pooled = { index, locale, pool }
  return pool
}

/** The index's matches for `query`, grouped by kind in `searchKinds` order, at most `PER_KIND` each. */
export function searchIndex(index: SearchIndex, query: string, locale: Locale): SearchGroup[] {
  if (!wantsIndex(query)) return []
  const found = rank(poolOf(index, locale), query)
  return searchKinds
    .map((kind) => ({ kind, results: found.filter((result) => result.entry.kind === kind).slice(0, PER_KIND) }))
    .filter((group) => group.results.length)
}

/**
 * Where choosing a result goes. A `why` result runs `why <topic>` in the terminal, which
 * a phone doesn't have (§9), so there it opens the decision's design instead.
 */
export function resultTarget(entry: SearchEntry, desktop: boolean): LinkTarget {
  const target = linkTarget(entry.target)
  return target.kind === 'run' && !desktop && entry.fallback ? linkTarget(entry.fallback) : target
}

/** An index this page can't read, a newer shape or not an index at all, searches as empty. */
export function readIndex(data: unknown): SearchIndex {
  const index = data as Partial<SearchIndex> | null
  if (index?.version !== 1 || !Array.isArray(index.entries)) return { version: 1, entries: [] }
  return index as SearchIndex
}

let loading: Promise<SearchIndex> | null = null

/**
 * The index, fetched once per page. A failure isn't kept, so asking again tries again;
 * the palette only asks again once it has been reopened, so a visitor offline isn't
 * sent a request per keystroke.
 */
export function loadSearchIndex(fetcher: typeof fetch = fetch): Promise<SearchIndex> {
  if (loading) return loading
  const request = fetcher(SEARCH_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`${SEARCH_URL}: ${response.status}`)
      return response.json() as Promise<unknown>
    })
    .then(readIndex)
  loading = request
  request.catch(() => {
    if (loading === request) loading = null
  })
  return request
}
