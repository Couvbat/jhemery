import { computed, ref } from 'vue'

/** What the background starts with, and what `scene reset` goes back to. */
export const BASE_SHAPE_COUNT = 18
/** A ceiling on `spawn`, so nobody can talk the page into melting their GPU. */
export const MAX_SHAPE_COUNT = 60

/**
 * Terminal-controllable state for the three.js background — the same
 * flag-and-watch shape as `useMatrix`/`useBoot`, one module-level ref per knob.
 * `ThreeBackground` is the only reader; the commands only ever set.
 */
const shapeCount = ref(BASE_SHAPE_COUNT)
const gravity = ref(true)
const constellation = ref(false)

/** Returns the count actually reached, which may be the cap. */
export function spawnShapes(count: number): number {
  shapeCount.value = Math.min(MAX_SHAPE_COUNT, Math.max(1, shapeCount.value + count))
  return shapeCount.value
}

/** Toggle, or force a state. Returns the resulting state. */
export function setGravity(enabled?: boolean): boolean {
  gravity.value = enabled ?? !gravity.value
  return gravity.value
}

export function setConstellation(enabled?: boolean): boolean {
  constellation.value = enabled ?? !constellation.value
  return constellation.value
}

export function resetScene() {
  shapeCount.value = BASE_SHAPE_COUNT
  gravity.value = true
  constellation.value = false
}

export function useSceneControl() {
  return {
    shapeCount: computed(() => shapeCount.value),
    gravityOn: computed(() => gravity.value),
    constellationOn: computed(() => constellation.value),
    spawnShapes,
    setGravity,
    setConstellation,
    resetScene,
  }
}
