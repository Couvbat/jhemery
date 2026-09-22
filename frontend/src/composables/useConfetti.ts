import { ref } from 'vue'
import { prefersReducedMotion } from './useCrt'

export interface ConfettiBurst {
  /** Viewport coordinates the particles fly out of. */
  x: number
  y: number
  /** Multiplier on the particle count — 1 is a normal unlock, higher is a bigger deal. */
  intensity: number
}

/** Bursts requested but not yet spawned, oldest first. Drained by `ConfettiBurst.vue`. */
export const confettiQueue = ref<ConfettiBurst[]>([])

/**
 * Requests a burst. Silently does nothing under `prefers-reduced-motion`, so callers
 * never have to check — and the queue can't grow unbounded when nothing renders it.
 */
export function fireConfetti(burst: ConfettiBurst) {
  if (prefersReducedMotion()) return
  confettiQueue.value = [...confettiQueue.value, burst]
}

/** Takes every queued burst and empties the queue. */
export function drainConfetti(): ConfettiBurst[] {
  const taken = confettiQueue.value
  confettiQueue.value = []
  return taken
}
