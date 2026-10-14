// @vitest-environment node
// The notes plugin runs at build time, in Node, and reads the specs off disk.
import { describe, expect, it } from 'vitest'
import { buildNotes, noteDescription, noteFiles, readNote, rewriteLink } from '../../../vite-plugins/notes'

const SHA = 'abc1234'
const notes = noteFiles().map((file) => readNote(file, SHA))
const pages = buildNotes(SHA)
const page = (url: string) => pages.find((p) => p.url === url)!.source
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Every id a page declares. */
const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!))

/** The page with code blocks and spans taken out, where markdown has no business surviving. */
const prose = (html: string) => html.replace(/<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, '')

describe('design notes', () => {
  it('publishes every spec, with unique slugs', () => {
    expect(notes.length).toBe(13)
    expect(new Set(notes.map((n) => n.slug)).size).toBe(notes.length)
  })

  it.each(notes.map((n) => [n.slug, n] as const))('%s is a document with no script and one title', (slug, note) => {
    const html = page(`/notes/${slug}`)
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain(`<html lang="${note.lang}">`)
    expect(html).not.toMatch(/<script|<iframe/i)
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain('<link rel="stylesheet" href="/notes.css">')
    expect(prose(html)).not.toMatch(/```|\*\*|\]\(/)
  })

  // The site is bilingual and the notes are not, so each says which language it is in.
  it('knows which note is French, and every page says its language', () => {
    expect(notes.filter((n) => n.lang === 'fr').map((n) => n.slug)).toEqual(['threejs-wireframe-background'])
    for (const note of notes) {
      const html = page(`/notes/${note.slug}`)
      expect(html).toMatch(note.lang === 'fr' ? /n’existe qu’en français/ : /n’existe qu’en anglais/)
    }
  })

  // `why` and the case studies link to /notes/<slug>#<anchor>: every one has to land.
  it('resolves every anchor it links to, within a note and across notes', () => {
    for (const note of notes) {
      const html = page(`/notes/${note.slug}`)
      for (const [, target, anchor] of html.matchAll(/href="(\/notes\/[a-z0-9-]+)?#([^"]+)"/g)) {
        const into = target ? page(target) : html
        expect(ids(into), `${note.slug} → ${target ?? ''}#${anchor}`).toContain(anchor)
      }
    }
  })

  it('sends repo paths to GitHub at the build’s commit, and sibling specs to their notes', () => {
    expect(rewriteLink('../../../frontend/src/rooms/sync.ts', SHA)).toBe(
      `https://github.com/Couvbat/jhemery/blob/${SHA}/frontend/src/rooms/sync.ts`,
    )
    expect(rewriteLink('2026-08-04-ctf-flag-chain-design.md#stages', SHA)).toBe('/notes/ctf-flag-chain#stages')
    expect(rewriteLink('../../features-spec.md', 'dev')).toBe('https://github.com/Couvbat/jhemery/blob/master/docs/features-spec.md')
    expect(rewriteLink('https://example.com', SHA)).toBe('https://example.com')
  })

  it('lists every note on the index', () => {
    const index = page('/notes/')
    for (const note of notes) expect(index).toContain(`href="/notes/${note.slug}"`)
  })
})

// What a search result says under each note. It used to be one sentence for all thirteen,
// so a search engine had nothing to tell them apart by.
describe('a note’s description', () => {
  const metaOf = (html: string, attribute: string, key: string) =>
    new RegExp(`<meta ${attribute}="${key}" content="([^"]*)">`).exec(html)?.[1]

  it.each(notes.map((n) => [n.slug, n] as const))('%s has its own, in plain text', (slug, note) => {
    expect(note.description.length, slug).toBeGreaterThan(60)
    expect(note.description.length, slug).toBeLessThanOrEqual(200)
    expect(note.description).not.toMatch(/`|\*\*|\]\(|^(Status|Statut)\b|:$/)
    const html = page(`/notes/${slug}`)
    expect(metaOf(html, 'name', 'description')).toBe(escape(note.description))
    expect(metaOf(html, 'property', 'og:description')).toBe(escape(note.description))
    expect(metaOf(html, 'property', 'og:type')).toBe('article')
    expect(metaOf(html, 'property', 'article:published_time')).toBe(note.date)
    expect(metaOf(html, 'property', 'og:url')).toBe(`https://jhemery.xyz/notes/${slug}`)
  })

  it('is a different sentence for every note', () => {
    expect(new Set(notes.map((n) => n.description)).size).toBe(notes.length)
  })

  it('titles a page by the note, not by the kind of document it is', () => {
    const ctf = notes.find((n) => n.slug === 'ctf-flag-chain')!
    expect(ctf.name).toBe('CTF flag chain')
    expect(page('/notes/ctf-flag-chain')).toContain('<title>CTF flag chain — design note · jhemery.xyz</title>')
  })

  it('takes the goal where the context states one', () => {
    const spec = '# T\n\nStatus: done.\n\n## Context\n\nThe card was fake.\n\nGoal: show `real` activity.\n\n## Next\n\nNo.'
    expect(noteDescription(spec)).toBe('Show real activity.')
  })

  it('runs a paragraph that introduces a list on into the next one', () => {
    const spec = '# T\n\n## Context\n\nTwo games. What they paid for:\n\n- a list\n\nSo the third is cheap.\n'
    expect(noteDescription(spec)).toBe('Two games. So the third is cheap.')
  })

  it('falls back on the status line, after the status itself', () => {
    expect(noteDescription('# T\n\nStatus: shipped in #98. This records the open decisions.\n\n## Part\n\nText.')).toBe(
      'This records the open decisions.',
    )
  })

  it('ends a long one on a sentence, or on a word', () => {
    const long = `${'word '.repeat(30)}ends here. ${'more '.repeat(40)}`
    expect(noteDescription(`# T\n\n## Context\n\n${long}`)).toMatch(/ends here\.$/)
    expect(noteDescription(`# T\n\n## Context\n\n${'word '.repeat(60)}`)).toMatch(/word…$/)
  })
})
