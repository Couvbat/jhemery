import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/composables/useCrt', () => ({ prefersReducedMotion: () => motion.reduced }))

const STORAGE_KEY = 'couvbat:theme'
const SHIPPED = '#0d0f0d'
const root = document.documentElement

/**
 * The scheme is a module-level ref hydrated by `restoreTheme()`, so every test takes a
 * fresh copy of the module — the same shape as a page load.
 */
async function load() {
  vi.resetModules()
  return import('../useTheme')
}

function meta(): HTMLMetaElement {
  return document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!
}

beforeEach(() => {
  window.localStorage.clear()
  root.removeAttribute('style')
  root.removeAttribute('data-theme')
  root.removeAttribute('data-mode')
  root.classList.remove('theme-flash')
  document.head.innerHTML = `<meta name="theme-color" content="${SHIPPED}">`
  motion.reduced = false
})

afterEach(() => {
  vi.useRealTimers()
  delete (document as Partial<Document>).startViewTransition
})

describe('useTheme', () => {
  it('writes a scheme over the stylesheet and remembers it', async () => {
    const { setTheme, useTheme } = await load()

    expect(setTheme('gruvbox')?.name).toBe('Gruvbox')

    expect(root.style.getPropertyValue('--background')).toBe('#282828')
    expect(root.style.getPropertyValue('--neon-green')).toBe('#fe8019')
    expect(root.dataset.theme).toBe('gruvbox')
    expect(root.dataset.mode).toBe('dark')
    expect(meta().content).toBe('#282828')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('gruvbox')
    expect(useTheme().theme.value.id).toBe('gruvbox')
  })

  // The default lives in main.css; going back to it has to leave no trace of the
  // scheme before, or a later edit to `:root` would be silently shadowed for anyone
  // who ever typed `theme`.
  it('goes back to the default by removing every override', async () => {
    const { setTheme } = await load()
    setTheme('nord')

    setTheme('cyberpunk')

    expect(root.style.getPropertyValue('--background')).toBe('')
    expect(root.style.getPropertyValue('--neon-green')).toBe('')
    expect(root.dataset.theme).toBeUndefined()
    expect(root.dataset.mode).toBeUndefined()
    expect(meta().content).toBe(SHIPPED)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('refuses a scheme that does not exist and leaves the page alone', async () => {
    const { setTheme, useTheme } = await load()
    setTheme('dracula')

    expect(setTheme('windows-xp')).toBeNull()

    expect(useTheme().theme.value.id).toBe('dracula')
    expect(root.dataset.theme).toBe('dracula')
  })

  it('restores a saved scheme on the next load, without the flash', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'catppuccin-latte')
    const { restoreTheme, useTheme } = await load()

    restoreTheme()

    expect(useTheme().theme.value.id).toBe('catppuccin-latte')
    expect(root.dataset.mode).toBe('light')
    expect(root.style.getPropertyValue('--background')).toBe('#eff1f5')
    expect(root.classList.contains('theme-flash')).toBe(false)
  })

  it('ignores a saved id no scheme has any more', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'removed-in-a-later-release')
    const { restoreTheme, useTheme } = await load()

    restoreTheme()

    expect(useTheme().theme.value.id).toBe('cyberpunk')
    expect(root.getAttribute('style')).toBeNull()
  })

  describe('the flashbang', () => {
    it('whites the page out on a switch from dark to light, then clears', async () => {
      vi.useFakeTimers()
      const { setTheme } = await load()

      setTheme('gruvbox')
      expect(root.classList.contains('theme-flash')).toBe(false)

      setTheme('gruvbox-light')
      expect(root.classList.contains('theme-flash')).toBe(true)

      vi.advanceTimersByTime(900)
      expect(root.classList.contains('theme-flash')).toBe(false)
    })

    it('does not go off between two light schemes', async () => {
      const { setTheme } = await load()
      setTheme('gruvbox-light')
      root.classList.remove('theme-flash')

      setTheme('catppuccin-latte')

      expect(root.classList.contains('theme-flash')).toBe(false)
    })

    it('never goes off under calm or paused motion', async () => {
      const { setTheme } = await load()
      const { setMotion } = await import('../useMotion')
      for (const level of ['calm', 'paused'] as const) {
        setMotion(level)
        setTheme('nord')
        setTheme('catppuccin-latte')
        expect(root.classList.contains('theme-flash'), level).toBe(false)
      }
      setMotion('full')
    })

    it('never goes off under reduced motion', async () => {
      motion.reduced = true
      const { setTheme } = await load()

      setTheme('catppuccin-latte')

      expect(root.classList.contains('theme-flash')).toBe(false)
      expect(root.dataset.mode).toBe('light')
    })
  })
})

/**
 * The circle a new scheme spreads in. jsdom has no `startViewTransition`, so it is
 * stubbed on `document` as a browser that runs the callback when told to: what these
 * pin is when the circle is asked for at all, and that the page is painted inside it.
 * That it really draws, leaves no overlay and trips no CSP is the e2e's to show.
 */
describe('the theme circle', () => {
  function stubTransitions() {
    const callbacks: Array<() => void> = []
    const skipped: number[] = []
    const start = vi.fn((callback: () => void) => {
      const index = callbacks.push(callback) - 1
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => skipped.push(index),
      }
    })
    ;(document as unknown as { startViewTransition: typeof start }).startViewTransition = start
    return { start, callbacks, skipped }
  }

  it('spreads a dark-to-dark switch, painting inside the transition', async () => {
    const { setTheme, useTheme } = await load()
    const { start, callbacks } = stubTransitions()

    expect(setTheme('dracula', { origin: { x: 40, y: 12 } })?.id).toBe('dracula')
    expect(start).toHaveBeenCalledOnce()
    // Saved at once; painted only when the browser has its snapshot of the old page.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dracula')
    expect(root.dataset.theme).toBeUndefined()

    callbacks[0]!()
    expect(root.dataset.theme).toBe('dracula')
    expect(useTheme().theme.value.id).toBe('dracula')
  })

  it('leaves dark to light to the flashbang', async () => {
    const { setTheme } = await load()
    const { start } = stubTransitions()

    setTheme('gruvbox-light')

    expect(start).not.toHaveBeenCalled()
    expect(root.dataset.theme).toBe('gruvbox-light')
    expect(root.classList.contains('theme-flash')).toBe(true)
  })

  it('spreads a light-to-dark switch, which has no flash to keep', async () => {
    const { setTheme } = await load()
    setTheme('catppuccin-latte')
    const { start } = stubTransitions()

    setTheme('nord')

    expect(start).toHaveBeenCalledOnce()
  })

  it('never runs under calm, paused or reduced motion, and the page repaints at once', async () => {
    const { setTheme } = await load()
    const { setMotion } = await import('../useMotion')
    const { start } = stubTransitions()

    for (const level of ['calm', 'paused'] as const) {
      setMotion(level)
      setTheme(level === 'calm' ? 'nord' : 'dracula')
      expect(root.dataset.theme, level).toBe(level === 'calm' ? 'nord' : 'dracula')
    }
    setMotion('full')
    motion.reduced = true
    setTheme('gruvbox')
    expect(root.dataset.theme).toBe('gruvbox')

    expect(start).not.toHaveBeenCalled()
  })

  // The swing is motion enough, and a snapshot would freeze its stage mid-turn.
  it('waits out the prism: no circle while the page is turning', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const { setTheme } = await load()
    const { startSwing, useViewSwing } = await import('../useViewSwing')
    const { start } = stubTransitions()

    startSwing(1)
    expect(useViewSwing().swinging.value).toBe(true)
    setTheme('dracula')

    expect(start).not.toHaveBeenCalled()
    expect(root.dataset.theme).toBe('dracula')
    vi.unstubAllGlobals()
  })

  it('paints synchronously where the API does not exist, as before', async () => {
    const { setTheme } = await load()
    setTheme('rose-pine')
    expect(root.dataset.theme).toBe('rose-pine')
  })

  // While one runs, hit-testing goes to the root: the next pick cuts it short, and its
  // late callback must not paint the older scheme over the newer one.
  it('cuts a circle short for the next pick, and lets the newer scheme win', async () => {
    const { setTheme, useTheme } = await load()
    const { start, callbacks, skipped } = stubTransitions()

    setTheme('dracula')
    setTheme('nord')
    expect(start).toHaveBeenCalledTimes(2)
    expect(skipped).toEqual([0])

    callbacks[0]!()
    expect(root.dataset.theme).toBeUndefined()
    callbacks[1]!()
    expect(root.dataset.theme).toBe('nord')
    expect(useTheme().theme.value.id).toBe('nord')
  })
})

// What `tour` uses: a scheme shown without being chosen.
describe('previewTheme', () => {
  // A light scheme over the dark default: the one switch that would flash if it were chosen.
  it('paints a scheme without saving it or flashing, and puts the chosen one back', async () => {
    const { previewTheme, useTheme } = await load()
    const restore = previewTheme('gruvbox-light')!

    expect(root.dataset.theme).toBe('gruvbox-light')
    expect(useTheme().theme.value.id).toBe('gruvbox-light')
    expect(useTheme().chosen.value.id).toBe('cyberpunk')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(root.classList.contains('theme-flash')).toBe(false)

    restore()
    expect(root.dataset.theme).toBeUndefined()
    expect(useTheme().theme.value.id).toBe('cyberpunk')
  })

  it('lets a scheme picked during the preview win', async () => {
    const { previewTheme, setTheme, useTheme } = await load()
    const restore = previewTheme('gruvbox')!
    setTheme('nord')
    restore()
    expect(root.dataset.theme).toBe('nord')
    expect(useTheme().theme.value.id).toBe('nord')
  })

  it('refuses an unknown scheme', async () => {
    const { previewTheme } = await load()
    expect(previewTheme('nope')).toBeNull()
  })
})
