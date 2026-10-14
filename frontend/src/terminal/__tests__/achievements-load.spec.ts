import { afterEach, describe, expect, it, vi } from 'vitest'
import { sectionIds } from '@/content'

/**
 * The achievements as read from storage, which a save link (`lib/save-file.ts`) can fill
 * from someone else's code: no state it can restore may leave one out of reach. Each case
 * re-imports the module, which reads storage when it loads.
 */
async function fresh(stored: Record<string, unknown>) {
  for (const [key, value] of Object.entries(stored)) window.localStorage.setItem(key, JSON.stringify(value))
  vi.resetModules()
  return import('../achievements')
}

afterEach(() => window.localStorage.clear())

describe('stored achievements', () => {
  it('count only achievements: unknown ids are dropped', async () => {
    const { unlocked, unlockedCount } = await fresh({ 'couvbat:achievements': ['secret', 'no-such-thing', 'x'] })
    expect([...unlocked.value]).toEqual(['secret'])
    expect(unlockedCount()).toBe(1)
  })

  it('complete themselves when every other one is there, since no unlock is left to cascade', async () => {
    const { achievementList, COMPLETIONIST } = await import('../achievements')
    const others = achievementList.map((a) => a.id).filter((id) => id !== COMPLETIONIST)
    const { isUnlocked } = await fresh({ 'couvbat:achievements': others })
    expect(isUnlocked(COMPLETIONIST)).toBe(true)
  })

  it('still unlock explorer when every section is already recorded without it', async () => {
    const { visitSection, isUnlocked } = await fresh({ 'couvbat:achievements:sections': [...sectionIds] })
    expect(visitSection(sectionIds[0]!, sectionIds)).toContain('explorer')
    expect(isUnlocked('explorer')).toBe(true)
    // And only once.
    expect(visitSection(sectionIds[1]!, sectionIds)).toEqual([])
  })
})
