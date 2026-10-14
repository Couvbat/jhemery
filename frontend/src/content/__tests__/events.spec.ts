import { describe, expect, it } from 'vitest'
import { resolvePath } from '@/composables/useViewSwing'
import { eventEnd, eventUrl, events, isExternal, isLive, soonestEvent, upcomingEvents, type SiteEvent } from '..'

const set = (id: string, start: string, minutes = 120): SiteEvent => ({
  id,
  start,
  minutes,
  title: { en: id, fr: id },
})

const FIXTURE = [
  set('later', '2026-11-20T21:00:00+01:00'),
  set('first', '2026-11-07T21:00:00+01:00', 180),
  set('past', '2026-10-01T20:00:00+02:00'),
]

describe('the events list', () => {
  // Each one is a calendar's UID for its whole life, and a promise to whoever subscribed.
  // The fixtures ride along, so the check has something to run on while the list is empty.
  it.each([...events, ...FIXTURE].map((event) => [event.id, event] as const))('%s is well formed', (_id, event) => {
    expect(event.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    // The offset written out: a bare local time would be read in whatever zone the build ran.
    expect(event.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/)
    expect(Number.isNaN(new Date(event.start).getTime())).toBe(false)
    expect(event.minutes).toBeGreaterThan(0)
    expect(event.minutes).toBeLessThanOrEqual(24 * 60)
    expect(event.title.en).toBeTruthy()
    expect(event.title.fr).toBeTruthy()
    if (event.note) expect(event.note.fr).toBeTruthy()
    if (event.where) {
      if (isExternal(event.where)) expect(event.where).toMatch(/^https:\/\//)
      else expect(resolvePath(event.where), event.where).toBeDefined()
    }
  })

  it('names each event once', () => {
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length)
  })
})

describe('upcoming events', () => {
  const at = new Date('2026-11-01T12:00:00Z')

  it('drops what has ended and puts the soonest first', () => {
    expect(upcomingEvents(at, FIXTURE).map((event) => event.id)).toEqual(['first', 'later'])
  })

  it('keeps one until it ends, not until it starts', () => {
    const during = new Date('2026-11-07T22:30:00+01:00')
    expect(upcomingEvents(during, FIXTURE)[0]?.id).toBe('first')
    expect(isLive(FIXTURE[1]!, during)).toBe(true)
    // Three hours from 21:00 is midnight: on at its start, off at its end.
    expect(eventEnd(FIXTURE[1]!).toISOString()).toBe('2026-11-07T23:00:00.000Z')
    expect(isLive(FIXTURE[1]!, new Date('2026-11-07T20:00:00Z'))).toBe(true)
    expect(isLive(FIXTURE[1]!, new Date('2026-11-07T23:00:00Z'))).toBe(false)
  })

  it('names one in the footer only from a week ahead', () => {
    expect(soonestEvent(at, FIXTURE)?.id).toBe('first')
    expect(soonestEvent(new Date('2026-10-30T12:00:00Z'), FIXTURE)).toBeUndefined()
    expect(soonestEvent(new Date('2026-11-25T12:00:00Z'), FIXTURE)).toBeUndefined()
    expect(soonestEvent(at, [])).toBeUndefined()
  })
})

describe('eventUrl', () => {
  it('turns a section into an anchor, a view into a route, and leaves a URL alone', () => {
    expect(eventUrl('music')).toBe('https://jhemery.xyz/#music')
    expect(eventUrl('radio')).toBe('https://jhemery.xyz/radio')
    expect(eventUrl('https://soundcloud.com/couvbat')).toBe('https://soundcloud.com/couvbat')
  })
})
