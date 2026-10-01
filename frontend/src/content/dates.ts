import type { Locale, Localised } from './types'

/**
 * The content layer's date maths, in one place: `/now`'s age and the résumé's
 * durations. Everything is UTC and nothing reads the clock itself — the caller passes
 * `at` — so the build-time renderers and the specs get the same answer.
 */

/** Whole days between `updated` (a `YYYY-MM-DD` date, read as UTC) and `at`. */
export function daysSince(updated: string, at: Date): number {
  const then = Date.parse(`${updated}T00:00:00Z`)
  return Math.max(0, Math.floor((at.getTime() - then) / 86_400_000))
}

/** A `YYYY-MM` month as a running month count, so two can be subtracted. */
function monthIndex(month: string): number {
  const [year, m] = month.split('-').map(Number)
  return year! * 12 + (m! - 1)
}

/**
 * How many months a span covers, counting both its first and its last month: May to
 * November is seven. That is LinkedIn's rule, and using it means the CV and the
 * LinkedIn profile never disagree about the same job. An `end` left out means the
 * span is still running at `at`; a span that hasn't started yet covers nothing.
 */
export function monthsBetween(start: string, end: string | undefined, at: Date): number {
  const last = end ? monthIndex(end) : at.getUTCFullYear() * 12 + at.getUTCMonth()
  const first = monthIndex(start)
  return last < first ? 0 : last - first + 1
}

/** `7 months`, then whole years once there is one: `3 years`, never `2.9`. */
export function durationLabel(start: string, end: string | undefined, at: Date): Localised {
  const months = monthsBetween(start, end, at)
  if (months < 12) {
    return { en: `${months} month${months === 1 ? '' : 's'}`, fr: `${months} mois` }
  }
  const years = Math.floor(months / 12)
  return { en: `${years} year${years === 1 ? '' : 's'}`, fr: `${years} an${years === 1 ? '' : 's'}` }
}

// A table rather than `toLocaleDateString`, whose abbreviations vary with the ICU
// data Node and each browser ship.
const MONTHS: Record<Locale, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
}

function monthLabel(month: string, locale: Locale): string {
  const [year, m] = month.split('-')
  return `${MONTHS[locale][Number(m) - 1]} ${year}`
}

/** `Nov 2023 – present`, `May 2023 – Nov 2023`. */
export function periodLabel(start: string, end: string | undefined): Localised {
  const span = (locale: Locale, current: string) =>
    `${monthLabel(start, locale)} – ${end ? monthLabel(end, locale) : current}`
  return { en: span('en', 'present'), fr: span('fr', 'aujourd’hui') }
}

/** `2021 – 2022`, or one year when the span starts and ends in it. */
export function yearSpan(start: string, end: string): string {
  const [from, to] = [start.slice(0, 4), end.slice(0, 4)]
  return from === to ? from : `${from} – ${to}`
}
