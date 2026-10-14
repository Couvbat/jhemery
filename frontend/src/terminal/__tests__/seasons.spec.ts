import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { fortunes, seasonalFortunes } from '@/content/fortunes'
import { contentCommands } from '../commands/content'
import { eggCommands } from '../commands/eggs'
import { runCommand } from './context'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

const fortune = eggCommands.find((c) => c.name === 'fortune')!
const neofetch = contentCommands.find((c) => c.name === 'neofetch')!

// Local-time constructors: the season is the visitor's day, wherever the spec runs.
const HALLOWEEN = new Date(2026, 9, 31, 21, 0)
const SOLSTICE = new Date(2026, 11, 21, 8, 0)
const ORDINARY = new Date(2026, 9, 14, 12, 0)

beforeAll(() => vi.useFakeTimers({ toFake: ['Date'] }))
afterAll(() => vi.useRealTimers())

/** The first line `fortune` prints, the fortune itself (an achievement toast may follow). */
async function fortuneOn(at: Date, locale: 'en' | 'fr' = 'en'): Promise<string> {
  vi.setSystemTime(at)
  const { lines } = await runCommand(fortune, [], { locale })
  return lines[0]!.text
}

describe('fortune', () => {
  it('draws from the season’s pool on its day', async () => {
    for (let i = 0; i < 10; i++) {
      expect(seasonalFortunes.halloween.map((l) => l.en)).toContain(await fortuneOn(HALLOWEEN))
    }
  })

  it('speaks the visitor’s language', async () => {
    expect(seasonalFortunes.solstice.map((l) => l.fr)).toContain(await fortuneOn(SOLSTICE, 'fr'))
    expect(fortunes.map((l) => l.fr)).toContain(await fortuneOn(ORDINARY, 'fr'))
  })

  it('keeps to the everyday lines on any other day', async () => {
    for (let i = 0; i < 10; i++) expect(fortunes.map((l) => l.en)).toContain(await fortuneOn(ORDINARY))
  })
})

describe('neofetch', () => {
  it('has a Season row on a season’s day, in the visitor’s language', async () => {
    vi.setSystemTime(HALLOWEEN)
    expect((await runCommand(neofetch)).text).toMatch(/Season: Halloween — the wireframes are haunted/)
    vi.setSystemTime(SOLSTICE)
    expect((await runCommand(neofetch, [], { locale: 'fr' })).text).toMatch(/Season: solstice d’hiver/)
  })

  it('has none on any other day', async () => {
    vi.setSystemTime(ORDINARY)
    expect((await runCommand(neofetch)).text).not.toContain('Season:')
  })
})
