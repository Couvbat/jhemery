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

    it('never goes off under reduced motion', async () => {
      motion.reduced = true
      const { setTheme } = await load()

      setTheme('catppuccin-latte')

      expect(root.classList.contains('theme-flash')).toBe(false)
      expect(root.dataset.mode).toBe('light')
    })
  })
})
