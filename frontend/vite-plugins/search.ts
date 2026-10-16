import type { Plugin } from 'vite'
import { decisions } from '../src/content/decisions'
import { labNodes } from '../src/content/lab'
import { now } from '../src/content/now'
import type { SearchEntry, SearchIndex } from '../src/content/search'
import type { Localised } from '../src/content/types'
import { work } from '../src/content/work'
import { commitSha } from './git'
import { noteFiles, readNote } from './notes'

/**
 * `/search.json`: what the Ctrl+K palette searches besides its own commands. One entry
 * per case study, per `why` topic, per heading of every design note, and one each for
 * `/now` and `/lab` (the shape is `content/search.ts`). Emitted like `content.json` rather
 * than bundled, because the palette is in the eager chunk and the home page sits near its
 * byte budget:
 * the palette fetches this on the first query long enough to search with, and a visitor
 * who never searches never pays for it. Kept out of the precache, like the notes it
 * indexes, and off the SPA fallback (`vite.config.ts`).
 */

/** Long enough to tell two results apart and to match on; short enough that the file stays small. */
export const TEXT_LIMIT = 200

/** Code spans keep their words and lose their backticks, as on the pages that render them. */
function plain(text: string): string {
  return text.replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim()
}

/** The opening of a body, cut at a word, so a result never ends mid-word. */
export function cut(text: string, limit = TEXT_LIMIT): string {
  const flat = plain(text)
  if (flat.length <= limit) return flat
  const head = flat.slice(0, limit - 1)
  const space = head.lastIndexOf(' ')
  return `${(space > limit / 2 ? head.slice(0, space) : head).replace(/[\s,;:.—–-]+$/, '')}…`
}

function both(value: Localised, limit?: number): Localised {
  return { en: cut(value.en, limit), fr: cut(value.fr, limit) }
}

/**
 * The rendered note's text, as a reader sees it: no tags, no entities, no code blocks.
 * An inline tag goes without a trace, so `(<code>x</code>)` reads `(x)`; any other
 * leaves a space, so two table cells don't run together.
 */
export function textOf(html: string): string {
  return html
    .replace(/<pre>[\s\S]*?<\/pre>/g, ' ')
    .replace(/<\/?(code|a|strong|em)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export const HEADING = /<h([1-6]) id="([^"]+)">([\s\S]*?)<\/h\1>/g

/**
 * A note's sections, read off the page the notes plugin renders rather than off the
 * markdown: the ids are the ones that page carries, numbered repeats and all, so a
 * result can't point at an anchor the page doesn't have. The `# ` title is the note
 * itself, linked without an anchor.
 */
function noteEntries(file: string, sha: string): SearchEntry[] {
  const note = readNote(file, sha)
  const headings = [...note.html.matchAll(HEADING)]
  return headings.map((match, i) => {
    const start = match.index + match[0].length
    const end = headings[i + 1]?.index ?? note.html.length
    const text = cut(textOf(note.html.slice(start, end)))
    const base = { kind: 'note' as const, title: note.title, text, lang: note.lang }
    if (match[1] === '1') return { ...base, target: `/notes/${note.slug}` }
    return { ...base, heading: textOf(match[3]!), target: `/notes/${note.slug}#${match[2]}` }
  })
}

export function buildSearchIndex(sha = commitSha()): SearchIndex {
  const entries: SearchEntry[] = [
    ...work.map((part) => ({
      kind: 'work' as const,
      title: part.name,
      text: both(part.summary),
      target: `/work/${part.id}`,
    })),
    // `why <topic>` in the terminal, which runs it at any width: below `md`, in the touch layout.
    ...decisions.map((decision) => ({
      kind: 'why' as const,
      title: decision.topic,
      text: both(decision.chose),
      target: `/?run=${encodeURIComponent(`why ${decision.id}`)}`,
    })),
    ...noteFiles().flatMap((file) => noteEntries(file, sha)),
    {
      kind: 'now',
      title: '/now',
      text: {
        en: cut(now.entries.map((entry) => entry.text.en).join(' ')),
        fr: cut(now.entries.map((entry) => entry.text.fr).join(' ')),
      },
      target: '/now',
    },
    // The lab map is a diagram, so its entry is what it draws: the node names and roles.
    {
      kind: 'lab',
      title: '/lab',
      text: {
        en: cut(labNodes.map((node) => `${node.name}: ${node.role.en}.`).join(' ')),
        fr: cut(labNodes.map((node) => `${node.name} : ${node.role.fr}.`).join(' ')),
      },
      target: '/lab',
    },
  ]
  return { version: 1, entries }
}

export function searchPlugin(): Plugin {
  return {
    name: 'couvbat-search',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'search.json', source: JSON.stringify(buildSearchIndex()) })
    },
    // Rebuilt per request in dev, so an edited spec or case study is searchable on reload.
    configureServer(server) {
      server.middlewares.use('/search.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(buildSearchIndex()))
      })
    },
  }
}
