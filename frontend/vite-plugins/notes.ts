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
 * are not: nineteen are in English and one in French.
 */

const SPEC_DIR = fileURLToPath(new URL('../../docs/superpowers/specs/', import.meta.url))
export const SPEC_PATH = 'docs/superpowers/specs'
const REPO = 'https://github.com/Couvbat/jhemery'

export interface Note {
  file: string
  slug: string
  /** The `# ` heading, as plain text. */
  title: string
  /**
   * The heading without the "Design spec — " half the later specs open with, which is
   * what every note is: the title of its page, its line on the index and in `llms.txt`.
   */
  name: string
  /** `YYYY-MM-DD`, from the file name. */
  date: string
  lang: Locale
  /** What a search result says under the title, as plain text (`noteDescription`). */
  description: string
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

/** Markdown inline syntax as the words it marks up: links as their text, no backticks or stars. */
function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_)(\S(?:[\s\S]*?\S)?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** At most `max` characters, ending on a full sentence where one ends far enough in. */
function clip(text: string, max = 200): string {
  if (text.length <= max) return text
  const stop = text.lastIndexOf('. ', max - 1)
  if (stop >= 80) return text.slice(0, stop + 1)
  return `${text.slice(0, text.lastIndexOf(' ', max - 1)).replace(/[\s,;:—–-]+$/, '')}…`
}

const GOAL = /\b(Goal|Objectif)\s?:\s*/

/**
 * What a search result says under a note's title. Every note but one opens with a status
 * line (how it ended) and then `## Context`, whose first paragraph says what the note is
 * about, so that is the description, from its *Goal:* where it states one. A paragraph
 * that ends by introducing a list loses that sentence and runs on into the next one. A
 * note with no context section has its purpose in the status line, after the first
 * sentence, which is the status itself.
 */
export function noteDescription(markdown: string): string {
  const blocks = markdown.split(/\n\s*\n/).map((block) => block.trim())
  const context = blocks.findIndex((block) => /^##\s+(Context|Contexte)\s*$/.test(block.split('\n')[0]!))
  if (context === -1) {
    const status = blocks.find((block) => /^(Status|Statut)\s?:/.test(block)) ?? ''
    return clip(plainText(status.replace(/^[^.]*\.\s*/, '')))
  }
  const section: string[] = []
  for (const block of blocks.slice(context + 1)) {
    if (block.startsWith('#')) break
    // Prose only: lists, tables, code and quotes are no sentence to stand alone.
    if (!/^([-*|>]|```|\d+\.)/.test(block)) section.push(block)
  }
  const at = Math.max(0, section.findIndex((block) => GOAL.test(block)))
  let chosen = section[at] ?? ''
  if (chosen.endsWith(':')) chosen = `${chosen.replace(/[^.]*:$/, '').trim()} ${section[at + 1] ?? ''}`
  const goal = GOAL.exec(chosen)
  if (!goal) return clip(plainText(chosen))
  // "Goal: show real Steam activity" reads as a sentence once it starts like one.
  const text = plainText(chosen.slice(goal.index + goal[0].length))
  return clip(`${text.charAt(0).toUpperCase()}${text.slice(1)}`)
}

export function readNote(file: string, sha: string): Note {
  const markdown = readFileSync(`${SPEC_DIR}${file}`, 'utf8')
  const { html, title } = renderMarkdown(markdown, { file, rewriteLink: (href) => rewriteLink(href, sha) })
  const plain = title.replace(/`/g, '')
  const name = plain.replace(/^Design spec — /, '')
  return {
    file,
    slug: noteSlug(file),
    title: plain,
    name: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
    date: file.slice(0, 10),
    lang: noteLang(markdown),
    description: noteDescription(markdown),
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

interface Head {
  lang: Locale
  title: string
  /** Served path: `/notes/ctf-flag-chain`. */
  path: string
  description: string
  /** `YYYY-MM-DD`: a note is an article, the index is not. */
  date?: string
}

/**
 * The head a search result and a link preview read: the note's own description, and the
 * site's card image, since a note has no picture of its own. No JSON-LD: these pages carry
 * no `<script>` of any kind, and `notes.spec.ts` holds them to it.
 */
function page({ lang, title, path, description, date }: Head, body: string): string {
  const base = `https://${profile.domain}`
  const e = escapeHtml
  const article = date
    ? `
  <meta property="og:type" content="article">
  <meta property="article:published_time" content="${date}">`
    : `
  <meta property="og:type" content="website">`
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <link rel="canonical" href="${base}${path}">${article}
  <meta property="og:site_name" content="${e(profile.name)}">
  <meta property="og:url" content="${base}${path}">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:image" content="${base}/og-image.png">
  <meta property="og:locale" content="${lang === 'fr' ? 'fr_FR' : 'en_US'}">
  <meta name="twitter:card" content="summary_large_image">
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
    {
      lang: note.lang,
      title: `${note.name} — design note · ${profile.domain}`,
      path: `/notes/${note.slug}`,
      description: note.description,
      date: note.date,
    },
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
        `      <li><time datetime="${note.date}">${note.date}</time> <a href="/notes/${note.slug}" hreflang="${note.lang}">${escapeHtml(note.name)}</a>${note.lang === 'fr' ? ' <span class="tag" lang="en">(in French)</span>' : ''}</li>`,
    )
    .join('\n')
  return page(
    {
      lang: 'en',
      title: `Design notes · ${profile.domain}`,
      path: '/notes/',
      description: `Design notes written while building ${profile.domain}: one per piece of the site, with what was chosen and what was turned down.`,
    },
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
