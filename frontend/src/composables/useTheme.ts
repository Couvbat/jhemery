import { computed, ref, shallowRef } from 'vue'
import { DEFAULT_THEME, findTheme, themes, themeTokens, type Theme } from '@/lib/themes'
import { decorativeMotion } from './useMotion'
import { useViewSwing } from './useViewSwing'

const STORAGE_KEY = 'couvbat:theme'
/** Matches the `theme-flash` keyframes in main.css. */
const FLASH_MS = 900
/** How long a new scheme takes to spread across the page from where it was picked. */
const CIRCLE_MS = 450

/** Where a pick happened, in viewport pixels: the circle the new scheme spreads in starts here. */
export interface ThemeOrigin {
  x: number
  y: number
}

const defaultTheme = findTheme(DEFAULT_THEME)!
/** Every property any scheme writes — all schemes derive the same set. */
const TOKEN_NAMES = Object.keys(themeTokens(defaultTheme))

// Module-level, like the locale: one scheme for the whole page, not one per caller.
const current = ref<Theme>(defaultTheme)
/**
 * A scheme painted for a moment without being chosen (`previewTheme`), or null.
 * Shallow, so it holds the object itself: the restore recognises its own preview by
 * identity, and a deep ref would hand back a proxy that never matches.
 */
const shown = shallowRef<Theme | null>(null)

/** `index.html`'s own `theme-color`, captured before the first override so the
 *  default can put back exactly what shipped. */
let shippedThemeColour: string | null = null
let flashTimer: ReturnType<typeof setTimeout> | undefined
/** The circle still spreading, if any. */
let spreading: ViewTransition | null = null
/**
 * Counts picks. A view transition runs its callback a frame or so after it is asked
 * for, and one cut short by a newer pick still runs it; the count is how that callback
 * knows a newer pick has happened and leaves the page to it.
 */
let picks = 0

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
 * named after. One flash, never repeated, and only at `full` motion: `calm` leaves it
 * out, and reduced motion forces `paused`.
 */
function flash() {
  if (decorativeMotion() !== 'full' || typeof document === 'undefined') return
  const root = document.documentElement
  clearTimeout(flashTimer)
  root.classList.remove('theme-flash')
  // Restarts the animation when a second switch lands mid-flash.
  void root.offsetWidth
  root.classList.add('theme-flash')
  flashTimer = setTimeout(() => root.classList.remove('theme-flash'), FLASH_MS)
}

/**
 * Whether a switch spreads as a circle (`document.startViewTransition`): only where the
 * API exists, only at `full` motion, not from dark to light — that one is the flashbang,
 * and a circle would hide the joke — and not while the prism turns, which is motion
 * enough, and whose stage a snapshot would freeze mid-swing.
 */
function circles(from: Theme, next: Theme): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !(from.mode === 'dark' && next.mode === 'light') &&
    decorativeMotion() === 'full' &&
    !useViewSwing().swinging.value
  )
}

/**
 * The new scheme grows as a circle from `origin` over the old one, on
 * `::view-transition-new(root)` (main.css turns the default cross-fade off). Animated
 * from here rather than in CSS so the radius can reach the farthest corner from wherever
 * the pick was; the coordinates are numbers, rounded, never anything typed.
 */
function spread(next: Theme, origin: ThemeOrigin | undefined, pick: number) {
  // While a transition runs, hit-testing goes to the root, so a circle still spreading
  // is cut short rather than left between the visitor and the next click.
  spreading?.skipTransition()
  const x = Math.round(origin?.x ?? window.innerWidth / 2)
  const y = Math.round(origin?.y ?? window.innerHeight / 2)
  const transition = document.startViewTransition(() => {
    if (pick === picks) apply(next)
  })
  spreading = transition
  const root = document.documentElement
  transition.ready.then(
    () => {
      if (typeof root.animate !== 'function') return
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${Math.ceil(radius)}px at ${x}px ${y}px)`] },
        { duration: CIRCLE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    },
    // Cut short before it was ready: there is no circle to draw.
    () => {},
  )
  const done = () => {
    if (spreading === transition) spreading = null
  }
  transition.finished.then(done, done)
}

function apply(next: Theme) {
  paint(next)
  shown.value = null
  current.value = next
}

/**
 * Applies and saves a scheme. Returns it, or `null` for an id no scheme has. `origin`
 * is where the pick happened (the 🎨 menu passes the click); the terminal passes none,
 * and the circle starts from the centre of the viewport. Where the circle doesn't run,
 * the page repaints at once, as it always did.
 */
export function setTheme(id: string, { origin }: { origin?: ThemeOrigin } = {}): Theme | null {
  const next = findTheme(id)
  if (!next) return null

  const from = current.value
  const pick = ++picks
  if (circles(from, next)) {
    spread(next, origin, pick)
  } else {
    apply(next)
    if (from.mode === 'dark' && next.mode === 'light') flash()
  }

  try {
    if (next.id === DEFAULT_THEME) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, next.id)
  } catch {
    // Private browsing or a full quota — the scheme just won't survive a reload.
  }
  return next
}

/**
 * Paints a scheme for a moment without choosing it: nothing is saved, no achievement
 * counts it, there is no flash, and the scheme the visitor picked stays theirs. `tour`
 * shows one this way. Returns the restore, which repaints whatever is chosen by then
 * (so a pick made from the 🎨 menu meanwhile wins), or null for an unknown id.
 */
export function previewTheme(id: string): (() => void) | null {
  const next = findTheme(id)
  if (!next) return null
  paint(next)
  shown.value = next
  return () => {
    if (shown.value !== next) return
    shown.value = null
    paint(current.value)
  }
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
    /** What is painted: a preview while one is showing, the chosen scheme otherwise. */
    theme: computed(() => shown.value ?? current.value),
    /** What the visitor picked, whatever a preview is painting over it. */
    chosen: computed(() => current.value),
    themes,
    setTheme,
  }
}
