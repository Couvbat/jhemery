import { computed, ref } from 'vue'
// Only this one name: about a dozen specs mock `useCrt` by factory with nothing else in it.
import { prefersReducedMotion } from './useCrt'

/**
 * Motion control — *full · calm · paused*, from the 🎨 menu or `motion` (roadmap §H,
 * features-spec §9). Before it, only the OS setting could stop the field, and a visitor
 * who wanted the page still but their other apps animated had no way to say so
 * (WCAG 2.2.2, pause, stop, hide).
 *
 * The OS setting is a floor this can't lift: under `prefers-reduced-motion` the level is
 * `paused` whatever was chosen, and the choice is kept for the day the OS lets go.
 *
 * `calm` (the brief names it without defining it):
 * - the field runs at 0.35× and 30 fps, and doesn't follow the pointer;
 * - no swing, confetti, glitch, flashbang or theme circle;
 * - prompt cycling, the tagline and the animations of typed commands stay.
 *
 * `paused` means nothing moves. Decorative surfaces read `decorativeMotion()` and pick
 * their own threshold; typed animations (`sl`, `top`, `ask`'s typewriter…) only ask
 * whether it is `paused`, since the visitor asked for them by name. The games keep
 * reading `prefersReducedMotion()`, because their stepped mode changes the rules.
 */

export type MotionSetting = 'full' | 'calm' | 'paused'

export const MOTION_SETTINGS: readonly MotionSetting[] = ['full', 'calm', 'paused']

const STORAGE_KEY = 'couvbat:motion'

// Module-level, like the scheme: one setting for the page, not one per caller.
const setting = ref<MotionSetting>('full')
/**
 * Bumped when the OS setting changes. `prefersReducedMotion()` is a plain read, so
 * whatever tracks the level re-runs on this rather than on a copy of the OS setting:
 * the specs that mock `useCrt` flip what it returns, and a copy would never see that.
 */
const osChanged = ref(0)
let listening = false

export function isMotionSetting(value: unknown): value is MotionSetting {
  return MOTION_SETTINGS.includes(value as MotionSetting)
}

/**
 * The level in force right now: the visitor's choice, under the OS floor. A plain call
 * for code outside a `setup()`, the way `currentLocale()` is; inside a watcher or a
 * computed it is tracked like any ref, so it re-runs when either input changes.
 */
export function decorativeMotion(): MotionSetting {
  void osChanged.value
  return prefersReducedMotion() ? 'paused' : setting.value
}

const level = computed<MotionSetting>(decorativeMotion)

function syncDocument() {
  if (typeof document === 'undefined') return
  // The choice, not the level: the stylesheet already has the media query for the OS.
  // `full` leaves no trace, like the default scheme.
  if (setting.value === 'full') delete document.documentElement.dataset.motion
  else document.documentElement.dataset.motion = setting.value
}

function listen() {
  if (listening || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  listening = true
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => {
    osChanged.value++
  })
}

/** Applies and saves a setting. Returns the level it leaves in force, which is `paused`
 *  whatever was asked for while the OS reduces motion. */
export function setMotion(next: MotionSetting): MotionSetting {
  setting.value = next
  syncDocument()
  try {
    if (next === 'full') window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Private browsing or a full quota — the setting just won't survive a reload.
  }
  return decorativeMotion()
}

/**
 * Re-applies a saved setting. Called from `main.ts` before the app mounts, so a visitor
 * who paused the page never sees a frame of the swing or a byte of three.js.
 */
export function restoreMotion() {
  listen()
  if (typeof window === 'undefined') return
  let stored: string | null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (isMotionSetting(stored)) setting.value = stored
  syncDocument()
}

export function useMotion() {
  listen()
  return {
    /** What is in force: the choice under the OS floor. */
    level,
    /** What the visitor chose, whatever the OS is holding it at. */
    setting: computed(() => setting.value),
    /** Whether the OS setting is what holds the level at `paused`. */
    osReduced: computed(() => {
      void osChanged.value
      return prefersReducedMotion()
    }),
    setMotion,
  }
}
