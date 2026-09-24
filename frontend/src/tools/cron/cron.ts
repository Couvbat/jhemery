/**
 * Five-field cron expressions: parsed, described in a sentence in either language,
 * and walked forward to their next runs. Own parser rather than a package — the
 * grammar is small (ranges, steps, lists, month and weekday names, the `@` macros),
 * and a description that only exists in English would be half a tool on this site.
 *
 * Semantics are Vixie cron's, which is what nearly every crontab runs: `7` is Sunday
 * as well as `0`, and when both day fields are restricted a day matches if *either*
 * does — `0 0 1 * 1` is midnight on the 1st *and* every Monday, not Mondays that fall
 * on the 1st. "Restricted" means "does not start with `*`", again as Vixie reads it.
 */

import type { Locale } from '@/content/types'

export type FieldName = 'minute' | 'hour' | 'day' | 'month' | 'weekday'
export const FIELD_NAMES: FieldName[] = ['minute', 'hour', 'day', 'month', 'weekday']

interface FieldSpec {
  min: number
  max: number
  names?: string[]
}

const SPECS: Record<FieldName, FieldSpec> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  day: { min: 1, max: 31 },
  month: { min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] },
  weekday: { min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] },
}

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

/** One comma-separated item: a value, a range, either with a step, or `*`. */
export interface Part {
  start: number
  end: number
  step: number
  star: boolean
}

export interface Field {
  values: Set<number>
  parts: Part[]
  /** The field starts with `*` — Vixie's test for "unrestricted" (see the header). */
  star: boolean
}

export type Schedule = Record<FieldName, Field>

export type CronError =
  | { reason: 'count'; count: number }
  | { reason: 'reboot' }
  | { reason: 'syntax' | 'range' | 'step'; field: FieldName; token: string }

export type CronResult = { ok: true; schedule: Schedule } | ({ ok: false } & CronError)

function value(token: string, spec: FieldSpec): number | null {
  if (/^\d+$/.test(token)) return Number(token)
  const index = spec.names?.indexOf(token.toUpperCase()) ?? -1
  if (index < 0) return null
  // Months are named from 1, weekdays from 0.
  return spec.min === 1 ? index + 1 : index
}

function parseField(name: FieldName, text: string): Field | CronError {
  const spec = SPECS[name]
  const parts: Part[] = []
  const values = new Set<number>()

  for (const item of text.split(',')) {
    const match = /^(\*|([^-/]+)(?:-([^-/]+))?)(?:\/(\d+))?$/.exec(item)
    if (!match) return { reason: 'syntax', field: name, token: item }
    const star = match[1] === '*'
    let start = spec.min
    let end = name === 'weekday' ? 6 : spec.max
    if (!star) {
      const a = value(match[2]!, spec)
      const b = match[3] === undefined ? null : value(match[3], spec)
      if (a === null || (match[3] !== undefined && b === null)) return { reason: 'syntax', field: name, token: item }
      start = a
      // `5/15` means "from 5 to the end, every 15", as in Vixie cron.
      end = b ?? (match[4] ? spec.max : a)
    }
    const step = match[4] ? Number(match[4]) : 1
    if (start < spec.min || end > spec.max || start > end) return { reason: 'range', field: name, token: item }
    if (step < 1 || step > spec.max) return { reason: 'step', field: name, token: item }

    parts.push({ start, end, step, star })
    for (let v = start; v <= end; v += step) values.add(name === 'weekday' && v === 7 ? 0 : v)
  }
  return { values, parts, star: text.startsWith('*') }
}

export function parseCron(expression: string): CronResult {
  const trimmed = expression.trim().toLowerCase()
  if (trimmed === '@reboot') return { ok: false, reason: 'reboot' }
  const fields = (MACROS[trimmed] ?? expression.trim()).split(/\s+/).filter(Boolean)
  if (fields.length !== 5) return { ok: false, reason: 'count', count: fields.length }

  const schedule: Partial<Schedule> = {}
  for (const [i, name] of FIELD_NAMES.entries()) {
    const field = parseField(name, fields[i]!)
    if ('reason' in field) return { ok: false, ...field }
    schedule[name] = field
  }
  return { ok: true, schedule: schedule as Schedule }
}

// ---------------------------------------------------------------------------
// Next runs
// ---------------------------------------------------------------------------

function dayMatches(schedule: Schedule, date: Date): boolean {
  const dom = schedule.day.values.has(date.getDate())
  const dow = schedule.weekday.values.has(date.getDay())
  return !schedule.day.star && !schedule.weekday.star ? dom || dow : dom && dow
}

/** How far ahead to look before deciding an expression never fires (`0 0 30 2 *`). */
export const HORIZON_DAYS = 4 * 366

/**
 * The next `count` runs after `from`, in the runtime's local time zone — the
 * visitor's, in the browser. Skips a month, a day or an hour at a time when the
 * larger field already rules it out, so even a yearly schedule costs a few hundred
 * steps, and stops at `HORIZON_DAYS` so an impossible one ends instead of hanging.
 */
export function nextRuns(schedule: Schedule, from: Date, count = 5): Date[] {
  const runs: Date[] = []
  const cursor = new Date(from.getTime())
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)
  const horizon = from.getTime() + HORIZON_DAYS * 86_400_000

  // Every step moves the cursor forward; the guard makes sure a DST transition that
  // lands `setHours` on the same instant still makes progress.
  const advance = (step: () => void) => {
    const before = cursor.getTime()
    step()
    if (cursor.getTime() <= before) cursor.setTime(before + 60_000)
  }

  while (runs.length < count && cursor.getTime() <= horizon) {
    if (!schedule.month.values.has(cursor.getMonth() + 1)) {
      advance(() => {
        cursor.setMonth(cursor.getMonth() + 1, 1)
        cursor.setHours(0, 0, 0, 0)
      })
    } else if (!dayMatches(schedule, cursor)) {
      advance(() => {
        cursor.setDate(cursor.getDate() + 1)
        cursor.setHours(0, 0, 0, 0)
      })
    } else if (!schedule.hour.values.has(cursor.getHours())) {
      advance(() => cursor.setHours(cursor.getHours() + 1, 0, 0, 0))
    } else if (!schedule.minute.values.has(cursor.getMinutes())) {
      advance(() => cursor.setMinutes(cursor.getMinutes() + 1, 0, 0))
    } else {
      runs.push(new Date(cursor.getTime()))
      advance(() => cursor.setMinutes(cursor.getMinutes() + 1, 0, 0))
    }
  }
  return runs
}

// ---------------------------------------------------------------------------
// Description
// ---------------------------------------------------------------------------

const MONTHS: Record<Locale, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
}
const WEEKDAYS: Record<Locale, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
}

function list(items: string[], locale: Locale): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} ${locale === 'fr' ? 'et' : 'and'} ${items.at(-1)}`
}

const pad = (n: number) => String(n).padStart(2, '0')
const time = (h: number, m: number) => `${pad(h)}:${pad(m)}`
const ordinalFr = (n: number) => (n === 1 ? '1er' : String(n))

/** A field is a single value, with nothing else in it. */
function single(field: Field): number | null {
  const [only] = field.parts
  return field.parts.length === 1 && !only!.star && only!.start === only!.end ? only!.start : null
}

// A star alone, or a star with a step: the step (1 for a bare star). A line comment,
// because the step syntax would close a block comment.
function everyStep(field: Field): number | null {
  const [only] = field.parts
  return field.parts.length === 1 && only!.star ? only!.step : null
}

/** A field's values as a phrase, with names where the field has them. */
function describeParts(field: Field, name: FieldName, locale: Locale): string {
  const label = (v: number) =>
    name === 'month' ? MONTHS[locale][v - 1]! : name === 'weekday' ? WEEKDAYS[locale][v % 7]! : name === 'day' && locale === 'fr' ? ordinalFr(v) : String(v)
  return list(
    field.parts.map((part) => {
      if (part.start === part.end) return label(part.start)
      const range =
        locale === 'fr'
          ? `${name === 'weekday' || name === 'month' || name === 'day' ? 'du ' : 'de '}${label(part.start)} ${name === 'weekday' || name === 'month' || name === 'day' ? 'au' : 'à'} ${label(part.end)}`
          : `${label(part.start)}${name === 'weekday' || name === 'month' ? ' to ' : '–'}${label(part.end)}`
      if (part.step === 1) return range
      return locale === 'fr' ? `${range}, tous les ${part.step}` : `every ${part.step} from ${label(part.start)} to ${label(part.end)}`
    }),
    locale,
  )
}

function describeTime(s: Schedule, locale: Locale): string {
  const fr = locale === 'fr'
  const minute = single(s.minute)
  const minuteStep = everyStep(s.minute)
  const hourStep = everyStep(s.hour)
  const hours = s.hour.parts.every((p) => !p.star && p.step === 1) ? [...s.hour.values].sort((a, b) => a - b) : null

  if (minuteStep === 1 && hourStep === 1) return fr ? 'toutes les minutes' : 'every minute'
  if (minuteStep !== null && hourStep === 1) return fr ? `toutes les ${minuteStep} minutes` : `every ${minuteStep} minutes`
  if (minute !== null && hours && hours.length <= 6) {
    return `${fr ? 'à' : 'at'} ${list(hours.map((h) => time(h, minute)), locale)}`
  }
  if (minute !== null && hourStep === 1) return fr ? `à la minute ${minute} de chaque heure` : `at minute ${minute} past every hour`
  if (minute !== null && hourStep !== null) {
    return fr ? `à la minute ${minute}, toutes les ${hourStep} heures` : `at minute ${minute}, every ${hourStep} hours`
  }
  if (minuteStep !== null) {
    const every = minuteStep === 1 ? (fr ? 'toutes les minutes' : 'every minute') : fr ? `toutes les ${minuteStep} minutes` : `every ${minuteStep} minutes`
    return fr ? `${every}, heures : ${describeParts(s.hour, 'hour', locale)}` : `${every} during hour ${describeParts(s.hour, 'hour', locale)}`
  }
  return fr
    ? `aux minutes ${describeParts(s.minute, 'minute', locale)}, heures : ${describeParts(s.hour, 'hour', locale)}`
    : `at minute ${describeParts(s.minute, 'minute', locale)} past hour ${describeParts(s.hour, 'hour', locale)}`
}

function describeDays(s: Schedule, locale: Locale): string {
  const fr = locale === 'fr'
  const domStep = everyStep(s.day)
  const dowStep = everyStep(s.weekday)
  const dom = s.day.star
    ? domStep !== null && domStep > 1
      ? fr ? `tous les ${domStep} jours du mois` : `every ${domStep} days of the month`
      : ''
    : fr
      ? `le ${describeParts(s.day, 'day', locale)} du mois`
      : `on day ${describeParts(s.day, 'day', locale)} of the month`
  const names = () => list([...s.weekday.values].sort((a, b) => a - b).map((v) => WEEKDAYS[locale][v]!), locale)
  const dow = s.weekday.star
    ? dowStep !== null && dowStep > 1
      ? fr ? `le ${names()}` : `on ${names()}`
      : ''
    : fr
      ? (single(s.weekday) !== null ? 'le ' : '') + describeParts(s.weekday, 'weekday', locale)
      : `on ${describeParts(s.weekday, 'weekday', locale)}`

  // Both restricted: either matches (see the header).
  if (!s.day.star && !s.weekday.star) return `${dom} ${fr ? 'ou' : 'or'} ${dow}`
  return [dom, dow].filter(Boolean).join(', ') || (fr ? 'tous les jours' : 'every day')
}

function describeMonths(s: Schedule, locale: Locale): string {
  const fr = locale === 'fr'
  const step = everyStep(s.month)
  if (step === 1) return ''
  if (step !== null) return fr ? `tous les ${step} mois` : `every ${step} months`
  const parts = s.month.parts
  if (parts.length === 1 && parts[0]!.start !== parts[0]!.end && parts[0]!.step === 1) {
    const [part] = parts
    return fr
      ? `de ${MONTHS.fr[part!.start - 1]} à ${MONTHS.fr[part!.end - 1]}`
      : `from ${MONTHS.en[part!.start - 1]} to ${MONTHS.en[part!.end - 1]}`
  }
  return `${fr ? 'en' : 'in'} ${describeParts(s.month, 'month', locale)}`
}

/** "at 09:00, on Monday to Friday" / "à 09:00, du lundi au vendredi". */
export function describeCron(schedule: Schedule, locale: Locale): string {
  const timePart = describeTime(schedule, locale)
  const days = describeDays(schedule, locale)
  // "every 15 minutes, every day" says nothing the first half did not; "at 09:00,
  // every day" does, so it is only kept after a time of day.
  const everyDay = days === (locale === 'fr' ? 'tous les jours' : 'every day')
  const timeOfDay = /^(at|à) \d/.test(timePart)
  return [timePart, everyDay && !timeOfDay ? '' : days, describeMonths(schedule, locale)].filter(Boolean).join(', ')
}
