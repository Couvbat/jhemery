// @vitest-environment node
// The search plugin runs at build time, in Node, and reads the notes off disk.
import { describe, expect, it } from 'vitest'
import { buildSearchIndex, cut, TEXT_LIMIT } from '../../../vite-plugins/search'
import { buildNotes, noteFiles, readNote } from '../../../vite-plugins/notes'
import { docUrl } from '@/lib/source'
import { linkTarget } from '@/terminal/links'
import { decisions } from '../decisions'
import { searchKinds, type SearchEntry } from '../search'
import type { Localised } from '../types'
import { work } from '../work'

const SHA = 'abc1234'
const index = buildSearchIndex(SHA)
const of = (kind: SearchEntry['kind']) => index.entries.filter((entry) => entry.kind === kind)
const byTarget = new Map(index.entries.map((entry) => [entry.target, entry]))

const notes = noteFiles().map((file) => readNote(file, SHA))
const pages = new Map(buildNotes(SHA).map((page) => [page.url, page.source]))

/** Every heading id a published note carries, in order: what a result may point at. */
function headingIds(html: string): string[] {
  return [...html.matchAll(/<h[1-6] id="([^"]+)">/g)].map((match) => match[1]!)
}

const localised = (value: unknown): value is Localised =>
  typeof value === 'object' && value !== null && 'en' in value && 'fr' in value

/**
 * The palette can only find what the index lists, and the index is written by hand
 * nowhere: this is what keeps a new case study, `why` topic or note heading from being
 * unfindable, in the manner of `discovery.spec.ts` for the sitemap.
 */
describe('the search index', () => {
  it('lists every case study, in both languages, at its own route', () => {
    for (const part of work) {
      const entry = byTarget.get(`/work/${part.id}`)
      expect(entry, part.id).toBeDefined()
      expect(entry!.kind).toBe('work')
      expect(entry!.title).toEqual(part.name)
      expect(localised(entry!.text) && entry!.text.en && entry!.text.fr, part.id).toBeTruthy()
    }
    expect(of('work')).toHaveLength(work.length)
  })

  // `why <id>` in the terminal; where there's no terminal, the same design `why` links to.
  it('lists every decision as `why <topic>`, falling back to its design', () => {
    for (const decision of decisions) {
      const entry = byTarget.get(`/?run=${encodeURIComponent(`why ${decision.id}`)}`)
      expect(entry, decision.id).toBeDefined()
      expect(entry!.kind).toBe('why')
      expect(entry!.title).toEqual(decision.topic)
      expect(entry!.fallback, decision.id).toBe(docUrl(decision.source, SHA))
      expect(linkTarget(entry!.target)).toEqual({ kind: 'run', line: `why ${decision.id}` })
    }
    expect(of('why')).toHaveLength(decisions.length)
  })

  // Read off the published page, so a heading's anchor is the page's own, repeats numbered.
  it.each(notes.map((note) => [note.slug, note] as const))('lists every heading of %s, each at an id its page has', (slug, note) => {
    const ids = headingIds(pages.get(`/notes/${slug}`)!)
    const entries = of('note').filter((entry) => entry.target.split('#')[0] === `/notes/${slug}`)

    // The title is the note itself, linked without an anchor; every other heading is a section.
    expect(entries.map((entry) => entry.target)).toEqual([
      `/notes/${slug}`,
      ...ids.slice(1).map((id) => `/notes/${slug}#${id}`),
    ])
    expect(entries[0]!.heading).toBeUndefined()
    for (const entry of entries) {
      expect(entry.lang).toBe(note.lang)
      expect(entry.title).toBe(note.title)
      expect(typeof entry.text).toBe('string')
    }
    expect(entries.slice(1).every((entry) => entry.heading)).toBe(true)
  })

  it('marks the French note as French, the rest as English', () => {
    const french = new Set(of('note').filter((entry) => entry.lang === 'fr').map((entry) => entry.target.split('#')[0]))
    expect([...french]).toEqual(['/notes/threejs-wireframe-background'])
    expect(of('note').every((entry) => entry.lang === 'fr' || entry.lang === 'en')).toBe(true)
  })

  it('lists /now', () => {
    expect(of('now')).toEqual([expect.objectContaining({ target: '/now' })])
  })

  it('has nothing it can’t group, or follow', () => {
    expect(index.version).toBe(1)
    for (const entry of index.entries) {
      expect(searchKinds).toContain(entry.kind)
      const target = linkTarget(entry.target)
      if (entry.kind === 'note') expect(target.kind, entry.target).toBe('document')
      else if (entry.kind === 'why') expect(['document', 'external']).toContain(linkTarget(entry.fallback!).kind)
      else expect(target.kind, entry.target).toBe('route')
    }
    expect(new Set(index.entries.map((entry) => entry.target)).size).toBe(index.entries.length)
  })

  it('cuts every text short, and leaves no markup in it', () => {
    for (const entry of index.entries) {
      for (const text of typeof entry.text === 'string' ? [entry.text] : [entry.text.en, entry.text.fr]) {
        expect(text.length, entry.target).toBeLessThanOrEqual(TEXT_LIMIT)
        expect(text, entry.target).not.toMatch(/`|&(amp|lt|gt|quot|#39);|<\/?(p|code|a|li|td|strong|em)\b/)
      }
    }
  })

  // Fetched on a visitor's first query, so it has to stay a small file: a body that
  // stopped being cut would show up here before it showed up on anyone's phone bill.
  it('stays small', () => {
    expect(JSON.stringify(index).length).toBeLessThan(96 * 1024)
  })
})

describe('cut', () => {
  it('leaves a short text alone, but for its code spans’ backticks', () => {
    expect(cut('Runs `why polling` here.')).toBe('Runs why polling here.')
  })

  it('cuts at a word, and says so', () => {
    const text = cut('word '.repeat(100))
    expect(text.length).toBeLessThanOrEqual(TEXT_LIMIT)
    expect(text).toMatch(/word…$/)
  })

  it('drops the punctuation it would otherwise end on', () => {
    expect(cut('one two, three four', 12)).toBe('one two…')
  })
})
