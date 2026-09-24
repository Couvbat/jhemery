import { describe, expect, it } from 'vitest'
import { resolvePath } from '@/composables/useViewSwing'
import { daysSince, isExternal, now, nowCategories, profile, skillNames, skills, staleDays, STALE_AFTER_DAYS } from '..'

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
