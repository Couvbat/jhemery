// @vitest-environment node
// The notes plugin runs at build time, in Node, and reads the specs off disk.
import { describe, expect, it } from 'vitest'
import { buildNotes, noteFiles, readNote, rewriteLink } from '../../../vite-plugins/notes'

const SHA = 'abc1234'
const notes = noteFiles().map((file) => readNote(file, SHA))
const pages = buildNotes(SHA)
const page = (url: string) => pages.find((p) => p.url === url)!.source

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
