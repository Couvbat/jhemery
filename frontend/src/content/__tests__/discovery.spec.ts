import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tools } from '@/tools/registry'
import { noteSlug } from '../docs'
import { profile } from '../profile'
import { views } from '../views'

/**
 * `sitemap.xml` and `llms.txt` are hand-written files in `public/`, and the things they
 * list are code: the routes, the tool registry, the printable résumés. This is what
 * stops one being added without the other. A page missing from the sitemap exists for
 * visitors and not for crawlers; one missing from llms.txt doesn't exist for agents, or
 * for `ask`, which answers from that file.
 *
 * Routes come from the router's source rather than an import, so this spec doesn't pull
 * in every view. Rows that add URLs not in the router (the notes, the case studies) add
 * them to `expected` below when they land.
 */

const site = `https://${profile.domain}`
const read = (file: string) => readFileSync(join(process.cwd(), 'public', file), 'utf8')
const sitemap = read('sitemap.xml')
const llms = read('llms.txt')

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
    ...tools.filter((tool) => tool.tier !== 'admin').map((tool) => `/tools/${tool.id}`),
    '/resume.html',
    '/resume.fr.html',
    // The design notes: one page per spec, plus the index (vite-plugins/notes.ts).
    '/notes/',
    ...readdirSync(join(process.cwd(), '../docs/superpowers/specs'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => `/notes/${noteSlug(file)}`),
  ]),
].sort()

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

  it('has a sitemap that parses', () => {
    const doc = new DOMParser().parseFromString(sitemap, 'application/xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(doc.getElementsByTagName('url').length).toBe(sitemap.match(/<url>/g)!.length)
  })
})
