import { computed, ref } from 'vue'

const STORAGE_KEY = 'couvbat:crt'

const overdrive = ref(false)
const glitching = ref(false)

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function syncDocument() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('crt-overdrive', overdrive.value)
}

/** Toggle, or force a state. Returns the resulting state. */
export function setCrt(enabled?: boolean): boolean {
  overdrive.value = enabled ?? !overdrive.value
  syncDocument()
  try {
    window.localStorage.setItem(STORAGE_KEY, String(overdrive.value))
  } catch {
    // Private browsing or a full quota — overdrive just won't survive a reload.
  }
  return overdrive.value
}

/**
 * Brief screen-tear used by `sudo rm -rf /`. Resolves when it finishes. The terminal's
 * `effects.glitch` also holds it to `full` motion; that check lives there, because
 * `useMotion` imports this module and the reverse import would close a cycle.
 */
export function glitch(durationMs = 900): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve()

  glitching.value = true
  document.documentElement.classList.add('crt-glitch')
  return new Promise((resolve) => {
    window.setTimeout(() => {
      document.documentElement.classList.remove('crt-glitch')
      glitching.value = false
      resolve()
    }, durationMs)
  })
}

export function restoreCrt() {
  if (typeof window === 'undefined') return
  let stored: string | null
  try {
    stored = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    // Safari's private mode and blocked site data both throw here, and this runs on mount.
    return
  }
  if (stored === 'true') setCrt(true)
}

export function useCrt() {
  return {
    overdrive: computed(() => overdrive.value),
    glitching: computed(() => glitching.value),
    /** Background animation runs faster while overdrive is on. */
    speedMultiplier: computed(() => (overdrive.value ? 5 : 1)),
    setCrt,
    glitch,
  }
}
