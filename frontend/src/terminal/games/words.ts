/**
 * Word lists for `wordle`, `hangman` and `wpm`.
 *
 * The lists themselves are **generated**, not written — see
 * `scripts/build-wordlists.mjs` for the sources and the filtering, and the
 * header of each file under `data/` for its licence. This module is the API
 * over them.
 *
 * **Why they are loaded dynamically.** The two `data/` files are ~140 kB of
 * source between them. Bundled into the main chunk they would be a third of the
 * page's whole transfer budget, paid by every visitor at first paint —
 * including the ones who never open the terminal, which is most of them. So
 * they are behind `import()`, giving each locale its own chunk fetched the
 * first time someone runs a word game. Same reasoning as `ThreeBackground`, and
 * the same reason the API is async all the way up.
 *
 * **Why they are not in `src/content/`.** That layer is the single source of
 * truth for *site copy*, and it is imported by `vite.config.ts` and the résumé
 * plugin outside the app's module graph — a dictionary there would be parsed by
 * every `resume.txt` build and would invite reading "anything without a DOM
 * dependency belongs in content/" into the precedent.
 *
 * French words are stored spelled properly, accents included, and compared
 * folded: correct on display, forgiving on input.
 */

import type { Locale } from '@/content/types'

export interface WordleWords {
  /** Words a wordle may pick as the answer, spelled properly. */
  answers: string[]
  /** Everything a guess may be, folded. */
  accepted: Set<string>
}

/**
 * Uppercase and strip diacritics, so `épée` and `EPEE` are the same word. NFD
 * splits an accented letter into base + combining mark, and the replaced range
 * is exactly the combining-marks block — which is why this handles every accent
 * French uses without listing any of them.
 *
 * Stays synchronous and outside the lazy chunk: it is pure string work that the
 * games need on every keystroke.
 */
export function fold(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/** Written out per locale rather than built from a template string, because
 *  Vite can only split a chunk per `import()` it can see statically. */
const LOADERS: Record<Locale, () => Promise<typeof import('./data/words-en')>> = {
  en: () => import('./data/words-en'),
  fr: () => import('./data/words-fr'),
}

/** One in-flight promise per locale: a visitor who runs `wordle`, quits and
 *  runs it again should not fetch the chunk twice. */
const pending: Partial<Record<Locale, Promise<typeof import('./data/words-en')>>> = {}

function load(locale: Locale) {
  return (pending[locale] ??= LOADERS[locale]())
}

export async function loadWordleWords(locale: Locale): Promise<WordleWords> {
  const data = await load(locale)
  return {
    answers: data.ANSWERS.split(' '),
    accepted: new Set(data.ACCEPTED.split(' ')),
  }
}

/** Common words the typing test builds its lines from. */
export async function loadTypingWords(locale: Locale): Promise<string[]> {
  return (await load(locale)).TYPING.split(' ')
}
