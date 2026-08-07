/**
 * Regenerates the word lists under `src/terminal/games/data/`.
 *
 *   npm run wordlists
 *
 * **Run by hand, output committed.** The build must stay reproducible offline,
 * and CI must not depend on tatoeba.org being up — so this is not a vite plugin
 * and is not wired into `npm run build`. Same posture as any generated asset:
 * the script is the recipe, the committed file is the artefact.
 *
 * Sources, all permissive (see the header each generated file carries):
 *
 *   English   wordlist-english            MIT       SCOWL, size-graded
 *   French    an-array-of-french-words    MIT       ~336k words, accents intact
 *   French    dictionary-fr               MPL-2.0   Grammalecte/Dicollecte hunspell
 *   French    Tatoeba sentence export     CC BY 2.0 FR
 *
 * Why each is needed:
 *
 * SCOWL is *size-graded* (10/20/35/…/70), and that grading is exactly the
 * common-vs-wide split the games want, so English needs nothing else. French has
 * no equivalent, so it is assembled from three: the MIT array gives membership
 * (is this a word?), the hunspell dictionary gives lemmas (is this a headword,
 * or a conjugated form nobody should have to guess?), and Tatoeba gives
 * frequency (is it common enough to be fair?). Drop any one of the three and the
 * answer pool fills with either conjugations or obscurities.
 */

import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import bz2 from 'unbzip2-stream'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, '..', 'src', 'terminal', 'games', 'data')
const CACHE = join(here, '..', '.wordlist-cache')

/* ----------------------------------------------------------------- tuning */

/** Five-letter words a wordle may pick as the answer. */
const WORDLE_LENGTH = 5
/** SCOWL size that counts as "common" — the English answer pool. */
const EN_ANSWER_SIZE = 35
/** SCOWL size that counts as "a real word" — the English accepted-guess pool. */
const EN_ACCEPTED_SIZE = 70
/** SCOWL size for the typing test's word pool. Tighter than the wordle tiers on
 *  purpose: a typing test wants words you can type without stopping to read
 *  them, and size 20 already runs to ~9000. */
const EN_TYPING_SIZE = 10
/** Tatoeba occurrences a French word needs to be a fair wordle answer. */
const FR_ANSWER_MIN_FREQ = 10
/** …and to be worth typing in the typing test. */
const FR_TYPING_MIN_FREQ = 200
/** Typing-test words are kept to a comfortable span; a 14-letter word is a
 *  memory test rather than a typing one. */
const TYPING_MIN_LENGTH = 2
const TYPING_MAX_LENGTH = 9

const SCOWL_SIZES = [10, 20, 35, 40, 50, 55, 60, 70]

/* ---------------------------------------------------------------- helpers */

/** Same rule as `words.ts`: NFD, drop combining marks, uppercase. */
const fold = (word) =>
  word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()

const unique = (values) => [...new Set(values)]

/** Letters only — no hyphens, apostrophes, digits or capitals (proper nouns). */
const isPlainWord = (word) => /^[a-zà-ÿœæ]+$/.test(word)

async function download(url, name) {
  const path = join(CACHE, name)
  try {
    return await readFile(path, 'utf8')
  } catch {
    // Not cached yet.
  }

  console.log(`  fetching ${url}`)
  await mkdir(CACHE, { recursive: true })

  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`)

  // Tatoeba ships bzip2 only, which node:zlib cannot read — hence the one
  // dependency this script has that the app does not.
  await pipeline(response.body, bz2(), createWriteStream(path))
  return readFile(path, 'utf8')
}

/* ---------------------------------------------------------------- english */

function scowlUpTo(size) {
  const words = []
  for (const step of SCOWL_SIZES.filter((s) => s <= size)) {
    // Both spellings: the site is British, but a visitor typing `color` should
    // not be told it is not a word.
    for (const variant of ['english', 'british', 'american']) {
      words.push(...require(`wordlist-english/${variant}-words-${step}.json`))
    }
  }
  return words.filter(isPlainWord)
}

function buildEnglish() {
  // Answers are uppercased (see `emit`); the typing pool is not, because you
  // type it as written.
  const answers = unique(
    scowlUpTo(EN_ANSWER_SIZE)
      .filter((w) => w.length === WORDLE_LENGTH)
      .map((w) => w.toUpperCase()),
  ).sort()
  const accepted = unique(
    scowlUpTo(EN_ACCEPTED_SIZE)
      .filter((w) => w.length === WORDLE_LENGTH)
      .map(fold),
  ).sort()
  const typing = unique(
    scowlUpTo(EN_TYPING_SIZE).filter(
      (w) => w.length >= TYPING_MIN_LENGTH && w.length <= TYPING_MAX_LENGTH,
    ),
  ).sort()

  return { answers, accepted, typing }
}

/* ----------------------------------------------------------------- french */

/**
 * Tokenises French, apostrophes included.
 *
 * Naive splitting turns `qu'il` into `qu` + `il`, which puts `qu` in the top
 * thirty words by frequency and would have the typing test asking people to
 * type a word fragment. So an elided article or conjunction is dropped and the
 * word it attaches to is counted instead.
 */
const ELISION = /^(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu|quoiqu)['’](.+)$/

function* tokenise(text) {
  for (const raw of text.toLowerCase().match(/[a-zà-ÿœ]+(?:['’][a-zà-ÿœ]+)*/g) ?? []) {
    const elided = ELISION.exec(raw)
    const word = elided ? elided[1] : raw
    // Anything still carrying an apostrophe is a compound we do not want.
    if (isPlainWord(word)) yield word
  }
}

async function buildFrench() {
  const sentences = await download(
    'https://downloads.tatoeba.org/exports/per_language/fra/fra_sentences.tsv.bz2',
    'fra_sentences.tsv',
  )

  const frequency = new Map()
  for (const line of sentences.split('\n')) {
    const text = line.split('\t')[2]
    if (!text) continue
    for (const word of tokenise(text)) frequency.set(word, (frequency.get(word) ?? 0) + 1)
  }

  // Hunspell stores `headword/FLAGS`; the headword is the lemma. The path is
  // built rather than `require.resolve`d because the package's `exports` map
  // does not expose the raw `.dic`.
  const dic = await readFile(
    join(here, '..', 'node_modules', 'dictionary-fr', 'index.dic'),
    'utf8',
  )
  const lemmas = new Set(
    dic
      .split('\n')
      .slice(1)
      .map((line) => line.split('/')[0].trim())
      .filter(Boolean),
  )

  const all = require('an-array-of-french-words')
  const fiveLetter = all.filter((w) => isPlainWord(w) && fold(w).length === WORDLE_LENGTH)

  // Accents are kept on answers (they are displayed) and folded off accepted
  // guesses (they are typed).
  //
  // Deduplicating by *folded* form matters: `cote` and `côté` are two entries
  // but one puzzle, since a guess is compared folded. Seventeen such pairs exist
  // in this list. The more frequent spelling wins, so the reveal shows `côté`
  // rather than the rarer `cote`.
  const byFolded = new Map()
  for (const word of fiveLetter) {
    if (!lemmas.has(word)) continue
    const count = frequency.get(word) ?? 0
    if (count < FR_ANSWER_MIN_FREQ) continue

    const key = fold(word)
    const held = byFolded.get(key)
    if (!held || count > held.count) byFolded.set(key, { word, count })
  }
  // Uppercased, accents kept: the grid, the reveal and the guessed-letter row
  // all render in caps, and a lowercase `display` showed up as `_ _ a _ s` next
  // to an uppercase `E` in hangman.
  const answers = [...byFolded.values()].map((entry) => entry.word.toUpperCase()).sort()
  const accepted = unique(fiveLetter.map(fold)).sort()

  const typing = unique(
    [...frequency.entries()]
      .filter(
        ([word, count]) =>
          count >= FR_TYPING_MIN_FREQ &&
          lemmas.has(word) &&
          word.length >= TYPING_MIN_LENGTH &&
          word.length <= TYPING_MAX_LENGTH,
      )
      .map(([word]) => word),
  ).sort()

  return { answers, accepted, typing }
}

/* ------------------------------------------------------------------ emit */

const HEADERS = {
  en: `Generated from SCOWL by way of the \`wordlist-english\` package, which is
 * distributed under the MIT licence. SCOWL itself is assembled from sources
 * under BSD-compatible terms and released under an MIT-like licence.
 *
 *   https://github.com/en-wl/wordlist`,
  fr: `Generated from three sources, each under its own licence:
 *
 *   an-array-of-french-words  MIT                — word membership
 *   https://github.com/words/an-array-of-french-words
 *
 *   dictionary-fr             MPL-2.0            — lemmas, © Olivier R. et al.
 *   https://grammalecte.net/                       (Grammalecte / Dicollecte)
 *   MPL-2.0 §3.2: the Source Code Form of this file is available at the
 *   repository URL below.
 *
 *   Tatoeba sentence export   CC BY 2.0 FR       — word frequency
 *   https://tatoeba.org/                           © Tatoeba contributors
 *
 * MPL-2.0 is file-level copyleft: this generated file inherits it, and must
 * keep this notice. It does not affect the rest of the project.`,
}

/**
 * Words are emitted as one space-delimited string rather than an array literal,
 * which drops two characters of quoting and punctuation per word — about a
 * third of the file across ~7000 of them.
 *
 * The header is a `/*!` bang comment carrying `@license`, which is what marks it
 * a *legal comment* to esbuild, terser and rolldown alike. A plain `/**` block
 * is stripped from the production bundle, and these licences all require their
 * notice to survive into the copy that is actually distributed — which for a
 * website is `dist/`, not the repository. `THIRD-PARTY.md` covers the same
 * ground for a reader; this covers it for the artefact.
 */
function emit(locale, { answers, accepted, typing }) {
  return `/*!
 * @license
 * GENERATED FILE — do not edit by hand.
 * Regenerate with \`npm run wordlists\` (see \`scripts/build-wordlists.mjs\`).
 *
 * ${HEADERS[locale]}
 *
 * Source form of this file: https://github.com/Couvbat/jhemery
 */

/** Words a wordle may pick as the answer, spelled properly.
 *  Annotated \`: string\` so the two locales' modules stay the same type — without
 *  it each infers its own string *literal* type and they stop being swappable. */
export const ANSWERS: string =
  '${answers.join(' ')}'

/** Everything a guess may be, folded (no accents) — see \`words.ts\`. */
export const ACCEPTED: string =
  '${accepted.join(' ')}'

/** Common words the typing test builds its lines from. */
export const TYPING: string =
  '${typing.join(' ')}'
`
}

/* ------------------------------------------------------------------ main */

console.log('building word lists…')

const english = buildEnglish()
console.log(
  `  en  answers ${english.answers.length}  accepted ${english.accepted.length}  typing ${english.typing.length}`,
)

const french = await buildFrench()
console.log(
  `  fr  answers ${french.answers.length}  accepted ${french.accepted.length}  typing ${french.typing.length}`,
)

// Every answer must be a legal guess, or a player can lose to a word the game
// would have refused them.
for (const [locale, list] of [
  ['en', english],
  ['fr', french],
]) {
  const accepted = new Set(list.accepted)
  const orphans = list.answers.filter((word) => !accepted.has(fold(word)))
  if (orphans.length) throw new Error(`${locale}: ${orphans.length} answers are not accepted guesses`)
}

await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'words-en.ts'), emit('en', english))
await writeFile(join(OUT, 'words-fr.ts'), emit('fr', french))

console.log(`written to ${OUT}`)
