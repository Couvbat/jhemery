import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { SiteEvent } from '@/content/events'

// The real list is empty until there is something to announce; the spec fills it.
const list = vi.hoisted(() => ({ events: [] as SiteEvent[] }))
vi.mock('@/content/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/content/events')>()
  return {
    ...actual,
    get events() {
      return list.events
    },
  }
})

import { contentCommands } from '../commands/content'
import { runCommand } from './context'

const calendar = contentCommands.find((c) => c.name === 'calendar')!

const SET: SiteEvent = {
  id: 'acid-night',
  start: '2026-11-07T21:00:00+01:00',
  minutes: 180,
  title: { en: 'Live set: three hours of acid', fr: 'Set en direct : trois heures d’acid' },
  note: { en: 'Bring headphones.', fr: 'Prenez un casque.' },
  where: 'radio',
}
const RELEASE: SiteEvent = {
  id: 'ep',
  start: '2026-11-20T18:00:00+01:00',
  minutes: 60,
  title: { en: 'New EP', fr: 'Nouvel EP' },
  where: 'https://soundcloud.com/couvbat',
}

beforeAll(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterAll(() => vi.useRealTimers())
afterEach(() => {
  list.events = []
})

describe('calendar', () => {
  it('says nothing is scheduled, and still gives the feed', async () => {
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
    const { text, lines } = await runCommand(calendar, [], { locale: 'en' })
    expect(text).toContain('nothing scheduled yet.')
    expect(lines.at(-1)).toMatchObject({ text: 'https://jhemery.xyz/events.ics', href: 'https://jhemery.xyz/events.ics' })
  })

  it('lists what is ahead, soonest first, with how long until each', async () => {
    list.events = [RELEASE, SET]
    vi.setSystemTime(new Date('2026-11-04T20:00:00Z'))
    const { text, lines } = await runCommand(calendar, [], { locale: 'en' })
    expect(text).not.toContain('nothing scheduled')
    expect(text.indexOf('Live set')).toBeLessThan(text.indexOf('New EP'))
    expect(text).toContain('in 3 days')
    expect(text).toContain('Bring headphones.')
    // A path is a `cd` away; a URL is a link.
    expect(text).toContain('run `cd radio`')
    expect(lines.find((l) => l.href === RELEASE.where)).toBeDefined()
  })

  it('marks one that is on, and forgets one that is over', async () => {
    list.events = [SET]
    vi.setSystemTime(new Date('2026-11-07T21:30:00Z'))
    expect((await runCommand(calendar, [], { locale: 'en' })).text).toMatch(/● live now · until \d\d:\d\d/)
    vi.setSystemTime(new Date('2026-11-07T23:00:00Z'))
    expect((await runCommand(calendar, [], { locale: 'en' })).text).toContain('nothing scheduled yet.')
  })

  it('speaks French, with the French feed', async () => {
    list.events = [SET]
    vi.setSystemTime(new Date('2026-11-04T20:00:00Z'))
    const { text } = await runCommand(calendar, [], { locale: 'fr' })
    expect(text).toContain('Set en direct : trois heures d’acid')
    expect(text).toContain('dans 3 jours')
    expect(text).toContain('https://jhemery.xyz/events.fr.ics')
  })
})
