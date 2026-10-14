import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import { pages } from '../src/content/pages'
import { pageUrl, SITE } from '../src/content/site'
import { toolInfo } from '../src/content/tools'
import type { Locale } from '../src/content/types'
import { work } from '../src/content/work'
import { noteFiles, readNote, type Note } from './notes'
import { LOCALES } from './pages'
import { resumeHtmlFile } from './resume'

/**
 * `sitemap.xml` and `llms.txt`, generated from the content they list. Both were
 * hand-written in `public/`, and each new tool, case study or note had to be added to them
 * by hand, with `discovery.spec.ts` failing until it was. Now the lists come from the same
 * modules the app reads: the pages (`content/pages.ts`), the tools, the case studies and
 * the notes.
 *
 * `llms.txt` keeps its prose in `llms.template.md`, word for word, including stage 7 of
 * the CTF chain, and only its lists are filled in. `ask` reads the result as its corpus,
 * from the deployed site, so what it knows follows the content too.
 */

const TEMPLATE = fileURLToPath(new URL('./llms.template.md', import.meta.url))

function notes(): Note[] {
  // The sha only shapes links inside a note's body, which neither file reads.
  return noteFiles().map((file) => readNote(file, ''))
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** One `<url>`, with its language alternates when it has some. */
function entry(loc: string, alternates: Array<[hreflang: string, href: string]> = []): string {
  const links = alternates.map(
    ([hreflang, href]) => `\n    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${xml(href)}"/>`,
  )
  return `  <url>\n    <loc>${xml(loc)}</loc>${links.join('')}\n  </url>`
}

/** Both languages of a document, each listing both, and English as the default. */
function pair(url: (locale: Locale) => string): string[] {
  const alternates: Array<[string, string]> = [...LOCALES.map((lang) => [lang, url(lang)] as [string, string]), ['x-default', url('en')]]
  return LOCALES.map((locale) => entry(url(locale), alternates))
}

/**
 * No `changefreq` or `priority`: Google reads neither. No `lastmod` either, which Google
 * does read, but only while it stays accurate, and the date in a note's file name is
 * when it was written, not when it last changed.
 */
export function buildSitemap(list: Note[] = notes()): string {
  const urls = [
    ...pages.flatMap((page) => pair((locale) => pageUrl(page.path, locale))),
    ...pair((locale) => `${SITE}/${resumeHtmlFile(locale)}`),
    entry(`${SITE}/notes/`),
    // A note is written in one language, so it has no alternate to name.
    ...list.map((note) => entry(`${SITE}/notes/${note.slug}`)),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`
}

/** The lists `llms.template.md` asks for, by placeholder. */
function lists(list: Note[]): Record<string, string> {
  return {
    work: work.map((part) => `- [${part.name.en}](${SITE}/work/${part.id}): ${part.summary.en}`).join('\n'),
    tools: toolInfo
      .filter((tool) => tool.tier !== 'admin')
      .map((tool) => `- [${tool.name.en}](${SITE}/tools/${tool.id}): ${tool.description.en}`)
      .join('\n'),
    notes: list
      .map((note) => `- [${note.name}](${SITE}/notes/${note.slug})${note.lang === 'fr' ? ' (in French)' : ''}`)
      .join('\n'),
  }
}

export function buildLlms(list: Note[] = notes(), template = readFileSync(TEMPLATE, 'utf8')): string {
  const filled = lists(list)
  const used = new Set<string>()
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in filled)) throw new Error(`vite-plugins/llms.template.md: no list called {{${name}}}`)
    used.add(name)
    return filled[name]!
  })
  const unused = Object.keys(filled).filter((name) => !used.has(name))
  if (unused.length) throw new Error(`vite-plugins/llms.template.md: never asks for {{${unused.join('}}, {{')}}}`)
  return out
}

const FILES = {
  '/sitemap.xml': { contentType: 'application/xml; charset=utf-8', build: () => buildSitemap() },
  '/llms.txt': { contentType: 'text/plain; charset=utf-8', build: () => buildLlms() },
} as const

export function discoveryPlugin(): Plugin {
  return {
    name: 'jhemery:discovery',
    generateBundle() {
      for (const [url, file] of Object.entries(FILES)) {
        this.emitFile({ type: 'asset', fileName: url.slice(1), source: file.build() })
      }
    },
    // Served in dev too, rebuilt per request: the terminal's `curl` and `ask`'s local
    // corpus read them from the dev server.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]! as keyof typeof FILES
        const file = FILES[path]
        if (!file) return next()
        res.setHeader('Content-Type', file.contentType)
        res.end(file.build())
      })
    },
  }
}
