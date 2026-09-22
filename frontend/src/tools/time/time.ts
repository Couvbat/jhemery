/**
 * Instants in and out of the forms people paste: epoch seconds or milliseconds, ISO
 * 8601, or whatever `Date.parse` accepts. Formatting goes through `Intl`, so the
 * locale and the time zone are the browser's business, not this module's.
 */

import type { Locale } from '@/content/types'

/**
 * `now`, an integer (10 digits or fewer is seconds, 12 or more is milliseconds — the
 * gap between them is 2001 to 5138, so no real timestamp is ambiguous), a decimal
 * number of seconds, or anything `Date.parse` understands. `null` for the rest.
 */
export function parseInstant(input: string, now: Date = new Date()): Date | null {
  const text = input.trim()
  if (!text) return null
  if (text.toLowerCase() === 'now') return new Date(now.getTime())

  if (/^-?\d+$/.test(text)) {
    const digits = text.replace('-', '').length
    const value = Number(text)
    if (digits <= 10) return new Date(value * 1000)
    if (digits >= 12) return new Date(value)
    return null
  }
  if (/^-?\d+\.\d+$/.test(text)) return new Date(Number(text) * 1000)

  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : new Date(parsed)
}

export function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

export function toIso(date: Date): string {
  return date.toISOString()
}

/** The browser's own zone, spelled out in full. */
export function toLocal(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date)
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
]

/** `in 3 days`, `il y a 2 heures`: the largest unit that fits, rounded. */
export function relative(date: Date, now: Date, locale: Locale): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return format.format(Math.round(seconds / size), unit)
    }
  }
  return format.format(0, 'second')
}

export const ZONES = [
  'UTC',
  'Europe/Paris',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const

export type Zone = (typeof ZONES)[number]

/** `Tue 14:00` and `GMT+2` — a 24-hour clock whatever the locale's habit, since the
 *  table exists to compare zones at a glance. */
export function inZone(date: Date, zone: string, locale: Locale): { time: string; offset: string } {
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  const offset =
    new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? ''
  return { time, offset }
}

/** ISO 8601 week, on the instant's UTC date. The year is the week's, which is not
 *  always the date's — 3 January 2021 is week 53 of 2020. */
export function isoWeek(date: Date): { year: number; week: number } {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = utc.getUTCDay() || 7
  // Thursday of the same week decides which year the week belongs to.
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((utc.getTime() - yearStart) / 86400000 + 1) / 7)
  return { year: utc.getUTCFullYear(), week }
}

export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.round((today - start) / 86400000) + 1
}
