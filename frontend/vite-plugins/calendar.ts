import type { Plugin } from 'vite'
import { eventEnd, eventStart, eventUrl, events, feedFile, type SiteEvent } from '../src/content/events'
import { profile } from '../src/content/profile'
import type { Locale, Localised } from '../src/content/types'

/**
 * `/events.ics` and `/events.fr.ics`: `content/events.ts` as an iCalendar feed (RFC 5545),
 * which a calendar app subscribes to and re-reads on its own. Written from the standard
 * rather than with a library, since what it needs is small and exact: CRLF endings,
 * escaped text, lines folded at 75 octets, and times in UTC.
 */

const CRLF = '\r\n'
/** RFC 5545 §3.1: a content line is at most 75 octets, line break excluded. */
const LINE_OCTETS = 75

/** §3.3.11: a TEXT value escapes the backslash, `;`, `,` and the line break. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * §3.1: a long line is folded by a line break and one space, which a reader removes.
 * Counted in UTF-8 octets, and split only between characters: cutting `é` in two would
 * leave each half invalid, which is the mistake a `slice(0, 75)` makes. An escape such
 * as `\,` is kept whole too. The standard allows the split, since unfolding comes
 * before parsing, but a reader that unescapes line by line would see a lone backslash.
 */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  const out: string[] = []
  let current = ''
  let octets = 0
  for (const [char] of line.matchAll(/\\[\s\S]|[\s\S]/gu)) {
    const size = encoder.encode(char).length
    // A continuation line starts with its space, which counts towards its 75.
    if (octets + size > LINE_OCTETS) {
      out.push(current)
      current = ' '
      octets = 1
    }
    current += char
    octets += size
  }
  out.push(current)
  return out.join(CRLF)
}

/** §3.3.5, form 2: `20261107T200000Z`. Always UTC, so no event needs a `TZID`. */
export function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * The zone the site lives in. No event refers to it, since they are all in UTC; it is
 * here so the feed always holds one component, which §3.6's grammar requires and an
 * empty list would otherwise leave it without. The rules are the EU's: summer time from
 * the last Sunday of March to the last Sunday of October.
 */
const PARIS = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

const DESCRIPTION: Localised = {
  en: `What ${profile.name} hosts on ${profile.domain}: live sets, releases, watch parties.`,
  fr: `Ce qu’anime ${profile.name} sur ${profile.domain} : sets en direct, sorties, soirées vidéo.`,
}

function vevent(event: SiteEvent, locale: Locale, stamp: string): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@${profile.domain}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utcStamp(eventStart(event))}`,
    `DTEND:${utcStamp(eventEnd(event))}`,
    `SUMMARY:${escapeText(event.title[locale])}`,
  ]
  if (event.note) lines.push(`DESCRIPTION:${escapeText(event.note[locale])}`)
  if (event.where) {
    // Both: some apps show `URL`, and the rest only `LOCATION`, which for something
    // online is where you go.
    const url = eventUrl(event.where)
    lines.push(`URL:${url}`, `LOCATION:${escapeText(url)}`)
  }
  lines.push('END:VEVENT')
  return lines
}

/** The whole feed. `at` is the `DTSTAMP`, pinned by the specs and the build's clock otherwise. */
export function buildCalendar(locale: Locale, list: readonly SiteEvent[] = events, at: Date = new Date()): string {
  const name = profile.domain
  const stamp = utcStamp(at)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${profile.domain}//events//${locale.toUpperCase()}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // RFC 7986's names for the calendar, then the X-WR- ones the older readers know.
    `NAME:${escapeText(name)}`,
    `X-WR-CALNAME:${escapeText(name)}`,
    `DESCRIPTION:${escapeText(DESCRIPTION[locale])}`,
    `X-WR-CALDESC:${escapeText(DESCRIPTION[locale])}`,
    `URL:https://${profile.domain}/now`,
    `SOURCE;VALUE=URI:https://${profile.domain}/${feedFile(locale)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
    'X-WR-TIMEZONE:Europe/Paris',
    ...PARIS,
    ...list.flatMap((event) => vevent(event, locale, stamp)),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join(CRLF) + CRLF
}

const files = (['en', 'fr'] as const).map((locale) => ({
  fileName: feedFile(locale),
  build: () => buildCalendar(locale),
}))

const CONTENT_TYPE = 'text/calendar; charset=utf-8'

export function calendarPlugin(): Plugin {
  return {
    name: 'couvbat-calendar',
    generateBundle() {
      for (const file of files) this.emitFile({ type: 'asset', fileName: file.fileName, source: file.build() })
    },
    // Served in dev too, as the résumé plugin does its files.
    configureServer(server) {
      for (const file of files) {
        server.middlewares.use(`/${file.fileName}`, (_req, res) => {
          res.setHeader('Content-Type', CONTENT_TYPE)
          res.end(file.build())
        })
      }
    },
  }
}
