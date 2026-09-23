import { describe, expect, it } from 'vitest'
import {
  classesFor,
  entropyBits,
  generatePassphrase,
  generatePassword,
  poolSize,
  secureRandom,
  strength,
  type PasswordOptions,
  type Random,
} from '../password/password'

/** A seeded LCG in the `Random` shape, so the composition rules are checked exactly. */
function seeded(seed: number): Random {
  let value = seed >>> 0
  return (max) => {
    value = (value * 1664525 + 1013904223) >>> 0
    return Math.floor((value / 0x100000000) * max)
  }
}

const all: PasswordOptions = {
  length: 16,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  ambiguous: true,
}

describe('password tool', () => {
  it('draws in range from the real source', () => {
    for (let i = 0; i < 200; i++) {
      const value = secureRandom(7)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(7)
    }
    expect(secureRandom(1)).toBe(0)
  })

  it('has the length asked for and one of every chosen class', () => {
    for (let seed = 1; seed < 50; seed++) {
      const password = generatePassword(all, seeded(seed))
      expect(password).toHaveLength(16)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[0-9]/)
      expect(password).toMatch(/[^a-zA-Z0-9]/)
    }
  })

  it('leaves out the look-alikes when asked', () => {
    const strict = { ...all, ambiguous: false, length: 400 }
    const password = generatePassword(strict, seeded(3))
    expect(password).not.toMatch(/[lI1O0o]/)
    expect(poolSize(strict)).toBe(poolSize(all) - 6)
  })

  it('uses only the classes that are on', () => {
    const digitsOnly = { ...all, lower: false, upper: false, symbols: false }
    expect(generatePassword(digitsOnly, seeded(9))).toMatch(/^[0-9]{16}$/)
    expect(classesFor(digitsOnly)).toEqual(['0123456789'])
  })

  it('refuses the impossible', () => {
    expect(generatePassword({ ...all, lower: false, upper: false, digits: false, symbols: false })).toBe('')
    expect(generatePassword({ ...all, length: 3 })).toBe('')
  })

  it('builds passphrases from the words given', () => {
    const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
    const phrase = generatePassphrase(
      words,
      { count: 4, separator: '-', capitalise: false, number: false },
      seeded(5),
    )
    const parts = phrase.split('-')
    expect(parts).toHaveLength(4)
    for (const part of parts) expect(words).toContain(part)

    const dressed = generatePassphrase(
      words,
      { count: 3, separator: ' ', capitalise: true, number: true },
      seeded(7),
    )
    expect(dressed.split(' ')).toHaveLength(3)
    expect(dressed).toMatch(/^[A-Z]/)
    expect(dressed).toMatch(/\d/)
    expect(generatePassphrase([], { count: 3, separator: '-', capitalise: false, number: false })).toBe('')
  })

  it('measures entropy and grades it', () => {
    expect(entropyBits(2, 8)).toBe(8)
    // 26 + 26 + 10 + 25 symbols.
    expect(poolSize(all)).toBe(87)
    expect(entropyBits(poolSize(all), 16)).toBeCloseTo(16 * Math.log2(87), 5)
    expect(entropyBits(1, 10)).toBe(0)
    expect(strength(30)).toBe('weak')
    expect(strength(50)).toBe('fair')
    expect(strength(80)).toBe('strong')
    expect(strength(128)).toBe('excellent')
  })
})
