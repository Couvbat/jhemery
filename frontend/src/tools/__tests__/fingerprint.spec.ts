import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SRC, resolveImport, runtimeImports, scriptOf, sourceFiles } from '@/__tests__/imports'
import {
  GROUPS,
  ROWS,
  combinedHash,
  readLater,
  readNow,
  type FingerprintEnv,
  type Reading,
} from '../fingerprint/fingerprint'

// jsdom has `crypto.getRandomValues` but no `subtle`; Node's is the same Web Crypto.
const subtle = webcrypto.subtle as SubtleCrypto

const UNMASKED_VENDOR = 0x9245
const UNMASKED_RENDERER = 0x9246

/** A WebGL context that answers like Chromium: masked plain strings, real ones behind
 *  the debug extension. */
function fakeGl(plain = { vendor: 'WebKit', renderer: 'WebKit WebGL' }) {
  const asked: string[] = []
  /** The parameters read, by their constants' names. */
  const read: string[] = []
  const lost = vi.fn()
  const names: Record<number, string> = {
    0x1f00: 'VENDOR',
    0x1f01: 'RENDERER',
    [UNMASKED_VENDOR]: 'UNMASKED_VENDOR_WEBGL',
    [UNMASKED_RENDERER]: 'UNMASKED_RENDERER_WEBGL',
  }
  const gl = {
    VENDOR: 0x1f00,
    RENDERER: 0x1f01,
    getParameter: (p: number) => {
      read.push(names[p] ?? String(p))
      return {
        0x1f00: plain.vendor,
        0x1f01: plain.renderer,
        [UNMASKED_VENDOR]: 'Google Inc. (Intel)',
        [UNMASKED_RENDERER]: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620)',
      }[p]
    },
    getExtension: (name: string) => {
      asked.push(name)
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR, UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER }
      }
      return name === 'WEBGL_lose_context' ? { loseContext: lost } : null
    },
  }
  return { gl, asked, read, lost }
}

/** A canvas whose pixels are the calls made on it, so the same drawing reads back the
 *  same and a different font reads back differently, as a real one would. */
function fakeCanvas(gl: unknown = fakeGl().gl, font = '') {
  const calls: string[] = []
  const ctx = new Proxy(
    {},
    {
      get: (_, key) => (...args: unknown[]) => void calls.push(`${String(key)}(${args.join(',')})`),
      set: (_, key, value) => (calls.push(`${String(key)}=${value}${key === 'font' ? font : ''}`), true),
    },
  )
  return {
    width: 0,
    height: 0,
    getContext: (kind: string) => (kind === '2d' ? ctx : kind === 'webgl' ? gl : null),
    toDataURL: () => `data:,${encodeURIComponent(calls.join(';'))}`,
  } as unknown as HTMLCanvasElement
}

function fakeAudio(render: () => Promise<unknown> = async () => ({ getChannelData: () => Float32Array.from({ length: 5000 }, (_, i) => Math.sin(i)) })) {
  const param = () => ({ value: 0 })
  return {
    destination: {},
    createOscillator: () => ({ type: 'sine', frequency: param(), connect() {}, start() {} }),
    createDynamicsCompressor: () => ({
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      connect() {},
    }),
    startRendering: render,
  } as unknown as OfflineAudioContext
}

class ParisTime {
  resolvedOptions() {
    return { timeZone: 'Europe/Paris' }
  }
}

const MATCHING = new Set(['(prefers-color-scheme: dark)', '(prefers-reduced-motion: no-preference)', '(prefers-contrast: no-preference)'])

function browser(overrides: Partial<FingerprintEnv> = {}): FingerprintEnv {
  return {
    navigator: {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0',
      language: 'fr-FR',
      languages: ['fr-FR', 'en-GB'],
      hardwareConcurrency: 8,
      maxTouchPoints: 0,
      deviceMemory: 8,
      userAgentData: {
        brands: [{ brand: 'Chromium', version: '140' }],
        mobile: false,
        platform: 'Linux',
        getHighEntropyValues: async () => ({
          platform: 'Linux',
          platformVersion: '6.8.0',
          architecture: 'x86',
          bitness: '64',
          model: '',
          fullVersionList: [{ brand: 'Chromium', version: '140.0.7339.80' }],
        }),
      },
    },
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    devicePixelRatio: 1.25,
    matchMedia: (query) => ({ matches: MATCHING.has(query) }),
    intl: { DateTimeFormat: ParisTime as unknown as typeof Intl.DateTimeFormat },
    canvas: () => fakeCanvas(),
    offlineAudio: () => fakeAudio(),
    subtle,
    ...overrides,
  }
}

/** jsdom, as far as this module can tell: no canvas, no audio, a bare navigator. */
function bare(): FingerprintEnv {
  return {
    navigator: {},
    intl: { DateTimeFormat: class { resolvedOptions() { return {} } } as unknown as typeof Intl.DateTimeFormat },
    canvas: () => null,
    offlineAudio: () => null,
    subtle,
  }
}

const valueOf = (readings: Reading[], id: string) => readings.find((r) => r.id === id)?.value

afterEach(() => {
  vi.useRealTimers()
})

describe('the rows', () => {
  it('give every row a unique id, a source, a verdict, and words in both languages', () => {
    const ids = ROWS.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const row of ROWS) {
      expect(row.id, row.id).toMatch(/^[a-z][a-z0-9_-]*$/)
      expect(row.source, row.id).toBeTruthy()
      expect(['common', 'rare', 'none'], row.id).toContain(row.verdict)
      for (const text of [row.label, row.use]) {
        expect(text.en, row.id).toBeTruthy()
        expect(text.fr, row.id).toBeTruthy()
      }
      // A label may read the same in French ("User agent"); what a row is for may not.
      expect(row.use.fr, row.id).not.toBe(row.use.en)
      expect(GROUPS[row.group], row.id).toBeDefined()
    }
  })

  it('cover what the roadmap lists, and nothing that needs a prompt', () => {
    expect(ROWS.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        'user_agent', 'client_hints', 'languages', 'time_zone', 'screen_size', 'pixel_ratio',
        'colour_depth', 'cores', 'memory_gb', 'touch_points', 'prefers-color-scheme',
        'prefers-reduced-motion', 'webgl_renderer', 'canvas', 'audio',
      ]),
    )
    // Permission-gated APIs would put a prompt in front of the visitor: never here.
    const source = readFileSync(join(process.cwd(), 'src/tools/fingerprint/fingerprint.ts'), 'utf8')
    for (const gated of ['geolocation', 'getUserMedia', 'permissions', 'enumerateDevices', 'getBattery', 'bluetooth', 'usb']) {
      expect(source, gated).not.toContain(gated)
    }
  })
})

describe('reading a browser', () => {
  it('reads each value as the browser gives it, without translating it', () => {
    const now = readNow(browser())
    expect(valueOf(now, 'user_agent')).toBe('Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0')
    expect(valueOf(now, 'client_hints')).toBe('Chromium 140 · Linux')
    expect(valueOf(now, 'languages')).toBe('fr-FR, en-GB')
    expect(valueOf(now, 'time_zone')).toBe('Europe/Paris')
    expect(valueOf(now, 'screen_size')).toBe('1920×1080')
    expect(valueOf(now, 'pixel_ratio')).toBe('1.25')
    expect(valueOf(now, 'colour_depth')).toBe('24')
    expect(valueOf(now, 'cores')).toBe('8')
    expect(valueOf(now, 'memory_gb')).toBe('8')
    expect(valueOf(now, 'touch_points')).toBe('0')
    expect(valueOf(now, 'prefers-color-scheme')).toBe('dark')
    expect(valueOf(now, 'prefers-reduced-motion')).toBe('no-preference')
    expect(valueOf(now, 'prefers-contrast')).toBe('no-preference')
    // A media feature the browser doesn't know matches none of its values.
    expect(valueOf(now, 'prefers-reduced-transparency')).toBeNull()
  })

  it('unmasks the WebGL strings Chromium and Safari hide, and lets the context go', () => {
    const { gl, lost } = fakeGl()
    const now = readNow(browser({ canvas: () => fakeCanvas(gl) }))
    expect(valueOf(now, 'webgl_vendor')).toBe('Google Inc. (Intel)')
    expect(valueOf(now, 'webgl_renderer')).toBe('ANGLE (Intel, Mesa Intel(R) UHD Graphics 620)')
    expect(lost).toHaveBeenCalledTimes(1)
  })

  it('opens one WebGL context for both of its rows', () => {
    const canvas = vi.fn(() => fakeCanvas())
    readNow(browser({ canvas }))
    expect(canvas).toHaveBeenCalledTimes(1)
  })

  it('takes plain strings as they are, never asking Firefox for the deprecated extension', () => {
    const { gl, asked } = fakeGl({ vendor: 'Mozilla', renderer: 'Intel(R) HD Graphics, or similar' })
    const now = readNow(browser({ canvas: () => fakeCanvas(gl) }))
    expect(valueOf(now, 'webgl_renderer')).toBe('Intel(R) HD Graphics, or similar')
    expect(asked).not.toContain('WEBGL_debug_renderer_info')
  })

  // A row's source is static, so it has to name whichever way this browser was read: the
  // extension alone named, in Firefox, an API the page never called.
  it.each([
    ['Chromium', undefined],
    ['Firefox', { vendor: 'Mozilla', renderer: 'Intel(R) HD Graphics, or similar' }],
  ])('names in each WebGL row every parameter %s is read for', (_browser, plain) => {
    const { gl, read } = fakeGl(plain)
    readNow(browser({ canvas: () => fakeCanvas(gl) }), ['gpu'])
    for (const [id, kind] of [['webgl_vendor', 'VENDOR'], ['webgl_renderer', 'RENDERER']] as const) {
      const { source } = ROWS.find((row) => row.id === id)!
      const params = read.filter((name) => name === kind || name === `UNMASKED_${kind}_WEBGL`)
      expect(params.length, id).toBeGreaterThan(0)
      for (const param of params) expect(source, id).toMatch(new RegExp(`\\b${param}\\b`))
    }
  })

  it('renders the canvas and the audio into short hashes, the same each time', async () => {
    const first = await readLater(browser())
    const second = await readLater(browser())
    expect(valueOf(first, 'canvas')).toMatch(/^[0-9a-f]{16}$/)
    expect(valueOf(first, 'audio')).toMatch(/^[0-9a-f]{16}$/)
    expect(first.map((r) => r.value)).toEqual(second.map((r) => r.value))
    expect(valueOf(first, 'client_hints_full')).toBe('Linux 6.8.0 · x86 64-bit · Chromium 140.0.7339.80')
  })

  it('tells two canvases that draw differently apart', async () => {
    const other = await readLater(browser({ canvas: () => fakeCanvas(fakeGl().gl, ' (fallback)') }))
    expect(valueOf(other, 'canvas')).not.toBe(valueOf(await readLater(browser()), 'canvas'))
  })

  it('gives up on an audio render that never finishes', async () => {
    vi.useFakeTimers()
    const later = readLater(browser({ offlineAudio: () => fakeAudio(() => new Promise(() => {})) }))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(valueOf(await later, 'audio')).toBeNull()
  })

  it('reads the renders and the requested hints later, and everything else at once', async () => {
    const now = readNow(browser()).map((r) => r.id)
    const later = (await readLater(browser())).map((r) => r.id)
    expect(later.sort()).toEqual(['audio', 'canvas', 'client_hints_full'])
    expect(now.filter((id) => later.includes(id))).toEqual([])
    expect(now.length + later.length).toBe(ROWS.length)
  })

  it('reads only the groups asked for, in order', () => {
    expect(readNow(browser(), ['screen', 'locale']).map((r) => r.id)).toEqual([
      'languages',
      'time_zone',
      'screen_size',
      'pixel_ratio',
      'colour_depth',
    ])
  })
})

describe('a browser that gives little', () => {
  it('reads as not available in jsdom, row by row, rather than throwing', async () => {
    const now = readNow(bare())
    const later = await readLater(bare())
    expect([...now, ...later].filter((r) => r.value !== null).map((r) => r.id)).toEqual([])
    expect(now.length + later.length).toBe(ROWS.length)
  })

  it('turns whatever a browser throws into not available', async () => {
    const throwing = (): never => {
      throw new DOMException('blocked', 'SecurityError')
    }
    const env = browser({
      navigator: new Proxy({}, { get: throwing }),
      matchMedia: throwing,
      canvas: throwing,
      offlineAudio: throwing,
      intl: { DateTimeFormat: throwing as unknown as typeof Intl.DateTimeFormat },
    })
    const all = [...readNow(env), ...(await readLater(env))]
    expect(all.filter((r) => r.value !== null).map((r) => r.id)).toEqual(['screen_size', 'pixel_ratio', 'colour_depth'])
  })

  it('has no render hashes without Web Crypto, which only a secure page gets', async () => {
    const later = await readLater(browser({ subtle: undefined }))
    expect(valueOf(later, 'canvas')).toBeNull()
    expect(valueOf(later, 'audio')).toBeNull()
  })
})

describe('the combined hash', () => {
  const readings = async () => [...readNow(browser()), ...(await readLater(browser()))]

  it('is a SHA-256, the same for the same browser', async () => {
    const a = await combinedHash(await readings(), subtle)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await combinedHash(await readings(), subtle)).toBe(a)
  })

  it('changes when any one row that feeds it is left out', async () => {
    const all = await readings()
    const whole = await combinedHash(all, subtle)
    const fed = all.filter((r) => r.value !== null)
    const without = await Promise.all(fed.map((row) => combinedHash(all.filter((r) => r !== row), subtle)))
    expect(without).not.toContain(whole)
    expect(new Set(without).size).toBe(fed.length)
  })

  it('is not changed by a row this browser does not give', async () => {
    const all = await readings()
    const missing = all.filter((r) => r.value === null)
    expect(missing.length).toBeGreaterThan(0)
    expect(await combinedHash(all.filter((r) => r.value !== null), subtle)).toBe(await combinedHash(all, subtle))
  })

  it('is null with nothing to hash, or nothing to hash with', async () => {
    expect(await combinedHash(readNow(bare()), subtle)).toBeNull()
    expect(await combinedHash(await readings(), undefined)).toBeNull()
  })
})

/**
 * Every module the tool runs, relative to `src/`: its folder, then each file's runtime
 * imports, followed through the site's own source as far as they go. Vue is the one
 * package it may use; any other, or an import the walk can't open, is listed rather than
 * skipped, since a module nobody read can't be vouched for. A dynamic `import()` is not
 * followed, which is why the scan below refuses one outright.
 */
function reach(roots: readonly string[]): { files: string[]; unread: string[] } {
  const files = new Set<string>()
  const unread: string[] = []
  const queue = [...roots]
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (files.has(file)) continue
    files.add(file)
    for (const specifier of runtimeImports(scriptOf(file))) {
      if (specifier === 'vue') continue
      const target = resolveImport(file, specifier)
      if (target) queue.push(target)
      else unread.push(`${relative(SRC, file)} imports ${specifier}`)
    }
  }
  return { files: [...files].map((path) => relative(SRC, path)).sort(), unread }
}

const TOOL = reach(sourceFiles(join(SRC, 'tools/fingerprint')))

describe('what the tool never does', () => {
  it('makes no request while it reads, renders and hashes', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const beacon = vi.fn()
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    try {
      const env = browser()
      await combinedHash([...readNow(env), ...(await readLater(env))], subtle)
    } finally {
      vi.unstubAllGlobals()
      delete (navigator as { sendBeacon?: unknown }).sendBeacon
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
  })

  // The spy above only sees the paths a fake browser takes. The source has no way to
  // send at all: no network API in the tool, nor in anything it imports, however far
  // down. An allow-list of specifiers let any `../` through unread.
  it('reads every module the tool runs, out of its folder too', () => {
    expect(TOOL.unread).toEqual([])
    expect(TOOL.files).toEqual(
      expect.arrayContaining(['tools/hash/hash.ts', 'tools/ToolFrame.vue', 'components/WindowDots.vue', 'i18n/index.ts']),
    )
  })

  it.each(TOOL.files)('%s names no network API', (file) => {
    const code = readFileSync(join(SRC, file), 'utf8')
    for (const api of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', '@/lib/api', 'import(']) {
      expect(code, `${file} uses ${api}`).not.toContain(api)
    }
  })

  // The site reads these only when the panel or `/proc/self` asks: the real browser is
  // handed over in one place, and only those two may call for it.
  it('hands the real browser only to the panel and /proc', () => {
    const callers = sourceFiles(SRC)
      .filter((path) => /fingerprint\/environment'|\.\/environment'/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(SRC, path))
    expect(callers.sort()).toEqual(['terminal/commands/proc.ts', 'tools/fingerprint/FingerprintTool.vue'])
  })
})
