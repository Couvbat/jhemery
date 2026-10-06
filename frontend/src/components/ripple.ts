/**
 * `wall`'s ripple through the wireframe field, as one pure function so it can be tested
 * without WebGL. A ring leaves the field's centre at `RIPPLE_SPEED` and pushes each shape
 * outward as it passes, a little less the further it has travelled, and is gone after
 * `RIPPLE_SECONDS`. `ThreeBackground` adds the push to a shape's target along the line
 * from the centre to its home, so the ordinary drift carries it out and lets it back.
 */

/** How far the ring travels per second, in world units: across the ~20-unit field in about two. */
export const RIPPLE_SPEED = 9
/** How wide the ring is: shapes within about this of its front feel it. */
export const RIPPLE_WIDTH = 1.6
/** The furthest a shape is pushed, at the very start. */
export const RIPPLE_AMPLITUDE = 1.4
/** After this the ring has left the field, and nothing feels it. */
export const RIPPLE_SECONDS = 2.6

/**
 * The outward push on a shape `radius` units from the centre, `elapsed` seconds after
 * the wave arrived. Zero before it starts, after it ends, and wherever the ring isn't.
 */
export function rippleOffset(radius: number, elapsed: number): number {
  if (!(elapsed >= 0) || elapsed >= RIPPLE_SECONDS || !(radius >= 0)) return 0
  const front = RIPPLE_SPEED * elapsed
  const across = (radius - front) / RIPPLE_WIDTH
  // Fades linearly over its life, so the last shapes it reaches move least.
  const fade = 1 - elapsed / RIPPLE_SECONDS
  return RIPPLE_AMPLITUDE * fade * Math.exp(-across * across)
}
