// @vitest-environment node
// The corpus plugin runs at build time, in Node, and reads the notes off disk.
import { describe, expect, it } from 'vitest'
import { buildCorpus, pack, SPLIT_AT } from '../../../vite-plugins/corpus'
import { buildNotes, noteFiles, readNote } from '../../../vite-plugins/notes'
import { isLinkable, resolve } from '@/terminal/registry'
import { CORPUS_VERSION, type Passage } from '../corpus'
import { decisions } from '../decisions'
import { machines } from '../hardware'
import { labNodes } from '../lab'
import { sections } from '../sections'
import { pagePaths } from '../site'
import { work } from '../work'

const SHA = 'abc1234'
const corpus = buildCorpus(SHA, '2026-10-15T00:00:00.000Z')
const of = (kind: Passage['kind']) => corpus.passages.filter((passage) => passage.kind === kind)
const pages = new Map(buildNotes(SHA).map((page) => [page.url, page.source]))
const texts = (value: Passage['text']) => (typeof value === 'string' ? [value] : [value.en, value.fr])

/** Where a target goes: a page of the app, a section of the home page, a note's heading, or a command a link may run. */
function resolves(target: string): boolean {
  if (!target.startsWith('/')) {
    const [name = '', ...args] = target.split(' ')
    const command = resolve(name)
    return !!command && isLinkable(command, args)
  }
  const [path = '', anchor] = target.split('#')
  if (path.startsWith('/notes/')) {
    const page = pages.get(path)
    return !!page && (!anchor || page.includes(`id="${anchor}"`))
  }
  if (path === '/') return !!anchor && sections.some((section) => section.id === anchor)
  return pagePaths.includes(path)
}

/**
 * What `ask` retrieves from (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md` §2),
 * held to the site the way `search.spec.ts` holds the search index: a new case study,
 * decision or note heading the model can't find is a gap nobody would notice.
 */
describe('the corpus', () => {
  it('is the version the backend checks for, with unique ids', () => {
    expect(corpus.version).toBe(CORPUS_VERSION)
    expect(new Set(corpus.passages.map((passage) => passage.id)).size).toBe(corpus.passages.length)
  })

  it('has every case study, whole: its summary, what was hard, its numbers', () => {
    for (const part of work) {
      const passages = of('work').filter((passage) => passage.target === `/work/${part.id}`)
      expect(passages.length, part.id).toBeGreaterThanOrEqual(2)
      expect(JSON.stringify(passages)).toContain(part.hard.en[0]!.slice(0, 40).replace(/`/g, ''))
    }
  })

  it('has every decision, with what it rejected and its hindsight, as `why <topic>`', () => {
    for (const decision of decisions) {
      const passage = of('why').find((each) => each.target === `why ${decision.id}`)
      expect(passage, decision.id).toBeDefined()
      const text = passage!.text as { en: string }
      expect(text.en).toContain('Rejected:')
      if (decision.hindsight) expect(text.en).toContain('In hindsight:')
    }
  })

  it.each(noteFiles().map((file) => [file, readNote(file, SHA)] as const))('has every heading of %s, in its own language', (_file, note) => {
    const page = pages.get(`/notes/${note.slug}`)!
    const ids = [...page.matchAll(/<h[1-6] id="([^"]+)">/g)].map((match) => match[1]!)
    const targets = new Set(of('note').filter((passage) => passage.target.startsWith(`/notes/${note.slug}`)).map((p) => p.target))
    expect(targets.has(`/notes/${note.slug}`)).toBe(true)
    for (const id of ids.slice(1)) expect(targets.has(`/notes/${note.slug}#${id}`), id).toBe(true)
    for (const passage of of('note').filter((each) => each.target.startsWith(`/notes/${note.slug}`))) {
      expect(passage.lang).toBe(note.lang)
      expect(typeof passage.text).toBe('string')
    }
  })

  it('has /now, every machine, the music, gaming and tools sections, and every lab node', () => {
    expect(of('now')).toHaveLength(1)
    expect(of('hardware')).toHaveLength(machines.length)
    expect(of('music')).toHaveLength(1)
    expect(of('gaming')).toHaveLength(1)
    expect(of('tools')).toHaveLength(1)
    expect(of('lab').map((passage) => passage.id)).toEqual(labNodes.map((node) => `lab-${node.id}`))
  })

  it.each(corpus.passages.map((passage) => [passage.id, passage] as const))('%s points somewhere that resolves', (_id, passage) => {
    expect(resolves(passage.target), passage.target).toBe(true)
  })

  it('keeps no markup and no code block in any text, and no passage past the split', () => {
    for (const passage of corpus.passages) {
      for (const text of texts(passage.text)) {
        expect(text, passage.id).not.toMatch(/`|&(amp|lt|gt|quot|#39);|<\/?(p|pre|code|a|li|td|strong|em)\b/)
        if (passage.kind === 'note') expect(text.length, passage.id).toBeLessThanOrEqual(SPLIT_AT + 1_000)
      }
    }
  })
})

describe('pack', () => {
  it('keeps paragraphs whole and starts a new chunk past the limit', () => {
    expect(pack(['a'.repeat(10), 'b'.repeat(10), 'c'.repeat(10)], 25)).toEqual([`${'a'.repeat(10)} ${'b'.repeat(10)}`, 'c'.repeat(10)])
    // A single paragraph longer than the limit stays one chunk rather than being cut.
    expect(pack(['x'.repeat(40)], 25)).toEqual(['x'.repeat(40)])
  })
})
