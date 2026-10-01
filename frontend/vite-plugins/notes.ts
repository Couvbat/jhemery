import { readdirSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import { noteSlug } from '../src/content/docs'
import { profile } from '../src/content/profile'
import type { Locale } from '../src/content/types'
import { commitSha, sourceRef } from './git'
import { escapeHtml, renderMarkdown } from './markdown'

/**
 * The design specs in `docs/superpowers/specs`, published as static pages at
 * `/notes/<slug>`: the best record of how the site was thought through, and until now
 * only readable on GitHub. Built like the printable résumés: documents, not pages of
 * the app, with no script, a stylesheet of their own, and kept off the SPA fallback and
 * the precache (`vite.config.ts`). The specs are build input, so the frontend build and
 * deploy workflows watch their folder too.
 *
 * Each page says which language it is in, since the site is bilingual and the notes
 * are not: twelve are in English and one in French.
 */

const SPEC_DIR = fileURLToPath(new URL('../../docs/superpowers/specs/', import.meta.url))
const SPEC_PATH = 'docs/superpowers/specs'
const REPO = 'https://github.com/Couvbat/jhemery'

export interface Note {
  file: string
  slug: string
  /** The `# ` heading, as plain text. */
  title: string
  /** `YYYY-MM-DD`, from the file name. */
  date: string
  lang: Locale
  /** The rendered body. */
  html: string
}

export function noteFiles(): string[] {
  return readdirSync(SPEC_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
}

/** French or English, by which language's commonest words the text uses more. */
export function noteLang(markdown: string): Locale {
  const prose = markdown.replace(/```[\s\S]*?```|`[^`]*`/g, ' ')
  const count = (pattern: RegExp) => (prose.match(pattern) ?? []).length
  const fr = count(/\b(le|la|les|des|une|est|pour|dans|qui)\b/gi)
  const en = count(/\b(the|and|is|of|to|for|which|that)\b/gi)
  return fr > en ? 'fr' : 'en'
}

/**
 * Where a link in a spec really goes. A sibling spec is a note; any other path in the
 * repository is GitHub at the build's commit, so it shows the code the note describes.
 */
export function rewriteLink(href: string, sha: string): string {
  if (/^(https?:|mailto:|#)/.test(href)) return href
  const [path = '', hash] = href.split('#')
  const resolved = posix.normalize(posix.join(SPEC_PATH, path))
  const anchor = hash ? `#${hash}` : ''
  if (resolved.startsWith(`${SPEC_PATH}/`) && resolved.endsWith('.md')) return `/notes/${noteSlug(resolved)}${anchor}`
  return `${REPO}/blob/${sourceRef(sha)}/${resolved}${anchor}`
}

export function readNote(file: string, sha: string): Note {
  const markdown = readFileSync(`${SPEC_DIR}${file}`, 'utf8')
  const { html, title } = renderMarkdown(markdown, { file, rewriteLink: (href) => rewriteLink(href, sha) })
  return {
    file,
    slug: noteSlug(file),
    title: title.replace(/`/g, ''),
    date: file.slice(0, 10),
    lang: noteLang(markdown),
    html,
  }
}

const ABOUT: Record<Locale, { en: string; fr: string }> = {
  en: {
    en: 'A design note, written while building the site. It is in English only.',
    fr: 'Une note de conception, écrite pendant la construction du site. Elle n’existe qu’en anglais.',
  },
  fr: {
    en: 'A design note, written while building the site. It is in French only.',
    fr: 'Une note de conception, écrite pendant la construction du site. Elle n’existe qu’en français.',
  },
}

function page(lang: Locale, title: string, path: string, body: string): string {
  const base = `https://${profile.domain}`
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(`Design notes written while building ${profile.domain}.`)}">
  <link rel="canonical" href="${base}${path}">
  <link rel="stylesheet" href="/notes.css">
</head>
<body>
${body}
</body>
</html>
`
}

export function buildNote(note: Note, sha: string): string {
  const about = ABOUT[note.lang]
  const other: Locale = note.lang === 'en' ? 'fr' : 'en'
  const source = `${REPO}/blob/${sourceRef(sha)}/${SPEC_PATH}/${note.file}`
  return page(
    note.lang,
    `${note.title} — design note · ${profile.domain}`,
    `/notes/${note.slug}`,
    `  <nav class="screen-only">
    <a href="/notes/">← all notes</a> · <a href="/">${escapeHtml(profile.domain)}</a> · <a href="${escapeHtml(source)}">source</a>
  </nav>
  <main>
    <p class="about"><span lang="${note.lang}">${escapeHtml(about[note.lang])}</span> <span lang="${other}">${escapeHtml(about[other])}</span> <time datetime="${note.date}">${note.date}</time></p>
    <article>
${note.html}
    </article>
  </main>`,
  )
}

export function buildNotesIndex(notes: Note[]): string {
  const items = [...notes]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (note) =>
        `      <li><time datetime="${note.date}">${note.date}</time> <a href="/notes/${note.slug}" hreflang="${note.lang}">${escapeHtml(note.title)}</a>${note.lang === 'fr' ? ' <span class="tag" lang="en">(in French)</span>' : ''}</li>`,
    )
    .join('\n')
  return page(
    'en',
    `Design notes · ${profile.domain}`,
    '/notes/',
    `  <nav class="screen-only"><a href="/">← ${escapeHtml(profile.domain)}</a></nav>
  <main>
    <h1>Design notes</h1>
    <p class="about"><span lang="en">How the site was thought through, written while building it: one note per piece, with what was chosen and what was turned down.</span> <span lang="fr">Comment le site a été pensé, écrit pendant sa construction : une note par morceau, avec ce qui a été choisi et ce qui a été écarté. En anglais, sauf une.</span></p>
    <ul class="notes">
${items}
    </ul>
  </main>`,
  )
}

/** Light, like the résumé's: a page meant to be read, and printed if need be. */
export const NOTES_CSS = `:root {
  --ink: #111;
  --muted: #555;
  --rule: #ddd;
  --code: #f4f4f4;
  --accent: #0a6a24;
  color-scheme: light;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #fff;
  color: var(--ink);
  font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
main, nav { max-width: 46rem; margin: 0 auto; padding: 0 1.25rem; }
nav { padding-top: 1.25rem; font-size: 0.9rem; color: var(--muted); }
main { padding-bottom: 4rem; }
.about { color: var(--muted); font-size: 0.9rem; border-bottom: 1px solid var(--rule); padding-bottom: 0.75rem; }
.about time, .notes time, .tag { color: var(--muted); font-variant-numeric: tabular-nums; }
h1 { font-size: 1.75rem; line-height: 1.25; margin: 1.5rem 0 1rem; }
h2 { font-size: 1.3rem; margin: 2rem 0 0.75rem; border-bottom: 1px solid var(--rule); padding-bottom: 0.25rem; }
h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
h4, h5, h6 { font-size: 1rem; margin: 1.25rem 0 0.5rem; }
a { color: var(--accent); }
code, pre { font: 0.88em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
code { background: var(--code); padding: 0.1em 0.3em; border-radius: 3px; }
pre { background: var(--code); padding: 0.75rem 1rem; overflow-x: auto; border-radius: 4px; }
pre code { background: none; padding: 0; }
blockquote { margin: 1rem 0; padding: 0.25rem 1rem; border-left: 3px solid var(--rule); color: #333; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.92rem; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--rule); padding: 0.35rem 0.6rem; text-align: left; vertical-align: top; }
th { background: var(--code); }
hr { border: none; border-top: 1px solid var(--rule); margin: 2rem 0; }
.notes { list-style: none; padding: 0; }
.notes li { margin: 0.4rem 0; }
@media print {
  .screen-only { display: none; }
  body { font-size: 11pt; }
  a { color: inherit; }
  pre, table, blockquote { break-inside: avoid; }
}
`

interface Emitted {
  /** As served: `/notes/ctf-flag-chain`, `/notes/`, `/notes.css`. */
  url: string
  fileName: string
  contentType: string
  source: string
}

export function buildNotes(sha = commitSha()): Emitted[] {
  const notes = noteFiles().map((file) => readNote(file, sha))
  const html = 'text/html; charset=utf-8'
  return [
    ...notes.map((note) => ({ url: `/notes/${note.slug}`, fileName: `notes/${note.slug}.html`, contentType: html, source: buildNote(note, sha) })),
    { url: '/notes/', fileName: 'notes/index.html', contentType: html, source: buildNotesIndex(notes) },
    { url: '/notes.css', fileName: 'notes.css', contentType: 'text/css; charset=utf-8', source: NOTES_CSS },
  ]
}

export function notesPlugin(): Plugin {
  return {
    name: 'couvbat-notes',
    generateBundle() {
      for (const file of buildNotes()) this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source })
    },
    // Served in dev too, rebuilt per request so an edited spec shows on reload.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!.replace(/\/+$/, '') || '/'
        if (!path.startsWith('/notes')) return next()
        const want = path === '/notes' ? '/notes/' : path
        const file = buildNotes().find((f) => f.url === want || f.url === `${want}/`)
        if (!file) return next()
        res.setHeader('Content-Type', file.contentType)
        res.end(file.source)
      })
    },
  }
}
