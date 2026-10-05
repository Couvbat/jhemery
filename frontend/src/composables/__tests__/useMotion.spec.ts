import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const STORAGE_KEY = 'couvbat:motion'
const root = document.documentElement

/**
 * The OS setting through a stubbed `matchMedia`, so the real `prefersReducedMotion()`
 * reads it and `change` can be fired the way a browser fires it.
 */
const os = { reduce: false, listeners: [] as Array<() => void> }

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      get matches() {
        return os.reduce
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => os.listeners.push(listener),
    })),
  )
}

function osChanges(reduce: boolean) {
  os.reduce = reduce
  for (const listener of os.listeners) listener()
}

/** The setting is module-level and restored before mount, so each test is a page load. */
async function load() {
  vi.resetModules()
  return import('../useMotion')
}

beforeEach(() => {
  window.localStorage.clear()
  delete root.dataset.motion
  os.reduce = false
  os.listeners = []
  stubMatchMedia()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMotion', () => {
  it('starts at full, and leaves no trace of it', async () => {
    const { restoreMotion, useMotion, decorativeMotion } = await load()
    restoreMotion()

    expect(useMotion().level.value).toBe('full')
    expect(decorativeMotion()).toBe('full')
    expect(root.dataset.motion).toBeUndefined()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('writes a setting on <html> and remembers it; full clears both', async () => {
    const { setMotion, useMotion } = await load()

    expect(setMotion('calm')).toBe('calm')
    expect(root.dataset.motion).toBe('calm')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('calm')
    expect(useMotion().level.value).toBe('calm')

    setMotion('full')
    expect(root.dataset.motion).toBeUndefined()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('restores a saved setting before mount', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'paused')
    const { restoreMotion, useMotion } = await load()

    restoreMotion()

    expect(useMotion().level.value).toBe('paused')
    expect(root.dataset.motion).toBe('paused')
  })

  it('ignores a stored value that is not a setting', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'ludicrous')
    const { restoreMotion, useMotion } = await load()

    restoreMotion()

    expect(useMotion().level.value).toBe('full')
    expect(root.dataset.motion).toBeUndefined()
  })

  // The OS setting is a floor: the visitor can ask for more, and is told why they don't get it.
  it('holds the level at paused under reduced motion, and keeps the choice for later', async () => {
    os.reduce = true
    const { setMotion, useMotion, decorativeMotion } = await load()
    const motion = useMotion()

    expect(setMotion('full')).toBe('paused')
    expect(decorativeMotion()).toBe('paused')
    expect(motion.level.value).toBe('paused')
    expect(motion.setting.value).toBe('full')
    expect(motion.osReduced.value).toBe(true)
  })

  it('follows the OS setting when it changes under an open page', async () => {
    const { restoreMotion, setMotion, useMotion } = await load()
    restoreMotion()
    setMotion('calm')
    const { level, osReduced } = useMotion()
    expect(level.value).toBe('calm')

    osChanges(true)
    await nextTick()
    expect(level.value).toBe('paused')
    expect(osReduced.value).toBe(true)

    osChanges(false)
    await nextTick()
    expect(level.value).toBe('calm')
  })

  it('survives storage that throws', async () => {
    const { restoreMotion, setMotion, useMotion } = await load()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => restoreMotion()).not.toThrow()
    expect(setMotion('paused')).toBe('paused')
    expect(useMotion().level.value).toBe('paused')
  })
})
