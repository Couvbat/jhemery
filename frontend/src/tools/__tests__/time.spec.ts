import { describe, expect, it } from 'vitest'
import { dayOfYear, inZone, isoWeek, parseInstant, relative, toEpochSeconds, toIso } from '../time/time'

describe('time tool', () => {
  const now = new Date('2026-09-22T12:00:00Z')

  it('parses epoch seconds and milliseconds by digit count', () => {
    expect(parseInstant('1700000000')?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
    expect(parseInstant('1700000000000')?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
    expect(parseInstant('1700000000.5')?.getTime()).toBe(1700000000500)
    expect(parseInstant('0')?.toISOString()).toBe('1970-01-01T00:00:00.000Z')
    // Eleven digits sit in the gap nobody's clock is in.
    expect(parseInstant('17000000000')).toBeNull()
  })

  it('parses ISO 8601 and the word now', () => {
    expect(parseInstant('2026-09-22T12:00:00Z')?.getTime()).toBe(now.getTime())
    expect(parseInstant(' now ', now)?.getTime()).toBe(now.getTime())
  })

  it('refuses what is not a time', () => {
    for (const bad of ['', 'yesterday-ish', 'abc', '2026-13-45']) {
      expect(parseInstant(bad), bad).toBeNull()
    }
  })

  it('prints epoch and ISO', () => {
    expect(toEpochSeconds(now)).toBe(1790078400)
    expect(toIso(now)).toBe('2026-09-22T12:00:00.000Z')
  })

  it('describes an instant relative to now, in both locales', () => {
    expect(relative(new Date('2026-09-25T12:00:00Z'), now, 'en')).toBe('in 3 days')
    expect(relative(new Date('2026-09-22T10:00:00Z'), now, 'en')).toBe('2 hours ago')
    expect(relative(new Date('2026-09-25T12:00:00Z'), now, 'fr')).toBe('dans 3 jours')
    expect(relative(now, now, 'en')).toBe('now')
  })

  it('formats a zone with its offset', () => {
    const paris = inZone(now, 'Europe/Paris', 'en')
    expect(paris.time).toContain('14')
    expect(paris.offset).toBe('GMT+2')
    // ICU builds differ on whether the zero offset is spelled out.
    expect(inZone(now, 'UTC', 'en').offset).toMatch(/^GMT(\+0)?$/)
  })

  it('computes ISO weeks, year boundaries included', () => {
    expect(isoWeek(new Date('2021-01-03T12:00:00Z'))).toEqual({ year: 2020, week: 53 })
    expect(isoWeek(new Date('2024-12-30T12:00:00Z'))).toEqual({ year: 2025, week: 1 })
    expect(isoWeek(now)).toEqual({ year: 2026, week: 39 })
  })

  it('counts the day of the year', () => {
    expect(dayOfYear(new Date('2026-01-01T12:00:00Z'))).toBe(1)
    expect(dayOfYear(now)).toBe(265)
    expect(dayOfYear(new Date('2024-12-31T12:00:00Z'))).toBe(366)
  })
})
