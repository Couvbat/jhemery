import { describe, expect, it } from 'vitest'
import { formatJson, jsonStats, lineColumn, minifyJson, scanJson } from '../json/json'

describe('json tool', () => {
  it('pretty-prints and minifies', () => {
    expect(formatJson('{"a":1,"b":[true,null]}')).toEqual({
      ok: true,
      output: '{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}',
    })
    expect(formatJson('{"a":1}', '\t')).toEqual({ ok: true, output: '{\n\t"a": 1\n}' })
    expect(minifyJson('{ "a" : 1 ,\n "b": "x" }')).toEqual({ ok: true, output: '{"a":1,"b":"x"}' })
  })

  it('accepts everything the grammar allows', () => {
    for (const valid of [
      '0',
      '-1.5e+3',
      '"a\\"b\\u00e9"',
      'true',
      'null',
      '[]',
      '{}',
      ' [ 1 , { "k" : [ ] } ] ',
    ]) {
      expect(scanJson(valid), valid).toBeNull()
    }
  })

  it('points at the first offending character', () => {
    expect(formatJson('{"a":}')).toMatchObject({ ok: false, line: 1, column: 6 })
    expect(formatJson('{"a":1,}')).toMatchObject({ ok: false, line: 1, column: 8 })
    expect(formatJson('[1,2')).toMatchObject({ ok: false, line: 1, column: 5 })
    expect(formatJson('{\n  "a": 1\n  "b": 2\n}')).toMatchObject({ ok: false, line: 3, column: 3 })
    expect(formatJson('{"a": tru}')).toMatchObject({ ok: false, line: 1, column: 7 })
    expect(formatJson('"unterminated')).toMatchObject({ ok: false, line: 1, column: 14 })
    expect(formatJson('{"a":1} x')).toMatchObject({ ok: false, line: 1, column: 9 })
    expect(formatJson('')).toMatchObject({ ok: false, line: 1, column: 1 })
  })

  it('rejects what JSON.parse rejects — the scanner never disagrees with the parser', () => {
    for (const invalid of ['01', '1.', '.5', "{'a':1}", '[1,]', '"\t"', '{"a" 1}', 'nul', '+1']) {
      expect(() => JSON.parse(invalid), invalid).toThrow()
      expect(scanJson(invalid), invalid).not.toBeNull()
    }
  })

  it('converts an offset to a 1-based line and column', () => {
    expect(lineColumn('abc', 0)).toEqual({ line: 1, column: 1 })
    expect(lineColumn('ab\ncd', 3)).toEqual({ line: 2, column: 1 })
    expect(lineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 })
  })

  it('counts bytes, not characters', () => {
    expect(jsonStats('"é"')).toEqual({ bytes: 4, lines: 1 })
    expect(jsonStats('')).toEqual({ bytes: 0, lines: 0 })
  })
})
