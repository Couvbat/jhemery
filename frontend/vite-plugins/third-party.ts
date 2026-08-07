import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * Emits `THIRD-PARTY.txt` — the licence notices for everything that ends up in
 * the bundle.
 *
 * **Why this is generated rather than written.** It was written by hand first,
 * and was wrong within the hour: SCOWL's copyright dated 2000-2019 instead of
 * 2000-2016, `an-array-of-french-words` credited to the wrong author, and
 * `wordlist-english`'s own MIT copyright omitted entirely. A notice file is a
 * transcription job, and transcription is exactly what should not be done by
 * hand — every dependency bump is a chance to silently drift out of date.
 *
 * So the licence text is copied **verbatim** out of `node_modules` at build
 * time. Same reasoning as `resume.ts` next door: one source, refreshed on every
 * deploy, no committed artefact to fall behind.
 *
 * **Why it exists at all.** MIT, MPL-2.0 and CC BY all require their notice to
 * accompany the copy that is distributed. For a website that copy is `dist/`,
 * not the repository — so a notice living only in `README.md` does not
 * discharge it. It cannot be a bundler banner either: Vite 8 discards
 * `output.banner`, and `legalComments: 'inline'` does not survive module
 * concatenation. Both were tried. A sidecar file in the same distribution is
 * the ordinary answer, and is what LicenseWebpackPlugin emits for the same
 * reason.
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const modules = join(root, 'node_modules')

const WIDTH = 79
const rule = (char = '-') => char.repeat(WIDTH)

/** Filenames npm packages conventionally use for their licence text. */
const LICENCE_FILES = /^(licen[cs]e|copying|copyright|notice)(\.(md|txt))?$/i

/**
 * Packages whose data the word lists are built from. These are `devDependencies`
 * — they never reach the browser themselves — but their *content* does, baked
 * into `src/terminal/games/data/`, so they need notices exactly as much as a
 * runtime dependency does. `scripts/build-wordlists.mjs` is the consumer.
 */
const DATA_SOURCES = [
  { name: 'wordlist-english', used: 'English word lists (SCOWL)' },
  { name: 'an-array-of-french-words', used: 'French word membership' },
  { name: 'dictionary-fr', used: 'French lemmas' },
]

/** Not an npm package, so its notice is the one thing here still written out. */
const TATOEBA = `${rule('-')}
Tatoeba  —  https://tatoeba.org/
Used for: French word frequency, deciding which words are common enough to be
          fair wordle answers and worth typing in the typing test
Licence:  Creative Commons Attribution 2.0 France (CC BY 2.0 FR)
          https://creativecommons.org/licenses/by/2.0/fr/
${rule('-')}

  Sentence data (c) Tatoeba contributors, released under CC BY 2.0 FR.
  Some sentences are additionally available under CC0 1.0.

The French word frequencies used by this site are derived from the Tatoeba
French sentence export. No Tatoeba sentence text is reproduced here — only
counts drawn from it, used to rank words.
`

/** MPL-2.0 obliges the distributor to say where the Source Code Form is. */
const MPL_SOURCE_NOTICE = `${rule('=')}
MOZILLA PUBLIC LICENSE 2.0 — SECTION 3.2 (SOURCE CODE FORM)
${rule('=')}

The French lemma data above is MPL-2.0. It is baked into
\`frontend/src/terminal/games/data/words-fr.ts\`, which is therefore treated as
Covered Software and inherits the MPL; the deployed \`assets/words-fr-*.js\` is
an Executable Form of it.

Its Source Code Form is available at no charge in the repository below, along
with \`frontend/scripts/build-wordlists.mjs\`, the script that generates it.

MPL-2.0 is file-level copyleft. No other part of this project is affected —
the rest of the source is MIT (see LICENSE).
`

interface Package {
  name: string
  version: string
  licence: string
  text: string | null
  publisher: string | null
}

function readLicenceText(dir: string): string | null {
  if (!existsSync(dir)) return null
  const file = readdirSync(dir).find((f) => LICENCE_FILES.test(f))
  if (!file) return null
  try {
    return readFileSync(join(dir, file), 'utf8').trim()
  } catch {
    return null
  }
}

function readPackage(name: string): Package | null {
  const dir = join(modules, name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) return null

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const author = manifest.author
  const publisher = typeof author === 'string' ? author : (author?.name ?? null)

  return {
    name,
    version: manifest.version ?? '?',
    licence:
      typeof manifest.license === 'string'
        ? manifest.license
        : (manifest.license?.type ?? manifest.licenses?.[0]?.type ?? 'see text'),
    text: readLicenceText(dir),
    publisher,
  }
}

/**
 * Every package that can end up in the bundle: the production dependency tree,
 * transitive included. `npm ls` rather than a walk of `node_modules`, so
 * devDependencies and their subtrees stay out — this file should list what is
 * shipped, not what is installed.
 */
function productionPackages(): string[] {
  try {
    const json = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    const names = new Set<string>()
    const walk = (node: Record<string, { dependencies?: Record<string, unknown> }>) => {
      for (const [name, child] of Object.entries(node ?? {})) {
        names.add(name)
        walk((child?.dependencies ?? {}) as Parameters<typeof walk>[0])
      }
    }
    walk(JSON.parse(json).dependencies ?? {})
    return [...names].sort()
  } catch {
    // `npm ls` exits non-zero on any tree problem, and a missing notice file is
    // not a reason to fail a build. The header below says what happened.
    return []
  }
}

function renderPackage(pkg: Package, used?: string): string {
  const head = [
    rule(),
    `${pkg.name}@${pkg.version}`,
    used ? `Used for: ${used}` : null,
    pkg.publisher ? `Publisher: ${pkg.publisher}` : null,
    `Licence:  ${pkg.licence}`,
    rule(),
  ]
    .filter(Boolean)
    .join('\n')

  const body =
    pkg.text ??
    `  No licence file is distributed with this package. Its manifest declares\n` +
      `  ${pkg.licence}. See https://www.npmjs.com/package/${pkg.name}`

  return `${head}\n\n${body}\n`
}

export function buildNotices(): string {
  const dataSources = DATA_SOURCES.map(({ name, used }) => {
    const pkg = readPackage(name)
    return pkg ? renderPackage(pkg, used) : `${rule()}\n${name} — not installed; run npm install\n`
  })

  const runtime = productionPackages()
    .map((name) => readPackage(name))
    .filter((pkg): pkg is Package => pkg !== null)
    .map((pkg) => renderPackage(pkg))

  return [
    rule('='),
    'THIRD-PARTY NOTICES',
    'jhemery.xyz — https://github.com/Couvbat/jhemery',
    rule('='),
    '',
    'This file ships with the built site and is served at /THIRD-PARTY.txt, because',
    'the licences below require their notices to accompany the copy that is actually',
    'distributed rather than only the source repository.',
    '',
    'It is generated at build time from the installed packages, verbatim — see',
    'frontend/vite-plugins/third-party.ts. Do not edit it by hand.',
    '',
    'The site’s own source code is MIT; see LICENSE in the repository. The personal',
    'content (biography, photographs, project write-ups, résumé text) is not',
    'licensed for reuse.',
    '',
    '',
    rule('='),
    'PART 1 — WORD LIST DATA SOURCES',
    rule('='),
    '',
    'The terminal’s wordle, hangman and wpm games use generated word lists shipped',
    'as assets/words-en-*.js and assets/words-fr-*.js. These packages are build-time',
    'dependencies whose *data* is baked into them.',
    '',
    ...dataSources,
    TATOEBA,
    '',
    MPL_SOURCE_NOTICE,
    '',
    rule('='),
    `PART 2 — RUNTIME DEPENDENCIES (${runtime.length} packages)`,
    rule('='),
    '',
    'The production dependency tree, transitive dependencies included. Not every',
    'one of these reaches the browser — tree-shaking removes a good deal — but',
    'listing the whole tree is the honest over-approximation.',
    '',
    ...runtime,
  ].join('\n')
}

export function thirdPartyPlugin(): Plugin {
  return {
    name: 'couvbat-third-party',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY.txt', source: buildNotices() })
    },
    // The emitted asset only exists after a build; serve it in dev too, so the
    // link in llms.txt is not dead on localhost.
    configureServer(server) {
      server.middlewares.use('/THIRD-PARTY.txt', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(buildNotices())
      })
    },
  }
}
