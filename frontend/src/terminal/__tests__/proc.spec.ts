import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The browser the `/proc/self` files read, as `fingerprint.spec.ts` fakes it: a Linux
 * laptop on a 1440p screen, with no `deviceMemory` (not Chromium) to show a row missing.
 */
const browser = vi.hoisted(() => ({
  build: vi.fn(() => ({
    navigator: { language: 'en-GB', languages: ['en-GB', 'fr'], hardwareConcurrency: 12, maxTouchPoints: 0 },
    screen: { width: 2560, height: 1440, colorDepth: 30 },
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }),
    intl: {
      DateTimeFormat: class {
        resolvedOptions() {
          return { timeZone: 'Europe/London' }
        }
      },
    },
    canvas: () => ({
      getContext: (kind: string) =>
        kind === 'webgl'
          ? {
              VENDOR: 1,
              RENDERER: 2,
              getParameter: (p: number) => (p === 1 ? 'Mozilla' : 'Radeon R9 200 Series, or similar'),
              getExtension: () => null,
            }
          : null,
    }),
    offlineAudio: () => null,
  })),
}))
vi.mock('@/tools/fingerprint/environment', () => ({ browserEnvironment: browser.build }))

import { profile } from '@/content'
import type { Localised } from '@/content/types'
import { startPresence, stopPresence } from '@/composables/usePresence'
import { uptimeSeconds } from '@/composables/useStatus'
import { observeRequests } from '@/lib/api'
import { ROWS, SHELL_GROUPS, readNow, type FingerprintEnv } from '@/tools/fingerprint/fingerprint'
import { resolveFileLines } from '../commands/files'
import { procFiles } from '../commands/proc'
import { resolve } from '../registry'
import { runCommand } from './context'

const cat = resolve('cat')!
const ls = resolve('ls')!
const en = <T,>(value: Localised<T>): T => value.en

/** A stream that delivers what the test says, and counts how often one was opened. */
class FakeSource {
  static opened = 0
  static last: FakeSource | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  constructor() {
    FakeSource.opened++
    FakeSource.last = this
  }
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  FakeSource.opened = 0
  FakeSource.last = null
  vi.stubGlobal('EventSource', FakeSource)
})

afterEach(() => {
  stopPresence()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('/proc/version', () => {
  it('is uname’s line, with the build it came from', async () => {
    const uname = (await runCommand(resolve('uname')!)).text
    const { text } = await runCommand(cat, ['/proc/version'])
    expect(uname).toBe(`couvsh 1.0 ${profile.domain} x86_64 GNU/Portfolio`)
    expect(text).toBe(`${uname} #dev 2026-01-01T00:00:00.000Z`)
  })
})

describe('/proc/uptime', () => {
  it('is the real format: seconds up since the first commit, then seconds idle', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'))
    const { text } = await runCommand(cat, ['/proc/uptime'])
    const [up, idle] = text.split(' ').map(Number) as [number, number]
    expect(text).toMatch(/^\d+\.\d{2} \d+\.\d{2}$/)
    expect(up).toBeCloseTo(uptimeSeconds(), 1)
    expect(up).toBeCloseTo((Date.parse('2026-10-14T12:00:00Z') - Date.parse(profile.since)) / 1000, 1)
    // Idle is the uptime less this tab's life, which is never more than the uptime.
    expect(idle).toBeLessThanOrEqual(up)
    expect(idle).toBeGreaterThan(up - 3600)
  })
})

describe('/proc/loadavg', () => {
  it('says presence is not connected, and does not connect it', async () => {
    const traced: unknown[] = []
    const stop = observeRequests((trace) => traced.push(trace))
    const { lines } = await runCommand(cat, ['/proc/loadavg'])
    stop()
    expect(lines[0]!.text).toMatch(/isn’t connected on this page.*`who` does/)
    expect(lines[0]!.tone).toBe('muted')
    // What `strace cat /proc/loadavg` reads: no request, and no stream opened behind it.
    expect(traced).toEqual([])
    expect(FakeSource.opened).toBe(0)
  })

  it('reads the count when the page already has it, in loadavg’s fields', async () => {
    startPresence()
    FakeSource.last!.onmessage!({ data: JSON.stringify({ online: 3 }) } as MessageEvent)
    const { lines } = await runCommand(cat, ['/proc/loadavg'])
    expect(lines[0]).toMatchObject({ text: '3.00 3.00 3.00 1/3', pre: true })
    expect(lines[1]!.text).toContain('3 on the site now, you included')
    expect(FakeSource.opened).toBe(1)
  })

  it('reads in French too', async () => {
    const { text } = await runCommand(cat, ['/proc/loadavg'], { locale: 'fr' })
    expect(text).toContain('`who` le fait')
  })
})

describe('/proc/self', () => {
  const fake = () => browser.build() as unknown as FingerprintEnv

  // The point of reading the tool's module: the panel and `cat` print the same values.
  it.each([...SHELL_GROUPS])('/proc/self/%s is the fingerprint tool’s %s group', async (group) => {
    const { lines } = await runCommand(cat, [`/proc/self/${group}`])
    const rows = readNow(fake(), [group])
    expect(rows.length).toBeGreaterThan(0)
    for (const [i, row] of rows.entries()) {
      expect(lines[i]!.text).toMatch(new RegExp(`^${row.id} +${(row.value ?? 'not available').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
    }
    expect(lines.at(-1)).toMatchObject({ href: '/tools/fingerprint' })
  })

  it('prints exactly the values the panel would', async () => {
    const { text } = await runCommand(cat, ['/proc/self/screen'])
    expect(text).toContain('screen_size   2560×1440')
    expect(text).toContain('pixel_ratio   2')
    expect(text).toContain('colour_depth  30')
    expect((await runCommand(cat, ['/proc/self/gpu'])).text).toContain('webgl_renderer  Radeon R9 200 Series, or similar')
  })

  it('says which rows this browser does not give, in the visitor’s language', async () => {
    expect((await runCommand(cat, ['/proc/self/hardware'])).text).toContain('memory_gb     not available')
    expect((await runCommand(cat, ['/proc/self/hardware'], { locale: 'fr' })).text).toContain('memory_gb     non disponible')
  })

  it('reads every row of its groups at once, since cat cannot wait on a render', () => {
    for (const group of SHELL_GROUPS) {
      expect(readNow(fake(), [group]).length, group).toBe(ROWS.filter((row) => row.group === group).length)
    }
  })

  it('reads the browser only when a /proc/self file is read', async () => {
    browser.build.mockClear()
    await runCommand(cat, ['/proc/version'])
    await runCommand(cat, ['/proc/uptime'])
    await runCommand(ls, ['/proc/self'])
    cat.complete!({ args: ['/proc/'], index: 0, word: '/proc/' })
    expect(browser.build).not.toHaveBeenCalled()
    await runCommand(cat, ['/proc/self/locale'])
    expect(browser.build).toHaveBeenCalledTimes(1)
  })

  it('has no file for a group the shell does not show', async () => {
    expect((await runCommand(cat, ['/proc/self/render'])).lines[0]).toMatchObject({ tone: 'error', stderr: true })
    expect(resolveFileLines('/proc/self/', en)).toBeUndefined()
  })
})

describe('ls /proc', () => {
  it('lists self/ and the three files, then self’s four', async () => {
    expect((await runCommand(ls, ['/proc'])).text.split('\n')).toEqual(['self/', 'loadavg', 'uptime', 'version'])
    expect((await runCommand(ls, ['/proc/'])).text.split('\n')).toEqual(['self/', 'loadavg', 'uptime', 'version'])
    expect((await runCommand(ls, ['/proc/self'])).text.split('\n')).toEqual(['gpu', 'hardware', 'locale', 'screen'])
  })

  it('names a file it is given, and refuses what is not there', async () => {
    expect((await runCommand(ls, ['/proc/uptime'])).text).toBe('/proc/uptime')
    expect((await runCommand(ls, ['/proc/nope'])).lines[0]).toMatchObject({ tone: 'error', stderr: true })
  })

  it('leaves the home directory as it was: no proc/ in ls /', async () => {
    expect((await runCommand(ls, ['/'])).text).not.toContain('proc')
  })

  // `..` is folded before the path is matched, so a way out of `/proc` lists where `cd`
  // takes it, and one that stays inside lists what it reaches.
  it('reads . and .. in and out of /proc, as cd does', async () => {
    const listing = async (path: string) => (await runCommand(ls, [path])).text
    const cd = async (path: string) => (await runCommand(resolve('cd')!, [path])).navigated
    expect(await listing('/proc/..')).toBe(await listing('/'))
    expect(await cd('/proc/..')).toEqual([''])
    expect(await listing('/proc/../tools')).toBe(await listing('tools'))
    expect(await cd('/proc/../tools')).toEqual(['tools'])
    expect(await listing('/proc/self/..')).toBe(await listing('/proc'))
    expect(await listing('/proc/./self/')).toBe(await listing('/proc/self'))
  })
})

describe('Tab', () => {
  it('offers /proc to cat only once the word reaches into it', () => {
    expect(cat.complete!({ args: [''], index: 0, word: '' }).some((f) => f.startsWith('/proc'))).toBe(false)
    expect(cat.complete!({ args: ['/proc/'], index: 0, word: '/proc/' })).toEqual(expect.arrayContaining(procFiles()))
    expect(procFiles()).toEqual([
      '/proc/loadavg',
      '/proc/uptime',
      '/proc/version',
      '/proc/self/gpu',
      '/proc/self/hardware',
      '/proc/self/locale',
      '/proc/self/screen',
    ])
  })

  it('offers ls the two directories to a word that starts at the root', () => {
    expect(ls.complete!({ args: [''], index: 0, word: '' })).not.toContain('/proc/')
    expect(ls.complete!({ args: ['/'], index: 0, word: '/' })).toEqual(expect.arrayContaining(['/proc/', '/proc/self/']))
  })

  it('every file it offers resolves', () => {
    for (const file of procFiles()) expect(resolveFileLines(file, en), file).toBeDefined()
  })
})
