import { pick, type Locale } from '@/content/types'
import { messages } from '@/i18n/messages'
import type { GuestbookEntry } from '@/lib/api'

/**
 * The guestbook's newest entries as wireframes in the field, as pure functions so they can
 * be tested without WebGL (as `ripple.ts` and `palette.ts` are). `ThreeBackground` owns the
 * meshes; this decides which entries get one, what each looks like and where it sits, and
 * what a click on it says. The entries are the ones the ticker's own poll already fetched
 * (`useGuestbookTicker`), so the field asks the API for nothing.
 */

/**
 * How many of the newest entries get a shape. A pool of its own beside the visitors' and
 * `spawn`'s, the same size as the visitors', so a busy guestbook can neither bury the scene
 * nor change what `spawn` and `scene reset` mean.
 */
export const MAX_SIGNATURE_SHAPES = 12

/**
 * The entries the field draws: the newest `max`, newest first. The backend already sends
 * its page newest first, but sorting again costs nothing at this size and makes "newest" a
 * fact about the dates rather than about the order a store happened to answer in. An id
 * seen twice is drawn once.
 */
export function newestSignatures(
  entries: readonly GuestbookEntry[],
  max = MAX_SIGNATURE_SHAPES,
): GuestbookEntry[] {
  const seen = new Set<string>()
  const unique = entries.filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
  const time = (entry: GuestbookEntry) => Date.parse(entry.date) || 0
  return unique.sort((a, b) => time(b) - time(a)).slice(0, max)
}

/**
 * A generator seeded from a string: FNV-1a folds the string to 32 bits, as the daily
 * wordle's index does, and mulberry32 spreads that seed over as many draws as a shape
 * needs. The same id gives the same numbers in every engine, which nothing seeded from
 * `Math.random` can.
 */
export function seededRandom(seed: string): () => number {
  let state = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 0x01000193) >>> 0
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}

export interface Axes {
  x: number
  y: number
  z: number
}

/** Everything about a new shape that isn't its colour. */
export interface ShapeLayout {
  /** An index into the field's list of kinds. */
  kind: number
  /** Opacity before the weather and the day scale it. */
  baseOpacity: number
  /** Where in the spawn volume, each axis from -0.5 to 0.5 across it; the field scales it
   *  by its own size, which follows the screen's. */
  place: Axes
  rotation: Axes
  /** Radians per reference frame, before the field's speed multipliers. */
  speed: Axes
}

/**
 * One shape's layout, drawn from `random`. Every shape in the field comes from here: with
 * `Math.random` for `spawn`'s and the visitors', with `seededRandom(id)` for a signature's.
 * So a signature is the same shape in the same place on every visit and every screen,
 * and still a shape the ordinary distribution could have produced.
 */
export function shapeLayout(random: () => number, kinds: number): ShapeLayout {
  return {
    kind: Math.min(kinds - 1, Math.floor(random() * kinds)),
    baseOpacity: 0.15 + random() * 0.25,
    place: { x: random() - 0.5, y: random() - 0.5, z: random() - 0.5 },
    rotation: { x: random() * Math.PI, y: random() * Math.PI, z: random() * Math.PI },
    speed: {
      x: (random() - 0.5) * 0.006,
      y: (random() - 0.5) * 0.006,
      z: (random() - 0.5) * 0.004,
    },
  }
}

/**
 * The day an entry was signed, on the visitor's own calendar and in their language
 * (`1 August 2026`, `1 août 2026`). Long month names, because the abbreviations are what
 * vary between ICU builds (`content/dates.ts`). A date the backend never writes is shown
 * as it came rather than as "Invalid Date".
 */
export function signatureDay(date: string, locale: Locale): string {
  const at = new Date(date)
  if (Number.isNaN(at.getTime())) return date.slice(0, 10)
  return at.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * What a click on a signature's shape says: the kind, then who signed and when. Never the
 * message, which can run to 280 characters; `guestbook` and `cat` are where that is read.
 * One pass over the template with a replacer function, because the name is a stranger's
 * text: a `$&` in it must stay a `$&`, and a `{date}` in it must not be filled in.
 */
export function signatureLabel(
  kind: string,
  signature: Pick<GuestbookEntry, 'name' | 'date'>,
  locale: Locale,
): string {
  const day = signatureDay(signature.date, locale)
  const signed = pick(messages.scene.signature, locale).replace(/\{(name|date)\}/g, (_, key: string) =>
    key === 'name' ? signature.name : day,
  )
  return `${kind} · ${signed}`
}
