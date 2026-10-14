import { describe, expect, it } from 'vitest'
import { buildCalendar, escapeText, fold, utcStamp } from '../../../vite-plugins/calendar'
import { feedFile, type SiteEvent } from '../events'

const AT = new Date('2026-10-14T09:30:00Z')

const SET: SiteEvent = {
  id: 'acid-night',
  start: '2026-11-07T21:00:00+01:00',
  minutes: 180,
  title: { en: 'Live set: acid, techno; more', fr: 'Set en direct : acid, techno ; plus' },
  note: { en: 'Three hours.\nBring headphones.', fr: 'Trois heures.\nPrenez un casque.' },
  where: 'radio',
}

const octets = (line: string) => new TextEncoder().encode(line).length
/** RFC 5545 §3.1's unfolding: a line break followed by one space is removed. */
const unfold = (text: string) => text.replace(/\r\n /g, '')

describe('the iCalendar feed', () => {
  it('is in spec with no events: CRLF lines and one component, the zone', () => {
    const feed = buildCalendar('en', [], AT)
    expect(feed.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(feed.endsWith('END:VCALENDAR\r\n')).toBe(true)
    // No line break that isn't a CRLF.
    expect(feed.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(feed).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Paris\r\n')
    expect(feed).not.toContain('BEGIN:VEVENT')
    expect(feed).toContain('PRODID:-//jhemery.xyz//events//EN\r\n')
    expect(feed).toContain('SOURCE;VALUE=URI:https://jhemery.xyz/events.ics\r\n')
  })

  it('writes an event in UTC, under a UID that outlives its edits', () => {
    const feed = unfold(buildCalendar('en', [SET], AT))
    expect(feed).toContain('BEGIN:VEVENT\r\nUID:acid-night@jhemery.xyz\r\n')
    expect(feed).toContain('DTSTAMP:20261014T093000Z\r\n')
    // 21:00 in Paris in November is 20:00 UTC, and three hours later is 23:00.
    expect(feed).toContain('DTSTART:20261107T200000Z\r\n')
    expect(feed).toContain('DTEND:20261107T230000Z\r\n')
    expect(feed).toContain('SUMMARY:Live set: acid\\, techno\\; more\r\n')
    expect(feed).toContain('DESCRIPTION:Three hours.\\nBring headphones.\r\n')
    expect(feed).toContain('URL:https://jhemery.xyz/radio\r\nLOCATION:https://jhemery.xyz/radio\r\n')
    expect(feed.indexOf('END:VEVENT')).toBeGreaterThan(feed.indexOf('BEGIN:VEVENT'))
  })

  it('has a French feed of its own', () => {
    expect(feedFile('en')).toBe('events.ics')
    expect(feedFile('fr')).toBe('events.fr.ics')
    const feed = unfold(buildCalendar('fr', [SET], AT))
    expect(feed).toContain('SUMMARY:Set en direct : acid\\, techno \\; plus\r\n')
    expect(feed).toContain('PRODID:-//jhemery.xyz//events//FR\r\n')
    expect(feed).toContain('SOURCE;VALUE=URI:https://jhemery.xyz/events.fr.ics\r\n')
  })

  it('keeps every physical line within 75 octets', () => {
    const long: SiteEvent = { ...SET, note: { en: 'é'.repeat(120), fr: 'à'.repeat(120) } }
    for (const locale of ['en', 'fr'] as const) {
      for (const line of buildCalendar(locale, [long], AT).split('\r\n')) {
        expect(octets(line), line).toBeLessThanOrEqual(75)
      }
    }
  })
})

describe('the format’s rules', () => {
  it('escapes TEXT the way §3.3.11 says', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
    expect(escapeText('plain: text')).toBe('plain: text')
  })

  it('folds long lines with a space, and unfolding gives the line back', () => {
    const line = `DESCRIPTION:${'x'.repeat(200)}`
    const folded = fold(line)
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(2)
    expect(parts.slice(1).every((part) => part.startsWith(' '))).toBe(true)
    expect(parts.every((part) => octets(part) <= 75)).toBe(true)
    expect(unfold(folded)).toBe(line)
    expect(fold('SHORT:line')).toBe('SHORT:line')
  })

  // A two-octet character cut in half is two invalid sequences; a strict decoder throws.
  it('never splits a character across a fold', () => {
    const line = `SUMMARY:${'é'.repeat(100)}`
    const strict = new TextDecoder('utf-8', { fatal: true })
    for (const part of fold(line).split('\r\n')) {
      expect(() => strict.decode(new TextEncoder().encode(part))).not.toThrow()
      expect(part.replace(/^ /, '')).toMatch(/^(SUMMARY:)?é+$/)
    }
    expect(unfold(fold(line))).toBe(line)
  })

  it('keeps an escape on one line', () => {
    // 74 octets, then `\,`: a plain fold would put the backslash and the comma on two lines.
    const line = `DESCRIPTION:${'x'.repeat(62)}\\,${'y'.repeat(20)}`
    const parts = fold(line).split('\r\n')
    expect(parts[0]!.endsWith('\\')).toBe(false)
    expect(parts[1]!.startsWith(' \\,')).toBe(true)
    expect(unfold(fold(line))).toBe(line)
  })

  it('stamps times in UTC, without separators or milliseconds', () => {
    expect(utcStamp(new Date('2026-11-07T21:00:00.123+01:00'))).toBe('20261107T200000Z')
  })
})
