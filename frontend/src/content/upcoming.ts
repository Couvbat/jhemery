// Through the barrel rather than from each sibling: the home page already loads the
// barrel's chunk, and importing `sections.ts` on its own split it into a chunk of its own.
import { events, findSection, isExternal, profile, type Localised, type SiteEvent } from './index'

/**
 * The readers' side of `events.ts`: when an event starts and ends, which are ahead, and the
 * words `/now` and the footer put round them. Imported as `@/content/upcoming`, never
 * through the barrel, like `privacy.ts`: every reader of it is lazy (the `/now` page, the
 * footer's event line, the terminal, the build's feed), and the home page sits at its byte
 * budget, so none of this loads for a visitor while the list is empty.
 */

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

/** The `/now` block's and the footer line's words. */
export const upcomingLabels = {
  heading: { en: 'Coming up', fr: 'À venir' },
  live: { en: 'live now', fr: 'en direct' },
  until: { en: 'until', fr: 'jusqu’à' },
  go: { en: 'go there', fr: 'y aller' },
  subscribe: { en: 'subscribe in your calendar', fr: 's’abonner dans votre agenda' },
  download: { en: 'download the .ics', fr: 'télécharger le .ics' },
  footerLive: { en: 'live', fr: 'en direct' },
} satisfies Record<string, Localised>
