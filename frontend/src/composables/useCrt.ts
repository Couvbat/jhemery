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
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, String(overdrive.value))
  }
  return overdrive.value
}

/** Brief screen-tear used by `sudo rm -rf /`. Resolves when it finishes. */
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
  if (window.localStorage.getItem(STORAGE_KEY) === 'true') setCrt(true)
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
