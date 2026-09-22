import { describe, expect, it } from 'vitest'
import { fitWidth, formatBytes, isLossy, outputName, savings } from '../image/image'

describe('image converter maths', () => {
  it('scales down to a maximum width, never up, keeping the ratio', () => {
    expect(fitWidth(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWidth(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWidth(800, 600, null)).toEqual({ width: 800, height: 600 })
    expect(fitWidth(800, 600, 0)).toEqual({ width: 800, height: 600 })
  })

  it('never produces a zero side', () => {
    expect(fitWidth(10000, 1, 10)).toEqual({ width: 10, height: 1 })
  })

  it('renames the file after the format it actually got', () => {
    expect(outputName('holiday.HEIC', 'webp')).toBe('holiday.webp')
    expect(outputName('shot.png', 'jpeg')).toBe('shot.jpg')
    expect(outputName('noext', 'png')).toBe('noext.png')
    expect(outputName('.png', 'png')).toBe('image.png')
  })

  it('knows the quality slider means nothing to PNG', () => {
    expect(isLossy('png')).toBe(false)
    expect(isLossy('jpeg')).toBe(true)
    expect(isLossy('webp')).toBe(true)
  })

  it('prints sizes people can read', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1_234)).toBe('1.23 kB')
    expect(formatBytes(84_000)).toBe('84.0 kB')
    expect(formatBytes(1_234_567)).toBe('1.23 MB')
  })

  it('reports savings as a signed percentage', () => {
    expect(savings(1000, 250)).toBe(75)
    expect(savings(1000, 1500)).toBe(-50)
    expect(savings(0, 10)).toBe(0)
  })
})
