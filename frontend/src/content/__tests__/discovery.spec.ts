// @vitest-environment node
// The discovery plugin reads the specs and its template off disk, and under jsdom
// `import.meta.url` is an http: URL that can't be turned back into a path.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildLlms, buildSitemap } from '../../../vite-plugins/discovery'
import { noteSlug } from '../docs'
import { pages, pageUrl } from '../pages'
import { profile } from '../profile'
import { toolInfo } from '../tools'
import { views } from '../views'
import { work } from '../work'

/**
 * `sitemap.xml` and `llms.txt` are generated (`vite-plugins/discovery.ts`), from lists
 * that are code: the pages, the tools, the case studies, the notes. What this holds them
 * to is everything a visitor can reach: the routes in the router's source, the views and
 * the public tools, the printable résumés, every spec and every case study. A page missing
 * from the sitemap exists for visitors and not for crawlers; one missing from llms.txt
 * doesn't exist for agents, or for `ask`, which answers from that file.
 *
 * Routes come from the router's source rather than an import, so this spec doesn't pull
 * in every view.
 */

const site = `https://${profile.domain}`
const sitemap = buildSitemap()
const llms = buildLlms()

/** Every static route: optional parameters dropped, required ones and the catch-all skipped. */
function routerPaths(): string[] {
  const source = readFileSync(join(process.cwd(), 'src/router/index.ts'), 'utf8')
  return [...source.matchAll(/\bpath:\s*'([^']+)'/g)]
    .map((match) => match[1]!.replace(/\/:[A-Za-z]+\?/g, '') || '/')
    .filter((path) => !path.includes(':'))
}

const expected = [
  ...new Set([
    ...views.map((view) => view.path),
    ...routerPaths(),
    ...toolInfo.filter((tool) => tool.tier !== 'admin').map((tool) => `/tools/${tool.id}`),
    '/resume.html',
    '/resume.fr.html',
    // The design notes: one page per spec, plus the index (vite-plugins/notes.ts).
    '/notes/',
    ...readdirSync(join(process.cwd(), '../docs/superpowers/specs'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => `/notes/${noteSlug(file)}`),
    // The case studies: a route with a required parameter, so the router parse skips it.
    ...work.map((part) => `/work/${part.id}`),
  ]),
].sort()

/** The `<url>` blocks of the sitemap, by their `<loc>`. */
const urls = new Map(
  [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => [/<loc>([^<]+)<\/loc>/.exec(match[1]!)![1]!, match[1]!]),
)

describe('what the site tells crawlers and agents about itself', () => {
  it('reads the routes out of the router', () => {
    // At least /, /tools, /watch, /radio and /now; fewer means the pattern broke.
    expect(routerPaths().length).toBeGreaterThanOrEqual(5)
    expect(routerPaths()).toContain('/now')
  })

  it.each(expected)('the sitemap lists %s', (path) => {
    expect(sitemap).toContain(`<loc>${site}${path}</loc>`)
  })

  it.each(expected)('llms.txt links %s', (path) => {
    expect(llms).toContain(`](${site}${path})`)
  })

  it('leaves the agents’ note in llms.txt alone — it is a CTF stage', () => {
    expect(llms).toMatch(/## A note for agents[\s\S]*CTF\{[0-9a-f]{16}\}/)
  })

  it('fills every list llms.txt asks for, and leaves no placeholder', () => {
    expect(llms).not.toMatch(/\{\{|\}\}/)
    for (const tool of toolInfo.filter((entry) => entry.tier !== 'admin')) expect(llms).toContain(`: ${tool.description.en}\n`)
    for (const part of work) expect(llms).toContain(`: ${part.summary.en}\n`)
    // The owner's tool is no page for an agent to open.
    expect(llms).not.toContain('/tools/download')
  })

  it('refuses a template with a list it doesn’t have, or without one it does', () => {
    expect(() => buildLlms(undefined, '{{work}} {{tools}} {{notes}} {{nope}}')).toThrow(/no list called \{\{nope\}\}/)
    expect(() => buildLlms(undefined, '{{work}} {{tools}}')).toThrow(/never asks for \{\{notes\}\}/)
  })
})

// A search engine indexes URLs, so each language of a page is listed at its own, and each
// names the other, as the pages' heads do (vite-plugins/pages.ts).
describe('the sitemap', () => {
  it.each(pages.map((page) => [page.path] as const))('lists %s in both languages, each naming the other', (path) => {
    for (const locale of ['en', 'fr'] as const) {
      const block = urls.get(pageUrl(path, locale))
      expect(block, `${path} in ${locale}`).toBeDefined()
      expect(block).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${pageUrl(path, 'en')}"/>`)
      expect(block).toContain(`<xhtml:link rel="alternate" hreflang="fr" href="${pageUrl(path, 'fr')}"/>`)
      expect(block).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(path, 'en')}"/>`)
    }
  })

  it('pairs the printable résumés too', () => {
    expect(urls.get(`${site}/resume.fr.html`)).toContain(`hreflang="en" href="${site}/resume.html"`)
  })

  it('lists nothing twice', () => {
    expect(urls.size).toBe(sitemap.match(/<url>/g)!.length)
  })

  // No DOMParser here: the elements open and close in order, the declaration aside.
  it('is well-formed', () => {
    const open: string[] = []
    for (const [, slash, name, selfClosing] of sitemap.matchAll(/<(\/?)([a-z:]+)\b[^>]*?(\/?)>/g)) {
      if (selfClosing) continue
      if (slash) expect(open.pop()).toBe(name)
      else open.push(name!)
    }
    expect(open).toEqual([])
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset ')).toBe(true)
  })
})
