import { describe, expect, it, vi } from 'vitest'
import { decisions } from '@/content/decisions'
import { searchKinds, type SearchEntry, type SearchIndex } from '@/content/search'
import { isLinkable, resolveLink } from '@/terminal/registry'
import { tapRuns } from '@/terminal/tap'
import {
  MIN_QUERY,
  PER_KIND,
  rank,
  readIndex,
  SEARCH_URL,
  searchable,
  searchIndex,
  wantsIndex,
  words,
} from '../search'

/** The palette's own entries are ranked as `{ title: label, text: hint }`, as here. */
const palette = [
  { label: 'cd about', hint: 'About' },
  { label: 'cd projects', hint: 'Projects' },
  { label: 'wordle', hint: 'Guess the word in six tries' },
  { label: 'why', hint: 'What the site chose, and what it turned down' },
  { label: 'theme', hint: 'Écran, couleurs et thèmes' },
].map((entry) => searchable(entry.label, { title: entry.label, text: entry.hint }))

const find = (query: string) => rank(palette, query)

function entry(partial: Partial<SearchEntry> & Pick<SearchEntry, 'kind' | 'target'>): SearchEntry {
  return { title: '', text: '', ...partial }
}

describe('words', () => {
  it('folds accents and case the way the word games do, and splits on anything else', () => {
    expect(words('L’écran — Décisions, 2048!')).toEqual(['L', 'ECRAN', 'DECISIONS', '2048'])
    expect(words('vim-style `ctx.capture()`')).toEqual(['VIM', 'STYLE', 'CTX', 'CAPTURE'])
    expect(words('  ')).toEqual([])
  })
})

describe('rank', () => {
  it('matches the start of a word, not the middle of one', () => {
    expect(find('wor')).toEqual(['wordle'])
    expect(find('ordle')).toEqual([])
    expect(find('ab')).toEqual(['cd about'])
  })

  it('needs every word of the query to land somewhere', () => {
    expect(find('cd pro')).toEqual(['cd projects'])
    expect(find('cd wordle')).toEqual([])
  })

  it('ignores accents and case on both sides', () => {
    expect(find('ECRAN')).toEqual(['theme'])
    expect(find('thèm')).toEqual(['theme'])
  })

  it('ranks a title above a heading above the text, and a whole word above a prefix', () => {
    const pool = [
      searchable('text', { title: 'other', text: 'polling every twenty seconds' }),
      searchable('heading', { title: 'other', heading: 'Polling' }),
      searchable('prefix', { title: 'Pollinator' }),
      searchable('title', { title: 'Polling' }),
    ]
    expect(rank(pool, 'polling')).toEqual(['title', 'heading', 'text'])
    expect(rank(pool, 'poll')).toEqual(['prefix', 'title', 'heading', 'text'])
  })

  it('keeps the list’s own order between equals, and everything for a query with no words', () => {
    expect(find('cd')).toEqual(['cd about', 'cd projects'])
    expect(find('')).toHaveLength(palette.length)
    expect(find('— ?')).toHaveLength(palette.length)
  })
})

describe('searchIndex', () => {
  const index: SearchIndex = {
    version: 1,
    entries: [
      entry({ kind: 'now', title: '/now', text: { en: 'Building this site', fr: 'Je construis ce site' }, target: '/now' }),
      entry({ kind: 'work', title: { en: 'The QR encoder', fr: 'L’encodeur QR' }, text: { en: 'From the standard, for this site', fr: 'D’après la norme' }, target: '/work/qr' }),
      entry({ kind: 'note', title: 'A real vim-style pane', text: 'Intro', lang: 'en', target: '/notes/vim-pane' }),
      entry({ kind: 'note', title: 'A real vim-style pane', heading: 'Key mapping', text: 'Each key', lang: 'en', target: '/notes/vim-pane#key-mapping' }),
      entry({ kind: 'note', title: 'Fond animé Three.js', heading: 'Contexte', text: 'Un écran', lang: 'fr', target: '/notes/threejs#contexte' }),
      ...Array.from({ length: PER_KIND + 3 }, (_, i) =>
        entry({ kind: 'why', title: { en: `Topic ${i}`, fr: `Sujet ${i}` }, text: { en: 'Polling', fr: 'Sondage' }, target: `/?run=why%20t${i}` }),
      ),
    ],
  }

  it('waits for a query long enough to search with', () => {
    expect(MIN_QUERY).toBe(3)
    expect(wantsIndex('qr')).toBe(false)
    expect(wantsIndex(' qr ')).toBe(false)
    expect(searchIndex(index, 'qr', 'en')).toEqual([])
    expect(wantsIndex('vim')).toBe(true)
  })

  it('groups by kind, in the palette’s order, at most PER_KIND each', () => {
    const groups = searchIndex(index, 'polling', 'en')
    expect(groups.map((group) => group.kind)).toEqual(['why'])
    expect(groups[0]!.results).toHaveLength(PER_KIND)

    // Level on `site`, and /now comes first in the index: the groups keep their own order.
    expect(searchIndex(index, 'site', 'en').map((group) => group.kind)).toEqual(['work', 'now'])
    expect(searchKinds).toEqual(['work', 'why', 'note', 'now'])
  })

  it('searches the page’s language, and a note in its own', () => {
    expect(searchIndex(index, 'encodeur', 'fr')[0]!.results[0]).toMatchObject({ label: 'L’encodeur QR', hint: 'D’après la norme' })
    expect(searchIndex(index, 'encodeur', 'en')).toEqual([])
    const [notes] = searchIndex(index, 'ecran', 'en')
    expect(notes!.results).toEqual([expect.objectContaining({ label: 'Contexte', hint: 'Fond animé Three.js', lang: 'fr' })])
  })

  // Otherwise `vim` would put every heading of a vim note level with the note.
  it('ranks a section by its heading, with its note’s title as context only', () => {
    const [notes] = searchIndex(index, 'vim', 'en')
    expect(notes!.results.map((result) => result.entry.target)).toEqual(['/notes/vim-pane', '/notes/vim-pane#key-mapping'])
    expect(searchIndex(index, 'vim key', 'en')[0]!.results.map((result) => result.label)).toEqual(['Key mapping'])
  })
})

describe('a `why` result', () => {
  // The palette runs a `why` result through the `?run=` path, which refuses anything else,
  // at every width: below `md`, in the touch layout.
  it('only ever asks the terminal for a line a link may run, and a phone can', () => {
    for (const decision of decisions) {
      const link = resolveLink(`why ${decision.id}`)!
      expect(isLinkable(link.command, link.args), decision.id).toBe(true)
      expect(tapRuns(`why ${decision.id}`), decision.id).toBe(true)
    }
  })
})

describe('readIndex', () => {
  it('reads an index of its own version, and searches anything else as empty', () => {
    const index = { version: 1, entries: [entry({ kind: 'now', target: '/now' })] }
    expect(readIndex(index)).toBe(index)
    expect(readIndex({ version: 2, entries: index.entries })).toEqual({ version: 1, entries: [] })
    expect(readIndex('<!DOCTYPE html>')).toEqual({ version: 1, entries: [] })
    expect(readIndex(null)).toEqual({ version: 1, entries: [] })
  })
})

describe('loadSearchIndex', () => {
  /** A fresh module each time: the loaded index is kept per page, in the module. */
  async function fresh() {
    vi.resetModules()
    return (await import('../search')).loadSearchIndex
  }

  const ok = () => Promise.resolve(new Response(JSON.stringify({ version: 1, entries: [] })))

  it('fetches the index once, however often it is asked', async () => {
    const load = await fresh()
    const fetcher = vi.fn(ok)
    const [a, b] = await Promise.all([load(fetcher), load(fetcher)])
    await load(fetcher)
    expect(a).toBe(b)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith(SEARCH_URL)
  })

  it('doesn’t keep a failure, so asking again tries again', async () => {
    const load = await fresh()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockImplementationOnce(ok)
    await expect(load(fetcher)).rejects.toThrow('503')
    await expect(load(fetcher)).resolves.toEqual({ version: 1, entries: [] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
