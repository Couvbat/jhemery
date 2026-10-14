import { profile } from './profile'
import { findSection } from './sections'
import { isExternal, type Locale, type Localised } from './types'

/**
 * Things Jules hosts at a fixed time: a live radio set, a release, a watch party
 * (roadmap §J, *Events*). Where `seasons.ts` is the calendar's days, this is its
 * appointments. One list, four readers: the `calendar` command, the block on `/now`, the
 * footer's status line once one is a week away, and the `.ics` feeds
 * (`vite-plugins/calendar.ts`), which a calendar app subscribes to.
 *
 * Empty until there is something to announce, and the page shows nothing while it is: no
 * block on `/now`, no footer line. `calendar` says nothing is scheduled and gives the
 * feed, which is still built, so whoever subscribes early hears about the first one.
 *
 * Unlike the seasons, an event is an instant rather than a local day: a set at 21:00 in
 * Paris starts at 20:00 in London, so each reader shows it in the visitor's own zone.
 */
export interface SiteEvent {
  /**
   * Stable for the event's whole life, since it becomes the calendar's `UID`: a
   * subscribed calendar updates an event it already has by this, and a new id would
   * leave the old one standing beside it. Lower-case words and digits.
   */
  id: string
  /** ISO 8601 with its offset written out, as it would be announced: `2026-11-07T21:00:00+01:00`. */
  start: string
  minutes: number
  title: Localised
  note?: Localised
  /** A path `goTo()` accepts (`radio`, `music`, `watch`) or an https URL. */
  where?: string
}

export const events: readonly SiteEvent[] = []

/** The feed a calendar app subscribes to, one per language (`vite-plugins/calendar.ts`). */
export function feedFile(locale: Locale): string {
  return locale === 'fr' ? 'events.fr.ics' : 'events.ics'
}

/** How far ahead the footer starts announcing one. The block on `/now` lists them all. */
export const SOON_DAYS = 7

export function eventStart(event: SiteEvent): Date {
  return new Date(event.start)
}

export function eventEnd(event: SiteEvent): Date {
  return new Date(eventStart(event).getTime() + event.minutes * 60_000)
}

/** Whether `at` falls between the event's start and its end. */
export function isLive(event: SiteEvent, at: Date = new Date()): boolean {
  return eventStart(event) <= at && at < eventEnd(event)
}

/** Every event that hasn't ended by `at`, soonest first; a live one leads. */
export function upcomingEvents(at: Date = new Date(), list: readonly SiteEvent[] = events): SiteEvent[] {
  return list.filter((event) => eventEnd(event) > at).sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime())
}

/** The event the footer names: one on now, or the next one to start within `SOON_DAYS`. */
export function soonestEvent(at: Date = new Date(), list: readonly SiteEvent[] = events): SiteEvent | undefined {
  const next = upcomingEvents(at, list)[0]
  if (!next) return undefined
  return eventStart(next).getTime() - at.getTime() <= SOON_DAYS * 86_400_000 ? next : undefined
}

/**
 * `where` as an absolute URL, for readers outside the app: a calendar can't call
 * `goTo()`. A section is an anchor on the home page, anything else a route.
 */
export function eventUrl(where: string): string {
  if (isExternal(where)) return where
  const path = where.replace(/^\/+/, '')
  const section = findSection(path)
  return section ? `https://${profile.domain}/#${section.id}` : `https://${profile.domain}/${path}`
}
