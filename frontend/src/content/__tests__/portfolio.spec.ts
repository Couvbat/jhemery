import { describe, expect, it } from 'vitest'
import { resolvePath } from '@/composables/useViewSwing'
import {
  currentRole,
  daysSince,
  durationLabel,
  education,
  experience,
  isExternal,
  monthsBetween,
  now,
  nowCategories,
  periodLabel,
  profile,
  skillNames,
  skills,
  staleDays,
  STALE_AFTER_DAYS,
  yearSpan,
} from '..'

describe('skills', () => {
  it('names each skill once', () => {
    expect(new Set(skillNames).size).toBe(skills.length)
  })

  // The whole point of `usedIn` is that a reader can check it, so a dead link is a
  // false claim, not a cosmetic bug.
  it.each(skills.filter((s) => s.usedIn).flatMap((s) => s.usedIn!.map((e) => [s.name, e.where] as const)))(
    '%s → %s goes somewhere real',
    (_name, where) => {
      if (isExternal(where)) {
        expect(where).toMatch(/^https:\/\/github\.com\/Couvbat\/jhemery(\/|$)/)
      } else {
        expect(resolvePath(where), where).toBeDefined()
      }
    },
  )

  it('describes every piece of evidence in both languages', () => {
    for (const skill of skills) {
      for (const evidence of skill.usedIn ?? []) {
        expect(evidence.what.en, skill.name).toBeTruthy()
        expect(evidence.what.fr, skill.name).toBeTruthy()
      }
    }
  })
})

describe('availability', () => {
  it('is one flag and one sentence in each language', () => {
    expect(typeof profile.availability.open).toBe('boolean')
    expect(profile.availability.note.en).toBeTruthy()
    expect(profile.availability.note.fr).toBeTruthy()
  })
})

describe('/now', () => {
  it('counts whole days since the update, in UTC', () => {
    expect(daysSince('2026-01-01', new Date('2026-01-01T23:59:00Z'))).toBe(0)
    expect(daysSince('2026-01-01', new Date('2026-01-02T00:00:00Z'))).toBe(1)
    // A date in the future (a clock set wrong) is not negative age.
    expect(daysSince('2026-01-10', new Date('2026-01-01T00:00:00Z'))).toBe(0)
  })

  it('stays quiet while fresh and says how old it is once stale', () => {
    const updated = '2026-01-01'
    const at = (days: number) => new Date(Date.parse(`${updated}T12:00:00Z`) + days * 86_400_000)
    expect(staleDays(updated, at(STALE_AFTER_DAYS))).toBeNull()
    expect(staleDays(updated, at(STALE_AFTER_DAYS + 1))).toBe(STALE_AFTER_DAYS + 1)
  })

  it('has a valid date and only known categories', () => {
    expect(now.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(now.updated))).toBe(false)
    for (const entry of now.entries) {
      expect(nowCategories[entry.category]).toBeDefined()
      expect(entry.text.en).toBeTruthy()
      expect(entry.text.fr).toBeTruthy()
    }
  })
})

describe('dates', () => {
  const at = new Date('2026-10-01T12:00:00Z')

  // LinkedIn's rule, so the CV and the profile agree: both ends count.
  it('counts both the first and the last month of a span', () => {
    expect(monthsBetween('2023-05', '2023-11', at)).toBe(7)
    expect(monthsBetween('2023-11', '2023-11', at)).toBe(1)
    expect(monthsBetween('2023-11', undefined, at)).toBe(36)
  })

  it('gives a span that has not started yet no length rather than a negative one', () => {
    expect(monthsBetween('2027-01', undefined, at)).toBe(0)
  })

  it('says months below a year and whole years from then on', () => {
    // December 2025 to October 2026 is eleven months; a month earlier is twelve.
    expect(durationLabel('2025-12', undefined, at)).toEqual({ en: '11 months', fr: '11 mois' })
    expect(durationLabel('2025-11', undefined, at)).toEqual({ en: '1 year', fr: '1 an' })
    expect(durationLabel('2024-10', '2026-10', at)).toEqual({ en: '2 years', fr: '2 ans' })
    expect(durationLabel('2026-10', undefined, at)).toEqual({ en: '1 month', fr: '1 mois' })
  })

  it('names months the same way on every engine', () => {
    expect(periodLabel('2023-05', '2023-11')).toEqual({ en: 'May 2023 – Nov 2023', fr: 'mai 2023 – nov. 2023' })
    expect(periodLabel('2023-11', undefined)).toEqual({ en: 'Nov 2023 – present', fr: 'nov. 2023 – aujourd’hui' })
  })

  it('collapses a course that starts and ends in one year', () => {
    expect(yearSpan('2021-10', '2022-06')).toBe('2021 – 2022')
    expect(yearSpan('2020-01', '2020-06')).toBe('2020')
  })
})

describe('experience and education', () => {
  const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

  it('has exactly one current role, and the profile names it', () => {
    expect(experience.filter((role) => !role.end)).toHaveLength(1)
    expect(currentRole?.employer).toEqual({ en: profile.employer, fr: profile.employer })
    expect(currentRole?.title).toEqual(profile.role)
  })

  it.each([...experience.map((r) => [r.employer.en, r.start, r.end] as const), ...education.map((c) => [c.school.en, c.start, c.end] as const)])(
    '%s has real months that run forwards',
    (_name, start, end) => {
      expect(start).toMatch(MONTH)
      if (end) {
        expect(end).toMatch(MONTH)
        expect(end >= start).toBe(true)
      }
    },
  )

  it('lists each one newest first', () => {
    for (const list of [experience, education]) {
      const starts = list.map((item) => item.start)
      expect(starts).toEqual([...starts].sort().reverse())
    }
  })

  // The site names nothing narrower than France (see experience.ts). A list of places
  // to avoid would itself name them, so this holds the one thing a pattern can: no
  // registered company form, whose registry entry carries an address.
  it('names no registered company', () => {
    const text = JSON.stringify([experience, education])
    expect(text).not.toMatch(/\b(SARL|SAS|SASU|EURL|SA|SNC)\b/)
  })

  it('says everything in both languages', () => {
    for (const role of experience) {
      for (const value of [role.employer, role.title, role.summary].filter(Boolean)) {
        expect(value!.en, role.employer.en).toBeTruthy()
        expect(value!.fr, role.employer.en).toBeTruthy()
      }
    }
    for (const course of education) {
      for (const value of [course.school, course.course, course.note].filter(Boolean)) {
        expect(value!.en, course.school.en).toBeTruthy()
        expect(value!.fr, course.school.en).toBeTruthy()
      }
    }
  })
})
