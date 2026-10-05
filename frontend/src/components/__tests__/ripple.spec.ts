import { describe, expect, it } from 'vitest'
import { RIPPLE_AMPLITUDE, RIPPLE_SECONDS, RIPPLE_SPEED, rippleOffset } from '../ripple'

describe('rippleOffset', () => {
  it('is nothing before the wave, after it, or for nonsense', () => {
    expect(rippleOffset(3, -0.1)).toBe(0)
    expect(rippleOffset(3, RIPPLE_SECONDS)).toBe(0)
    expect(rippleOffset(3, RIPPLE_SECONDS + 5)).toBe(0)
    expect(rippleOffset(Number.NaN, 0.5)).toBe(0)
    expect(rippleOffset(3, Number.NaN)).toBe(0)
  })

  it('pushes hardest where the ring is, and barely anywhere else', () => {
    // Late enough that the ring has a real inside: a disc instead of a ring would keep
    // pushing what it has passed, and only a radius behind the front can catch that.
    const t = 1
    const front = RIPPLE_SPEED * t
    const atFront = rippleOffset(front, t)
    expect(front - 6).toBeGreaterThan(0)
    expect(atFront).toBeGreaterThan(0)
    expect(rippleOffset(front - 6, t)).toBeLessThan(atFront / 100)
    expect(rippleOffset(0, t)).toBeLessThan(atFront / 100)
    expect(rippleOffset(front + 6, t)).toBeLessThan(atFront / 100)
  })

  it('travels outward: a near shape moves first, a far one later', () => {
    const near = 2
    const far = 14
    const peak = (radius: number) => {
      let best = { t: 0, value: 0 }
      for (let t = 0; t < RIPPLE_SECONDS; t += 0.01) {
        const value = rippleOffset(radius, t)
        if (value > best.value) best = { t, value }
      }
      return best
    }
    expect(peak(near).t).toBeLessThan(peak(far).t)
    // Fading as it goes, so the far shape is pushed less.
    expect(peak(far).value).toBeLessThan(peak(near).value)
  })

  it('never pushes further than its amplitude, nor inward', () => {
    for (let t = 0; t < RIPPLE_SECONDS; t += 0.05) {
      for (let r = 0; r < 20; r += 0.5) {
        const value = rippleOffset(r, t)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(RIPPLE_AMPLITUDE)
      }
    }
  })
})
