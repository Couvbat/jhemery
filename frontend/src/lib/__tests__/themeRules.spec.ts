import { describe, expect, it } from 'vitest'
import { contrastRatio, parseColour, rgbToOklch } from '@/lib/colour'
import { checkFloors, liftToFloor } from '../themeRules'
import { findTheme } from '../themes'

const ratio = (a: string, b: string) => contrastRatio(parseColour(a)!, parseColour(b)!)
const lightness = (colour: string) => rgbToOklch(parseColour(colour)!).l

describe('liftToFloor', () => {
  // The default's muted text before the gate: 4.04:1 on its raised surface.
  const MUTED = 'oklch(0.55 0.1 145)'
  const DARK = ['oklch(0.1 0.01 145)', 'oklch(0.13 0.01 145)', 'oklch(0.18 0.01 145)']

  it('hands back a colour that already passes, as written', () => {
    expect(liftToFloor('oklch(0.58 0.1 145)', DARK, 4.5, 'dark')).toBe('oklch(0.58 0.1 145)')
  })

  it('lightens text on a dark scheme until it clears every surface', () => {
    const lifted = liftToFloor(MUTED, DARK, 4.5, 'dark')
    expect(lifted).toMatch(/^#[0-9a-f]{6}$/)
    expect(lightness(lifted)).toBeGreaterThan(lightness(MUTED))
    for (const back of DARK) expect(ratio(lifted, back)).toBeGreaterThanOrEqual(4.5)
  })

  it('darkens text on a light scheme', () => {
    const light = ['#ffffff', '#f2f2f2']
    const lifted = liftToFloor('#999999', light, 4.5, 'light')
    expect(lightness(lifted)).toBeLessThan(lightness('#999999'))
    for (const back of light) expect(ratio(lifted, back)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the hue, so a muted green stays green', () => {
    const before = rgbToOklch(parseColour(MUTED)!)
    const after = rgbToOklch(parseColour(liftToFloor(MUTED, DARK, 4.5, 'dark'))!)
    expect(Math.abs(after.h - before.h)).toBeLessThan(3)
  })

  // Against #767676 a tinted near-white tops out at ~4.4:1 while plain white reaches 4.54.
  it('reaches the end of the scale when keeping the tint cannot', () => {
    for (const colour of ['#7a8a7a', 'oklch(0.6 0.1 145)']) {
      expect(ratio(liftToFloor(colour, ['#767676'], 4.5, 'dark'), '#767676')).toBeGreaterThanOrEqual(4.5)
    }
    // On #555555 even black only reaches 2.8:1, so the end of the scale is all there is.
    expect(liftToFloor('#666666', ['#555555'], 4.5, 'light')).toBe('#000000')
  })

  it('does not move by more than it has to', () => {
    // One step (0.005) less would still be short of the floor.
    const lifted = liftToFloor(MUTED, DARK, 4.5, 'dark')
    expect(Math.min(...DARK.map((back) => ratio(lifted, back)))).toBeLessThan(4.7)
  })
})

describe('checkFloors', () => {
  it('names each pair that misses, and nothing for a scheme that passes', () => {
    const cyberpunk = findTheme('cyberpunk')!
    expect(checkFloors(cyberpunk.colours)).toEqual([])
    expect(checkFloors({ ...cyberpunk.colours, muted: 'oklch(0.55 0.1 145)' })).toEqual([
      'muted on background 4.44 < 4.5',
      'muted on surface 4.34 < 4.5',
      'muted on raised 4.04 < 4.5',
    ])
  })
})
