import { describe, expect, it } from 'vitest'
import { BANNER_MAX_CHARS, GLYPH_HEIGHT, bannerLines } from '../ascii-banner'

describe('bannerLines', () => {
  it('renders one block per line of glyph height', () => {
    expect(bannerLines('HI')).toHaveLength(GLYPH_HEIGHT)
  })

  it('returns nothing for empty or whitespace-only input', () => {
    expect(bannerLines('')).toEqual([])
    expect(bannerLines('   ')).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(bannerLines('abc')).toEqual(bannerLines('ABC'))
  })

  it('renders with the requested characters', () => {
    const rendered = bannerLines('L', { on: '#', off: '.' })
    expect(rendered[0]).toBe('#....')
    expect(rendered[GLYPH_HEIGHT - 1]).toBe('#####')
  })

  it('separates glyphs by one blank column', () => {
    // `I` is a full-width bar top and bottom, so the gap between two of them is
    // the only "off" character in that row.
    const [top] = bannerLines('II', { on: '#', off: '.' })
    expect(top).toBe('#####.#####')
  })

  it('falls back to `?` for characters the font does not have', () => {
    expect(bannerLines('§')).toEqual(bannerLines('?'))
  })

  it('wraps past the max width into stacked blocks separated by a blank line', () => {
    const rendered = bannerLines('A'.repeat(BANNER_MAX_CHARS + 1))
    expect(rendered).toHaveLength(GLYPH_HEIGHT * 2 + 1)
    expect(rendered[GLYPH_HEIGHT]).toBe('')
  })

  it('prefers to break a wrap on a space', () => {
    const rendered = bannerLines('HELLO THERE WORLD', { on: '#', off: '.' })
    const blocks = rendered.filter((row) => row === '').length + 1
    expect(blocks).toBeGreaterThan(1)
    // 'HELLO THERE' is 11 characters, so it fits; the break lands before 'WORLD'.
    expect(rendered[0]!.length).toBe(11 * 6 - 1)
  })

  it('never emits trailing whitespace', () => {
    for (const row of bannerLines('BANNER TEST')) {
      expect(row).toBe(row.replace(/\s+$/, ''))
    }
  })

  it('keeps every glyph the same height', () => {
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?.,:-_+=/<>()*#@') {
      expect(bannerLines(char), char).toHaveLength(GLYPH_HEIGHT)
    }
  })
})
