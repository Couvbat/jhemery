import { describe, expect, it } from 'vitest'
import {
  art,
  blank,
  heading,
  keyValues,
  line,
  lines,
  link,
  pre,
  tags,
  wrap,
  wrapRanges,
} from '../format'

describe('line helpers', () => {
  it('defaults to the default tone', () => {
    expect(line('hi')).toEqual({ text: 'hi', tone: 'default' })
  })

  it('applies a tone', () => {
    expect(line('hi', 'error').tone).toBe('error')
  })

  it('maps a list to lines with one shared tone', () => {
    expect(lines(['a', 'b'], 'muted')).toEqual([
      { text: 'a', tone: 'muted' },
      { text: 'b', tone: 'muted' },
    ])
  })

  it('produces an empty spacer', () => {
    expect(blank.text).toBe('')
  })

  it('marks preformatted lines so runs of spaces survive', () => {
    expect(pre('a   b').pre).toBe(true)
  })

  it('renders a link with an href and no markup', () => {
    const result = link('GitHub', 'https://github.com/Couvbat')
    expect(result).toEqual({ text: 'GitHub', href: 'https://github.com/Couvbat', tone: 'accent' })
  })
})

describe('art', () => {
  it('splits a block into one preformatted line per row', () => {
    const result = art('a\nb\nc')
    expect(result).toHaveLength(3)
    expect(result.every((l) => l.pre)).toBe(true)
    expect(result.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('preserves blank rows, which carry the shape of the art', () => {
    expect(art('a\n\nb')).toHaveLength(3)
  })
})

describe('keyValues', () => {
  it('pads keys to a common width so the arrows line up', () => {
    const result = keyValues([
      { key: 'OS', value: 'Arch' },
      { key: 'Kernel', value: '7.1' },
    ])
    const arrowColumns = result.map((l) => l.text.indexOf('→'))
    expect(new Set(arrowColumns).size).toBe(1)
  })

  it('marks rows preformatted so the padding is not collapsed', () => {
    const result = keyValues([{ key: 'OS', value: 'Arch' }])
    expect(result[0]!.pre).toBe(true)
  })

  it('handles an empty list', () => {
    expect(keyValues([])).toEqual([])
  })
})

describe('wrap', () => {
  it('keeps short text on one line', () => {
    expect(wrap('short enough')).toEqual(['short enough'])
  })

  it('never exceeds the requested width', () => {
    const text = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor'
    for (const row of wrap(text, 20)) {
      expect(row.length).toBeLessThanOrEqual(20)
    }
  })

  it('loses no words', () => {
    const text = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor'
    expect(wrap(text, 20).join(' ')).toBe(text)
  })

  it('emits a word longer than the width on its own line rather than truncating it', () => {
    const long = 'x'.repeat(40)
    expect(wrap(`hi ${long}`, 10)).toEqual(['hi', long])
  })

  it('returns nothing for empty input', () => {
    expect(wrap('')).toEqual([])
  })
})

describe('heading', () => {
  it('underlines the text to its own length', () => {
    const [title, rule] = heading('About')
    expect(title!.text).toBe('About')
    expect(rule!.text).toBe('─────')
    expect(rule!.text).toHaveLength('About'.length)
  })
})

describe('tags', () => {
  it('joins values with a separator', () => {
    // `tags` joins on '  ·  ', but it wraps the result and `wrap` re-splits on
    // /\s+/ — so the padding collapses to single spaces before it reaches the
    // buffer. Harmless (these lines are not `pre`, so the DOM would collapse the
    // runs anyway), but it means the separator you see is not the one in the source.
    expect(tags(['Vue', 'Nest']).map((l) => l.text).join('')).toBe('Vue · Nest')
  })

  it('wraps a long list across lines', () => {
    const many = Array.from({ length: 40 }, (_, i) => `tag${i}`)
    expect(tags(many).length).toBeGreaterThan(1)
  })
})

describe('wrapRanges', () => {
  const slice = (text: string, width: number) =>
    wrapRanges(text, width).map(({ start, end }) => text.slice(start, end))

  it('returns one range for text that already fits', () => {
    expect(wrapRanges('short', 20)).toEqual([{ start: 0, end: 5 }])
  })

  it('breaks on spaces', () => {
    expect(slice('one two three four', 8)).toEqual(['one two ', 'three ', 'four'])
  })

  /*
   * The property the typing test depends on: every character of the original
   * appears exactly once, in order. A renderer toning characters by index cannot
   * survive a wrapper that drops or duplicates the space it broke on.
   */
  it('covers the whole string with contiguous ranges', () => {
    const text = 'Quand je ne livre pas de features, je produis de la musique et je joue.'

    for (const width of [10, 24, 40, 74]) {
      const ranges = wrapRanges(text, width)
      expect(ranges[0]!.start).toBe(0)
      expect(ranges[ranges.length - 1]!.end).toBe(text.length)
      for (let i = 1; i < ranges.length; i++) expect(ranges[i]!.start).toBe(ranges[i - 1]!.end)
      expect(slice(text, width).join('')).toBe(text)
    }
  })

  it('keeps every line within the width', () => {
    const text = 'the quick brown fox jumps over the lazy dog and keeps on running'
    for (const line of slice(text, 16)) expect(line.length).toBeLessThanOrEqual(16)
  })

  it('hard-breaks a word longer than the line rather than overflowing', () => {
    expect(slice('supercalifragilistic', 6)).toEqual(['superc', 'alifra', 'gilist', 'ic'])
  })

  it('handles an empty string', () => {
    expect(wrapRanges('', 10)).toEqual([])
  })
})
