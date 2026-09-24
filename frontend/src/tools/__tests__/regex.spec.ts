import { describe, expect, it } from 'vitest'
import { cleanFlags, runRegex, segments } from '../regex/regex'

describe('runRegex', () => {
  it('reports every match with its groups, numbered and named', () => {
    const result = runRegex('(?<user>\\w+)@(\\w+)', 'g', 'a@b and cd@ef')
    expect(result).toMatchObject({
      ok: true,
      truncated: false,
      matches: [
        { start: 0, end: 3, text: 'a@b', groups: [{ index: 1, name: 'user', text: 'a', start: 0, end: 1 }, { index: 2, text: 'b', start: 2, end: 3 }] },
        { start: 8, end: 13, text: 'cd@ef' },
      ],
    })
  })

  it('stops at the first match without g', () => {
    const result = runRegex('\\d', '', 'a1b2')
    expect(result.ok && result.matches.map((m) => m.text)).toEqual(['1'])
  })

  it('counts non-capturing groups and lookarounds out of the numbering', () => {
    const result = runRegex('(?:x)(?<=x)(y)(?<name>z)', 'g', 'xyz')
    expect(result.ok && result.matches[0]!.groups.map((g) => [g.index, g.name, g.text])).toEqual([
      [1, undefined, 'y'],
      [2, 'name', 'z'],
    ])
  })

  it('marks a group that took no part in the match', () => {
    const result = runRegex('a(b)?', 'g', 'a')
    expect(result.ok && result.matches[0]!.groups[0]).toMatchObject({ index: 1, text: undefined })
  })

  it('steps over empty matches instead of looping forever', () => {
    const result = runRegex('x*', 'g', 'abc')
    expect(result.ok && result.matches).toHaveLength(4)
  })

  it('caps the number of matches and says so', () => {
    const result = runRegex('.', 'g', 'x'.repeat(50), 10)
    expect(result).toMatchObject({ ok: true, truncated: true })
    expect(result.ok && result.matches).toHaveLength(10)
  })

  it('returns the engine’s own message for an invalid pattern', () => {
    expect(runRegex('(', 'g', 'x')).toMatchObject({ ok: false })
  })

  it('keeps only the flags that change matching', () => {
    expect(cleanFlags('ggizd')).toBe('gi')
  })
})

describe('segments', () => {
  it('splits the text into matched and unmatched runs', () => {
    const result = runRegex('b+', 'g', 'abbcb')
    expect(result.ok && segments('abbcb', result.matches)).toEqual([
      { text: 'a', match: null },
      { text: 'bb', match: 0 },
      { text: 'c', match: null },
      { text: 'b', match: 1 },
    ])
  })
})
