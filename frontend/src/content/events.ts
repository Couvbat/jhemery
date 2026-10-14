import type { Locale, Localised } from './types'

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
 *
 * Only the list is here, in the barrel, so the home page can ask whether there is one.
 * What the readers do with it is `upcoming.ts`, which only they load.
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
