import { computed, ref } from 'vue'
import { usePresence } from './usePresence'

/** What the background starts with, and what `scene reset` goes back to. */
export const BASE_SHAPE_COUNT = 18
/** A ceiling on `spawn`, so nobody can talk the page into melting their GPU. */
export const MAX_SHAPE_COUNT = 60
/**
 * A ceiling on the shapes other visitors add. Well under `MAX_SHAPE_COUNT`, and a pool
 * of its own rather than a share of `spawn`'s, so a busy day can neither bury the scene
 * nor change what `spawn` and `scene reset` mean.
 */
export const MAX_VISITOR_SHAPES = 12

/**
 * One wireframe per *other* person here: the presence count minus the reader. Nothing
 * new crosses the wire — it is the same integer the footer prints, and still says
 * nothing about who anyone is. Zero until the stream's first message, and when there
 * is no backend at all.
 */
export function visitorShapesFor(online: number | null): number {
  if (online === null) return 0
  return Math.min(MAX_VISITOR_SHAPES, Math.max(0, online - 1))
}

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
  const { online } = usePresence()
  return {
    shapeCount: computed(() => shapeCount.value),
    visitorShapes: computed(() => visitorShapesFor(online.value)),
    gravityOn: computed(() => gravity.value),
    constellationOn: computed(() => constellation.value),
    spawnShapes,
    setGravity,
    setConstellation,
    resetScene,
  }
}
