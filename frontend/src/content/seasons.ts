import { profile } from './profile'
import type { Localised } from './types'

/**
 * Six days a year the site notices the date (roadmap §I, *Seasons*, and §J for the last
 * two). On one of them the
 * wireframes take the day's palette (`components/palette.ts`), `fortune` draws from the
 * day's pool (`fortunes.ts`), and `neofetch` and the boot log each gain a line. Nothing
 * else changes, and nothing is earned: an achievement for a season would leave
 * `completionist` waiting on the calendar, up to a year, when every other one waits only
 * on the visitor.
 *
 * The day is the visitor's own, read off the local calendar rather than UTC as the rest of
 * this folder reads dates: Halloween starts at the visitor's midnight, not London's. Like
 * `dates.ts`, nothing here reads the clock unless the caller leaves `at` out, so the specs
 * pin it with `vi.setSystemTime`.
 */
export type SeasonId = 'halloween' | 'solstice' | 'new-year' | 'birthday' | 'music-day' | 'april-fools'

export interface Season {
  id: SeasonId
  /** `MM-DD`, on the visitor's calendar. One day each, never a range. */
  day: string
  /** `neofetch`'s `Season` row. */
  neofetch: Localised
  /**
   * The boot log's line, after its timestamp. English, like the rest of that kernel log,
   * which is a fixed piece of machine voice rather than copy.
   */
  boot: string
}

export const seasons: readonly Season[] = [
  {
    id: 'halloween',
    day: '10-31',
    neofetch: { en: 'Halloween — the wireframes are haunted', fr: 'Halloween — les formes sont hantées' },
    boot: 'loading module: halloween.ko (spooky=1)',
  },
  {
    // A fixed date: the solstice falls on the 21st or the 22nd, and a lookup table of
    // astronomical instants is a lot of machinery for one line of whimsy. Named for the
    // northern hemisphere, where the site is; south of the equator it is the longest day.
    id: 'solstice',
    day: '12-21',
    neofetch: {
      en: 'winter solstice — the longest night, north of the equator',
      fr: 'solstice d’hiver — la plus longue nuit, au nord de l’équateur',
    },
    boot: 'rtc: longest night of the year, dimming the wireframes',
  },
  {
    id: 'new-year',
    day: '01-01',
    neofetch: { en: 'New Year’s Day — same bugs, new year', fr: 'jour de l’an — mêmes bugs, nouvelle année' },
    boot: 'rtc: year rolled over, every timestamp still sane',
  },
  {
    // The same date `neofetch`'s uptime counts from, so the two can't disagree about when
    // the site was born.
    id: 'birthday',
    day: profile.since.slice(5),
    neofetch: {
      en: `the site’s birthday — first commit ${profile.since}`,
      fr: `anniversaire du site — premier commit le ${profile.since}`,
    },
    boot: `init: first commit ${profile.since}, happy birthday couvsh`,
  },
  {
    // The Fête de la Musique: the one French holiday that is about the site's other half.
    // The summer solstice too, north of the equator, but the music is what France keeps.
    id: 'music-day',
    day: '06-21',
    neofetch: {
      en: 'Fête de la Musique — every output unmuted',
      fr: 'Fête de la Musique — toutes les sorties sont ouvertes',
    },
    boot: 'snd: fête de la musique, unmuting every channel',
  },
  {
    // The field turns the other way for the day (`components/palette.ts`), which is the
    // whole joke: nothing a visitor reads is made false, since the CV is on this page too.
    id: 'april-fools',
    day: '04-01',
    neofetch: { en: 'April Fools’ Day — the wireframes turn backwards', fr: '1er avril — les formes tournent à l’envers' },
    boot: 'sched: april 1st, reversing the rotation of every wireframe',
  },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** The season on a calendar day, `month` counted from 1. */
export function seasonOnDay(month: number, day: number): Season | undefined {
  const key = `${pad(month)}-${pad(day)}`
  return seasons.find((season) => season.day === key)
}

/** The season `at` falls on, on the visitor's local calendar, if it is one of the six. */
export function seasonOn(at: Date = new Date()): Season | undefined {
  return seasonOnDay(at.getMonth() + 1, at.getDate())
}

/**
 * Milliseconds from `at` to the visitor's next midnight, when the season can next change.
 * Built from the calendar rather than adding a day of milliseconds, which a clock change
 * would put an hour off.
 */
export function untilTomorrow(at: Date = new Date()): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1).getTime() - at.getTime()
}
