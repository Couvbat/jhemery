import type { Plugin } from 'vite'
import { CORPUS_VERSION, type Corpus, type Passage } from '../src/content/corpus'
import { decisions } from '../src/content/decisions'
import { gaming } from '../src/content/gaming'
import { machines } from '../src/content/hardware'
import { labNodes } from '../src/content/lab'
import { music } from '../src/content/music'
import { now } from '../src/content/now'
import { toolInfo } from '../src/content/tools'
import type { Localised } from '../src/content/types'
import { work } from '../src/content/work'
import { commitSha } from './git'
import { noteFiles, readNote } from './notes'
import { HEADING, textOf } from './search'

/**
 * `/corpus.json`: what `ask` retrieves from (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md`
 * §2), the shape in `src/content/corpus.ts`. It walks the sources the search index walks,
 * but keeps them whole, because `search.json`'s texts are cut at 200 characters, too short
 * to answer from: one passage per case-study section, per `why` topic, per design-note
 * section, `/now`, each machine, the music, gaming and tools sections, and each lab node.
 * Kept out of the precache and the sitemap, like `search.json`: it is public text, and a
 * crawler already has the pages.
 */

/** A note section past this is split at a paragraph boundary, so no passage drowns a question. */
export const SPLIT_AT = 1_500

const flat = (text: string) => text.replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim()
const both = (value: Localised, join = (s: string) => s): Localised => ({ en: join(flat(value.en)), fr: join(flat(value.fr)) })
const map = (fn: (locale: 'en' | 'fr') => string): Localised => ({ en: fn('en'), fr: fn('fr') })

/**
 * A note section's paragraphs, as the page shows them: code blocks dropped, each block
 * element one paragraph.
 */
function paragraphs(html: string): string[] {
  return html
    .replace(/<pre>[\s\S]*?<\/pre>/g, ' ')
    .split(/<\/(?:p|li|tr|blockquote|h[1-6])>/)
    .map(textOf)
    .filter(Boolean)
}

/** Paragraphs packed into chunks of at most `SPLIT_AT`, never splitting one. */
export function pack(parts: string[], limit = SPLIT_AT): string[] {
  const chunks: string[] = []
  let current = ''
  for (const part of parts) {
    if (current && current.length + 1 + part.length > limit) {
      chunks.push(current)
      current = part
    } else {
      current = current ? `${current} ${part}` : part
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function notePassages(file: string, sha: string): Passage[] {
  const note = readNote(file, sha)
  const headings = [...note.html.matchAll(HEADING)]
  return headings.flatMap((match, i) => {
    const start = match.index + match[0].length
    const end = headings[i + 1]?.index ?? note.html.length
    const heading = textOf(match[3]!)
    const target = match[1] === '1' ? `/notes/${note.slug}` : `/notes/${note.slug}#${match[2]}`
    const title = match[1] === '1' ? note.title : `${note.title} — ${heading}`
    // A heading with nothing but code or subheadings under it still gets a passage, its
    // own words, so every heading a page has is something `ask` can name.
    const found = pack(paragraphs(note.html.slice(start, end)))
    const chunks = found.length ? found : [heading]
    return chunks.map((text, part) => ({
      id: `note-${note.slug}-${match[2]}${part ? `-${part + 1}` : ''}`,
      kind: 'note' as const,
      title,
      text,
      target,
      lang: note.lang,
    }))
  })
}

export function buildCorpus(sha = commitSha(), generatedAt = new Date().toISOString()): Corpus {
  const passages: Passage[] = [
    ...work.flatMap((part): Passage[] => [
      { id: `work-${part.id}`, kind: 'work', title: part.name, text: both(part.summary), target: `/work/${part.id}` },
      {
        id: `work-${part.id}-hard`,
        kind: 'work',
        title: map((l) => `${part.name[l]} — ${l === 'fr' ? 'ce qui était difficile' : 'what was hard'}`),
        text: map((l) => flat(part.hard[l].join(' '))),
        target: `/work/${part.id}`,
      },
      ...(part.numbers.length
        ? [
            {
              id: `work-${part.id}-numbers`,
              kind: 'work' as const,
              title: map((l) => `${part.name[l]} — ${l === 'fr' ? 'en chiffres' : 'in numbers'}`),
              text: map((l) =>
                flat(part.numbers.map((n) => `${n.label[l]}: ${typeof n.value === 'string' ? n.value : n.value[l]}`).join('; ')),
              ),
              target: `/work/${part.id}`,
            },
          ]
        : []),
    ]),
    ...decisions.map(
      (decision): Passage => ({
        id: `why-${decision.id}`,
        kind: 'why',
        title: decision.topic,
        text: map((l) =>
          flat(
            [
              decision.chose[l],
              ...decision.rejected.map((r) => `${l === 'fr' ? 'Écarté' : 'Rejected'}: ${r.what[l]} — ${r.because[l]}`),
              ...(decision.hindsight ? [`${l === 'fr' ? 'Avec le recul' : 'In hindsight'}: ${decision.hindsight[l]}`] : []),
            ].join(' '),
          ),
        ),
        target: `why ${decision.id}`,
      }),
    ),
    ...noteFiles().flatMap((file) => notePassages(file, sha)),
    {
      id: 'now',
      kind: 'now',
      title: { en: 'What Jules is doing now', fr: 'Ce que fait Jules en ce moment' },
      text: map((l) => flat(now.entries.map((entry) => entry.text[l]).join(' '))),
      target: '/now',
    },
    ...machines.map(
      (machine): Passage => ({
        id: `hardware-${machine.name.toLowerCase()}`,
        kind: 'hardware',
        title: map((l) => `${machine.name} (${machine.category === 'pc' ? 'PC' : l === 'fr' ? 'serveur NAS' : 'NAS server'})`),
        text: map(
          (l) => `${machine.name} ${l === 'fr' ? 'tourne sous' : 'runs'} ${machine.os}. ${machine.specs.map((s) => `${s.key}: ${s.value}`).join('; ')}.`,
        ),
        target: `hardware ${machine.category}`,
      }),
    ),
    {
      id: 'music',
      kind: 'music',
      title: { en: 'Music', fr: 'Musique' },
      text: map((l) => `${flat(music.blurb[l])} Genres: ${music.genres.join(', ')}. Tools: ${music.tools.join(', ')}.`),
      target: '/#music',
    },
    {
      id: 'gaming',
      kind: 'gaming',
      title: { en: 'Gaming', fr: 'Jeux vidéo' },
      text: map(
        (l) =>
          `${flat(gaming.blurb[l])} Genres: ${gaming.genres.join(', ')}. ${gaming.fallbackGames.map((g) => `${g.name} (${g.status[l]})`).join(', ')}.`,
      ),
      target: '/#gaming',
    },
    {
      id: 'tools',
      kind: 'tools',
      title: { en: 'The tools', fr: 'Les outils' },
      text: map((l) =>
        flat(
          toolInfo
            .filter((tool) => tool.tier !== 'admin')
            .map((tool) => `${tool.name[l]}: ${tool.description[l]}`)
            .join('. '),
        ),
      ),
      target: '/tools',
    },
    ...labNodes.map(
      (node): Passage => ({
        id: `lab-${node.id}`,
        kind: 'lab',
        title: map((l) => `${node.name}${l === 'fr' ? ', dans le labo' : ', in the lab'}`),
        text: map((l) =>
          flat(
            [
              `${node.name}: ${node.role[l]}.`,
              ...(node.on ? [`${l === 'fr' ? 'Tourne sur' : 'Runs on'} ${node.on}.`] : []),
              ...(node.stack.length ? [`Stack: ${node.stack.join(', ')}.`] : []),
              ...(node.why ? [node.why[l]] : []),
            ].join(' '),
          ),
        ),
        target: '/lab',
      }),
    ),
  ]
  return { version: CORPUS_VERSION, generatedAt, passages }
}

export function corpusPlugin(): Plugin {
  return {
    name: 'couvbat-corpus',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'corpus.json', source: JSON.stringify(buildCorpus()) })
    },
    // Rebuilt per request in dev, so a local backend's `ask` reads the edited content.
    configureServer(server) {
      server.middlewares.use('/corpus.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(buildCorpus()))
      })
    },
  }
}
