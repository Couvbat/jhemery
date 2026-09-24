import { computed, ref } from 'vue'
import { DEFAULT_THEME, findTheme, themes, themeTokens, type Theme } from '@/lib/themes'
import { prefersReducedMotion } from './useCrt'

const STORAGE_KEY = 'couvbat:theme'
/** Matches the `theme-flash` keyframes in main.css. */
const FLASH_MS = 900

const defaultTheme = findTheme(DEFAULT_THEME)!
/** Every property any scheme writes — all schemes derive the same set. */
const TOKEN_NAMES = Object.keys(themeTokens(defaultTheme))

// Module-level, like the locale: one scheme for the whole page, not one per caller.
const current = ref<Theme>(defaultTheme)

/** `index.html`'s own `theme-color`, captured before the first override so the
 *  default can put back exactly what shipped. */
let shippedThemeColour: string | null = null
let flashTimer: ReturnType<typeof setTimeout> | undefined

function paint(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  shippedThemeColour ??= meta?.content ?? null

  // The default clears rather than writes: `:root` in main.css stays the only place
  // it is defined, and a visitor who never types `theme` gets the page as shipped.
  if (theme.id === DEFAULT_THEME) {
    for (const name of TOKEN_NAMES) root.style.removeProperty(name)
    root.style.removeProperty('color-scheme')
    delete root.dataset.theme
    delete root.dataset.mode
    if (meta && shippedThemeColour) meta.content = shippedThemeColour
    return
  }

  for (const [name, value] of Object.entries(themeTokens(theme))) root.style.setProperty(name, value)
  // Native scrollbars, form controls and autofill follow the scheme, not the OS.
  root.style.setProperty('color-scheme', theme.mode)
  root.dataset.theme = theme.id
  root.dataset.mode = theme.mode
  if (meta) meta.content = theme.colours.background
}

/**
 * The white-out on a dark-to-light switch — the joke the `flashbang` achievement is
 * named after. One flash, never repeated, and skipped under reduced motion.
 */
function flash() {
  if (prefersReducedMotion() || typeof document === 'undefined') return
  const root = document.documentElement
  clearTimeout(flashTimer)
  root.classList.remove('theme-flash')
  // Restarts the animation when a second switch lands mid-flash.
  void root.offsetWidth
  root.classList.add('theme-flash')
  flashTimer = setTimeout(() => root.classList.remove('theme-flash'), FLASH_MS)
}

/** Applies and saves a scheme. Returns it, or `null` for an id no scheme has. */
export function setTheme(id: string): Theme | null {
  const next = findTheme(id)
  if (!next) return null

  const from = current.value
  paint(next)
  current.value = next
  if (from.mode === 'dark' && next.mode === 'light') flash()

  try {
    if (next.id === DEFAULT_THEME) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, next.id)
  } catch {
    // Private browsing or a full quota — the scheme just won't survive a reload.
  }
  return next
}

/**
 * Re-applies a saved scheme. Called from `main.ts` before the app mounts, so a
 * returning visitor's first painted frame is already in their colours — and without
 * the flash, which is for the switch, not for every page load after it.
 */
export function restoreTheme() {
  if (typeof window === 'undefined') return
  let stored: string | null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  const theme = stored ? findTheme(stored) : undefined
  if (!theme) return
  paint(theme)
  current.value = theme
}

export function useTheme() {
  return {
    theme: computed(() => current.value),
    themes,
    setTheme,
  }
}
