import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SteamActivity } from '@/lib/api'

/**
 * Steam with receipts (roadmap §L): the favourites in `content/gaming.ts` carry their notes,
 * and Steam adds their hours and achievements on the call `steam` and the gaming section
 * already share. What is being played comes from Steam alone, so with it off nothing
 * claims to be live. `useSteam` keeps its answer for the page's life, so each case loads
 * the modules afresh.
 */

const steamActivity = vi.fn<(apps?: readonly number[]) => Promise<SteamActivity>>()
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, steamActivity } }
})

const LIVE: SteamActivity = {
  configured: true,
  profile: { name: 'Couvbat', avatar: '', profileUrl: '', status: 'online', inGame: 'Factorio' },
  recentGames: [{ appId: 427520, name: 'Factorio', iconUrl: '', playtime2Weeks: 420, playtimeForever: 9_000 }],
  favourites: [
    { appId: 250900, minutes: 72_240, achievements: { achieved: 636, total: 637 } },
    { appId: 427520, minutes: 9_000 },
  ],
}

async function load() {
  vi.resetModules()
  const { resolve } = await import('../registry')
  const { runCommand } = await import('./context')
  const { gaming } = await import('@/content')
  return { steam: resolve('steam')!, runCommand, gaming }
}

beforeEach(() => {
  steamActivity.mockReset()
})

describe('steam', () => {
  it('asks for the favourites by id, and prints each with its note and its receipts', async () => {
    steamActivity.mockResolvedValue(LIVE)
    const { steam, runCommand, gaming } = await load()
    const { text } = await runCommand(steam)

    expect(steamActivity).toHaveBeenCalledWith(gaming.favourites.map((game) => game.appId))
    expect(text).toContain('Couvbat — in-game: Factorio')
    expect(text).toMatch(/^▸ The Binding of Isaac +Real Platinum God · 1204h · 636\/637 achievements$/m)
    // Hours alone for a game that keeps no achievements, and a favourite Steam said nothing
    // about keeps its line, with its note if it has one.
    expect(text).toMatch(/^▸ Factorio +150h$/m)
    expect(text).toMatch(/^▸ Slay the Spire 2 +Ascension 10$/m)
    expect(text).toMatch(/^▸ Project Zomboid$/m)
  })

  it('lists the favourites and claims nothing live when Steam is off', async () => {
    steamActivity.mockResolvedValue({ configured: false })
    const { steam, runCommand, gaming } = await load()
    const { text } = await runCommand(steam)

    expect(text).toContain('live activity unavailable — here are the favourites')
    for (const game of gaming.favourites) expect(text).toContain(game.name)
    expect(text).not.toMatch(/in-game|currently playing/i)
    expect(text).not.toMatch(/\d+h\b/)
  })

  it('says the same when the API is down', async () => {
    steamActivity.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    const { steam, runCommand } = await load()
    const { text } = await runCommand(steam)
    expect(text).toContain('live activity unavailable')
    expect(text).toMatch(/^▸ The Binding of Isaac +Real Platinum God$/m)
  })

  it('answers in French', async () => {
    steamActivity.mockResolvedValue({ configured: false })
    const { steam, runCommand } = await load()
    const { text } = await runCommand(steam, [], { locale: 'fr' })
    expect(text).toContain('activité en direct indisponible — voici les favoris')
    expect(text).toContain('Favoris :')
  })
})

describe('formatReceipt', () => {
  it('rounds to whole hours, keeps minutes under one, and names the count only when asked', async () => {
    const { formatReceipt } = await import('@/composables/useSteam')
    expect(formatReceipt({ appId: 1, minutes: 45 })).toBe('45m')
    expect(formatReceipt({ appId: 1, minutes: 9_001 })).toBe('150h')
    expect(formatReceipt({ appId: 1, minutes: 120, achievements: { achieved: 3, total: 40 } })).toBe('2h · 3/40')
    expect(formatReceipt({ appId: 1, minutes: 120, achievements: { achieved: 3, total: 40 } }, 'succès')).toBe('2h · 3/40 succès')
  })
})
