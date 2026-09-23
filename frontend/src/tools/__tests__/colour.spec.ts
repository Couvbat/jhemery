import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  hslToRgb,
  oklchToRgb,
  parseColour,
  rgbToHsl,
  rgbToOklch,
  toHex,
  toHslString,
  toOklchString,
  toRgbString,
  wcagLevel,
} from '../colour/colour'

describe('colour tool', () => {
  it('parses every hex length', () => {
    expect(parseColour('#0f8')).toEqual({ r: 0, g: 255, b: 136, a: 1 })
    expect(parseColour('00ff41')).toEqual({ r: 0, g: 255, b: 65, a: 1 })
    expect(parseColour('#00ff4180')?.a).toBeCloseTo(0.502, 2)
    expect(parseColour('#ff008')).toBeNull()
  })

  it('parses rgb() in both syntaxes, with alpha either way', () => {
    expect(parseColour('rgb(0, 255, 65)')).toEqual({ r: 0, g: 255, b: 65, a: 1 })
    expect(parseColour('rgb(0 255 65 / 50%)')).toEqual({ r: 0, g: 255, b: 65, a: 0.5 })
    expect(parseColour('rgba(0, 255, 65, 0.25)')).toEqual({ r: 0, g: 255, b: 65, a: 0.25 })
    expect(parseColour('rgb(100% 0% 0%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it('parses hsl() and oklch()', () => {
    expect(parseColour('hsl(0 100% 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 })
    expect(parseColour('hsl(120deg, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 })
    // The site's own background token.
    const background = parseColour('oklch(0.1 0.01 145)')
    expect(background).not.toBeNull()
    expect(background!.g).toBeGreaterThanOrEqual(background!.r)
    expect(background!.r).toBeLessThan(30)
  })

  it('refuses what is not a colour', () => {
    for (const bad of ['', 'green-ish', 'rgb(1 2)', 'hsl(a b c)', '#', 'oklch()']) {
      expect(parseColour(bad), bad).toBeNull()
    }
  })

  it('prints hex, rgb and hsl', () => {
    const c = parseColour('#00ff41')!
    expect(toHex(c)).toBe('#00ff41')
    expect(toRgbString(c)).toBe('rgb(0 255 65)')
    expect(toHslString(c)).toBe('hsl(135 100% 50%)')
    expect(toHex({ r: 0, g: 255, b: 65, a: 0.5 })).toBe('#00ff4180')
    expect(toRgbString({ r: 0, g: 255, b: 65, a: 0.5 })).toBe('rgb(0 255 65 / 50%)')
  })

  it('round-trips through hsl', () => {
    for (const hex of ['#00ff41', '#bf00ff', '#ff0080', '#123456', '#808080']) {
      const rgb = parseColour(hex)!
      const back = hslToRgb(rgbToHsl(rgb))
      expect(toHex({ ...back, a: 1 })).toBe(hex)
    }
  })

  it('agrees with the reference OKLab values for white and pure red', () => {
    const white = rgbToOklch({ r: 255, g: 255, b: 255, a: 1 })
    expect(white.l).toBeCloseTo(1, 3)
    expect(white.c).toBeCloseTo(0, 3)
    const red = rgbToOklch({ r: 255, g: 0, b: 0, a: 1 })
    expect(red.l).toBeCloseTo(0.628, 2)
    expect(red.c).toBeCloseTo(0.258, 2)
    expect(red.h).toBeCloseTo(29.2, 0)
  })

  it('round-trips through oklch within a step', () => {
    for (const hex of ['#00ff41', '#bf00ff', '#ff0080', '#123456', '#0d0f0d']) {
      const rgb = parseColour(hex)!
      const { rgb: back, inGamut } = oklchToRgb(rgbToOklch(rgb))
      expect(inGamut).toBe(true)
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1)
    }
    expect(toOklchString(parseColour('#ffffff')!)).toBe('oklch(1 0 0)')
  })

  it('flags colours sRGB cannot show', () => {
    expect(oklchToRgb({ l: 0.9, c: 0.4, h: 145 }).inGamut).toBe(false)
  })

  it('computes WCAG contrast and grades it', () => {
    const white = parseColour('#fff')!
    const black = parseColour('#000')!
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5)
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5)
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5)
    // #767676 on white is the canonical "just passes AA" grey.
    expect(contrastRatio(parseColour('#767676')!, white)).toBeCloseTo(4.54, 2)
    expect(wcagLevel(21)).toBe('AAA')
    expect(wcagLevel(4.54)).toBe('AA')
    expect(wcagLevel(3.2)).toBe('AA large')
    expect(wcagLevel(2)).toBe('fail')
  })
})
