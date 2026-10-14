import { describe, expect, it } from 'vitest'
import { profile, seasonOn, seasonOnDay, seasons, untilTomorrow } from '..'
import { fortunePool, fortunes, seasonalFortunes } from '../fortunes'

// Dates here are built with the local `Date` constructor, so the specs hold in whatever
// time zone they run: the season is the visitor's local day, never UTC's.

describe('seasons', () => {
  it('falls on its six days and no others', () => {
    expect(seasonOnDay(10, 31)?.id).toBe('halloween')
    expect(seasonOnDay(12, 21)?.id).toBe('solstice')
    expect(seasonOnDay(1, 1)?.id).toBe('new-year')
    expect(seasonOnDay(6, 16)?.id).toBe('birthday')
    expect(seasonOnDay(6, 21)?.id).toBe('music-day')
    expect(seasonOnDay(4, 1)?.id).toBe('april-fools')
    const around = [[10, 30], [11, 1], [12, 20], [12, 22], [12, 31], [1, 2], [6, 15], [6, 17], [6, 20], [6, 22], [3, 31], [4, 2]] as const
    for (const [month, day] of around) {
      expect(seasonOnDay(month, day), `${month}/${day}`).toBeUndefined()
    }
  })

  it('takes the birthday from profile.since, the date the uptime counts from', () => {
    const birthday = seasons.find((s) => s.id === 'birthday')!
    expect(birthday.day).toBe(profile.since.slice(5))
  })

  it('names each day once, as a real MM-DD', () => {
    expect(new Set(seasons.map((s) => s.day)).size).toBe(seasons.length)
    expect(new Set(seasons.map((s) => s.id)).size).toBe(seasons.length)
    for (const { day } of seasons) {
      expect(day).toMatch(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
    }
  })

  it('lasts the visitor’s whole local day, from midnight to midnight', () => {
    expect(seasonOn(new Date(2026, 9, 30, 23, 59, 59, 999))).toBeUndefined()
    expect(seasonOn(new Date(2026, 9, 31, 0, 0))?.id).toBe('halloween')
    expect(seasonOn(new Date(2026, 9, 31, 23, 59, 59, 999))?.id).toBe('halloween')
    expect(seasonOn(new Date(2026, 10, 1, 0, 0))).toBeUndefined()
  })

  it('says how long until the next local midnight', () => {
    expect(untilTomorrow(new Date(2026, 5, 16, 18, 30))).toBe(5.5 * 3_600_000)
    // Whatever the day's length, the answer lands exactly on the next day's midnight.
    const at = new Date(2026, 9, 31, 13, 14, 15)
    const next = new Date(at.getTime() + untilTomorrow(at))
    expect([next.getDate(), next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([1, 0, 0, 0])
    expect(seasonOn(next)).toBeUndefined()
  })

  it('has a neofetch line in both languages and a boot line for each', () => {
    for (const season of seasons) {
      expect(season.neofetch.en, season.id).toBeTruthy()
      expect(season.neofetch.fr, season.id).toBeTruthy()
      expect(season.boot, season.id).toBeTruthy()
    }
  })
})

describe('fortunes', () => {
  it('keeps the everyday lines, now in both languages', () => {
    expect(fortunes.length).toBeGreaterThanOrEqual(8)
    for (const line of fortunes) {
      expect(line.en).toBeTruthy()
      expect(line.fr).toBeTruthy()
      expect(line.fr).not.toBe(line.en)
    }
  })

  it('has a pool of its own for every season', () => {
    for (const season of seasons) {
      const pool = seasonalFortunes[season.id]
      expect(pool.length, season.id).toBeGreaterThanOrEqual(3)
      for (const line of pool) {
        expect(line.en, season.id).toBeTruthy()
        expect(line.fr, season.id).toBeTruthy()
      }
    }
  })

  it('draws from the day’s pool: the season’s on its day, the everyday one otherwise', () => {
    expect(fortunePool(new Date(2026, 9, 31, 12))).toBe(seasonalFortunes.halloween)
    expect(fortunePool(new Date(2027, 0, 1, 0, 5))).toBe(seasonalFortunes['new-year'])
    expect(fortunePool(new Date(2026, 9, 14, 12))).toBe(fortunes)
  })
})
