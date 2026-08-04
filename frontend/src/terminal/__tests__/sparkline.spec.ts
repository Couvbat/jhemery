import { describe, expect, it } from 'vitest'
import { formatChange, formatPrice, sparkline, SPARKLINE_WIDTH } from '../sparkline'

describe('sparkline', () => {
  it('is empty for no data', () => {
    expect(sparkline([])).toBe('')
  })

  it('draws one character per sample', () => {
    expect(sparkline([1, 2, 3, 4])).toHaveLength(4)
  })

  it('puts the lowest sample at the bottom and the highest at the top', () => {
    const drawn = sparkline([1, 2, 3])
    expect(drawn[0]).toBe('▁')
    expect(drawn[2]).toBe('█')
  })

  it('draws a flat series flat, rather than dividing by zero', () => {
    expect(sparkline([5, 5, 5])).toBe('▁▁▁')
  })

  it('buckets a series longer than the width', () => {
    const long = Array.from({ length: 500 }, (_, i) => i)
    expect(sparkline(long)).toHaveLength(SPARKLINE_WIDTH)
  })

  it('honours an explicit width', () => {
    const long = Array.from({ length: 100 }, (_, i) => i)
    expect(sparkline(long, 10)).toHaveLength(10)
  })

  it('ignores non-finite samples rather than drawing a gap', () => {
    expect(sparkline([1, Number.NaN, 3])).toHaveLength(2)
  })

  it('is scaled to its own range, not to zero', () => {
    // Two series with the same shape draw the same, whatever their magnitude.
    expect(sparkline([100, 101, 102])).toBe(sparkline([1, 2, 3]))
  })
})

describe('formatPrice', () => {
  it('drops the decimals on a large number and groups the thousands', () => {
    expect(formatPrice(55647, 'eur')).toBe('€55 647')
  })

  it('keeps two decimals in the middle of the range', () => {
    expect(formatPrice(1.5, 'usd')).toBe('$1.50')
  })

  it('keeps four decimals on a sub-unit price, and groups nothing', () => {
    // The separator must not run over the fraction: `0.4 200` is not a price.
    expect(formatPrice(0.42, 'eur')).toBe('€0.4200')
  })

  it('groups a negative number without eating the sign', () => {
    expect(formatPrice(-55647, 'eur')).toBe('€-55 647')
  })

  it('falls back to the ISO code for a currency it has no symbol for', () => {
    expect(formatPrice(1000, 'chf')).toBe('CHF 1 000')
  })
})

describe('formatChange', () => {
  it('signs a rise', () => {
    expect(formatChange(0.7)).toBe('+0.70%')
  })

  it('signs a fall', () => {
    expect(formatChange(-1.234)).toBe('-1.23%')
  })

  it('says nothing rather than zero when there is no figure', () => {
    expect(formatChange(null)).toBe('—')
  })
})
