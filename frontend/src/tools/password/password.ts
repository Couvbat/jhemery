/**
 * Passwords and passphrases from `crypto.getRandomValues`. The random source is a
 * parameter so the composition rules can be tested deterministically; the default is
 * the only one the panel ever uses.
 */

/** An integer in `[0, max)`. */
export type Random = (max: number) => number

/** Rejection sampling over a 32-bit draw, so `max` values that do not divide 2^32 are
 *  not biased toward the low end the way `random() % max` would be. */
export const secureRandom: Random = (max) => {
  if (max <= 0) return 0
  const limit = Math.floor(0x100000000 / max) * max
  const buffer = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buffer)
    const value = buffer[0]!
    if (value < limit) return value % max
  }
}

export interface PasswordOptions {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  /** Drop `l I 1 O 0 o`, the characters that read alike in most fonts. */
  ambiguous: boolean
}

const CLASSES = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?',
} as const

const AMBIGUOUS = /[lI1O0o]/g

/** The character classes the options switch on, with ambiguity already applied. */
export function classesFor(options: PasswordOptions): string[] {
  const chosen: string[] = []
  for (const key of ['lower', 'upper', 'digits', 'symbols'] as const) {
    if (!options[key]) continue
    const chars = options.ambiguous ? CLASSES[key] : CLASSES[key].replace(AMBIGUOUS, '')
    if (chars) chosen.push(chars)
  }
  return chosen
}

export function poolSize(options: PasswordOptions): number {
  return classesFor(options).reduce((sum, chars) => sum + chars.length, 0)
}

function shuffle<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = random(i + 1)
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}

/**
 * One character from every chosen class first, the rest from the union, then a
 * shuffle so the guaranteed ones are not always at the front. Returns `''` when no
 * class is chosen or the length is shorter than the number of classes.
 */
export function generatePassword(options: PasswordOptions, random: Random = secureRandom): string {
  const classes = classesFor(options)
  if (!classes.length || options.length < classes.length) return ''
  const pool = classes.join('')
  const chars = classes.map((cls) => cls[random(cls.length)]!)
  while (chars.length < options.length) chars.push(pool[random(pool.length)]!)
  return shuffle(chars, random).join('')
}

export interface PassphraseOptions {
  count: number
  separator: string
  capitalise: boolean
  /** Append one digit to a random word, for the sites that insist. */
  number: boolean
}

export function generatePassphrase(
  words: readonly string[],
  options: PassphraseOptions,
  random: Random = secureRandom,
): string {
  if (!words.length || options.count < 1) return ''
  const picked = Array.from({ length: options.count }, () => words[random(words.length)]!).map((w) =>
    options.capitalise ? w.charAt(0).toUpperCase() + w.slice(1) : w,
  )
  if (options.number) {
    const at = random(picked.length)
    picked[at] = `${picked[at]}${random(10)}`
  }
  return picked.join(options.separator)
}

/** Bits of entropy for `length` independent draws from a pool of `poolSize`. */
export function entropyBits(poolSize: number, length: number): number {
  if (poolSize <= 1 || length <= 0) return 0
  return length * Math.log2(poolSize)
}

export type Strength = 'weak' | 'fair' | 'strong' | 'excellent'

/** Rough, deliberately: 40 bits falls to a GPU in hours, 64 is out of reach for anyone
 *  but a state, 96 is out of reach full stop. */
export function strength(bits: number): Strength {
  if (bits < 40) return 'weak'
  if (bits < 64) return 'fair'
  if (bits < 96) return 'strong'
  return 'excellent'
}
