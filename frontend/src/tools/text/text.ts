/**
 * Counting and re-casing text. Word boundaries are Unicode-aware, so `l'été` is two
 * words and `état-major` one, and counts do not fall apart on accents.
 */

export interface TextStats {
  characters: number
  charactersNoSpaces: number
  words: number
  lines: number
  sentences: number
  paragraphs: number
  /** UTF-8, which is what the wire and the disk count. */
  bytes: number
  /** At a silent-reading pace of 200 words a minute. */
  readingSeconds: number
  /** At a speaking pace of 130 words a minute. */
  speakingSeconds: number
}

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*(?:-[\p{L}\p{N}]+)*/gu

export function words(text: string): string[] {
  return text.match(WORD) ?? []
}

export function textStats(text: string): TextStats {
  const count = words(text).length
  return {
    characters: [...text].length,
    charactersNoSpaces: [...text.replace(/\s/g, '')].length,
    words: count,
    lines: text ? text.split('\n').length : 0,
    sentences: text.split(/[.!?…]+(?:\s|$)/).filter((s) => s.trim()).length,
    paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
    bytes: new TextEncoder().encode(text).length,
    readingSeconds: Math.round((count / 200) * 60),
    speakingSeconds: Math.round((count / 130) * 60),
  }
}

export type CaseMode =
  | 'upper'
  | 'lower'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'slug'

export const CASE_MODES: CaseMode[] = [
  'upper',
  'lower',
  'title',
  'sentence',
  'camel',
  'pascal',
  'snake',
  'kebab',
  'constant',
  'slug',
]

/** Strips diacritics: `é` → `e`. Same NFD trick the word games use. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Tokens for the programmer cases: splits on anything that is not a letter or digit,
 *  and on the lower→upper boundary inside `camelCase`, so identifiers convert too. */
function tokens(text: string): string[] {
  return text
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
}

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

export function transformCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return text.toUpperCase()
    case 'lower':
      return text.toLowerCase()
    case 'title':
      // Not after apostrophes: `c'est` and `don't` are one word each, and `C'Est` is
      // what every naive title-caser gets wrong.
      return text
        .toLowerCase()
        .replace(/(^|[\s\-(])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase())
    case 'sentence':
      return text.toLowerCase().replace(/(^\s*|[.!?…]\s+)(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase())
    case 'camel':
      return tokens(text)
        .map((t, i) => (i ? capitalise(t) : t))
        .join('')
    case 'pascal':
      return tokens(text).map(capitalise).join('')
    case 'snake':
      return tokens(text).join('_')
    case 'kebab':
      return tokens(text).join('-')
    case 'constant':
      return tokens(text).join('_').toUpperCase()
    case 'slug':
      return tokens(fold(text)).join('-')
  }
}

/** The most frequent words, case-folded, ties broken by first appearance. */
export function wordFrequency(text: string, limit = 10): { word: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const word of words(text)) {
    const key = word.toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
