import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { prefersReducedMotion } from './useCrt'

/** Long enough to read a command name, short enough that the change is noticed. */
export const CYCLE_MS = 3500

/**
 * Once someone has typed anything they know what the prompt is for, so the hints stop
 * for the rest of the session — not per open, which would nag. Module-level for that
 * reason, and deliberately not persisted: a new visit is a new visitor, as far as the
 * prompt can tell.
 */
const dismissed = ref(false)

export function dismissSuggestions(): void {
  dismissed.value = true
}

/**
 * The faded `try: <command>` an empty prompt shows. It cycles through `pool` while
 * `active`; under reduced motion it holds one hint instead of changing under the
 * reader. The start is random so that someone who opens the shell twice does not see
 * the same first suggestion twice.
 */
export function usePromptSuggestion(pool: () => string[], active: Ref<boolean>) {
  const candidates = pool()
  const index = ref(Math.floor(Math.random() * Math.max(1, candidates.length)))
  let timer: ReturnType<typeof setInterval> | undefined

  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }

  watch(
    [active, dismissed],
    ([isActive, isDismissed]) => {
      stop()
      if (!isActive || isDismissed || prefersReducedMotion() || candidates.length < 2) return
      timer = setInterval(() => {
        index.value = (index.value + 1) % candidates.length
      }, CYCLE_MS)
    },
    { immediate: true },
  )
  onScopeDispose(stop)

  const suggestion = computed(() =>
    active.value && !dismissed.value && candidates.length ? candidates[index.value % candidates.length]! : null,
  )

  return { suggestion, dismiss: dismissSuggestions }
}

/** For the spec: a fresh session. */
export function resetSuggestions(): void {
  dismissed.value = false
}
