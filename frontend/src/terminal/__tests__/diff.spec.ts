import { describe, expect, it } from 'vitest'
import { diffLines, diffTrimmed, hasChanges, tooBigToDiff, unifiedDiff, unifiedHunks } from '../diff'

describe('diffLines', () => {
  it('reports no changes for identical input', () => {
    const ops = diffLines(['a', 'b', 'c'], ['a', 'b', 'c'])
    expect(hasChanges(ops)).toBe(false)
    expect(ops.map((op) => op.kind)).toEqual(['same', 'same', 'same'])
  })

  it('keeps common lines and marks the changed one', () => {
    const ops = diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])
    expect(ops).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'same', text: 'c' },
    ])
  })

  it('reports a removal for a line only the left side has', () => {
    const ops = diffLines(['a', 'b'], ['a'])
    expect(ops).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'remove', text: 'b' },
    ])
  })

  it('reports an addition for a line only the right side has', () => {
    const ops = diffLines(['a'], ['a', 'b'])
    expect(ops).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'add', text: 'b' },
    ])
  })

  it('handles an empty side', () => {
    expect(diffLines([], ['a', 'b'])).toEqual([
      { kind: 'add', text: 'a' },
      { kind: 'add', text: 'b' },
    ])
    expect(diffLines(['a'], [])).toEqual([{ kind: 'remove', text: 'a' }])
    expect(diffLines([], [])).toEqual([])
  })

  it('finds the longest common subsequence rather than the first match', () => {
    const ops = diffLines(['1', '2', '3', '4'], ['0', '2', '3', '5'])
    expect(ops.filter((op) => op.kind === 'same').map((op) => op.text)).toEqual(['2', '3'])
  })

  it('rebuilds the right-hand file from what it keeps and adds', () => {
    const left = ['one', 'two', 'three', 'four']
    const right = ['one', 'three', 'four', 'five']
    const rebuilt = diffLines(left, right)
      .filter((op) => op.kind !== 'remove')
      .map((op) => op.text)
    expect(rebuilt).toEqual(right)
  })
})

describe('unifiedDiff', () => {
  const a = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

  it('prints hunks with three lines of context, as diff -u does', () => {
    const b = a.map((line) => (line === '6' ? 'six' : line))
    expect(unifiedDiff(a, b, { from: 'a', to: 'b' })).toBe(
      ['--- a', '+++ b', '@@ -3,7 +3,7 @@', ' 3', ' 4', ' 5', '-6', '+six', ' 7', ' 8', ' 9'].join('\n'),
    )
  })

  it('merges changes whose context would touch, and splits those that would not', () => {
    const close = a.map((line) => (line === '3' || line === '9' ? `${line}!` : line))
    expect(unifiedHunks(diffTrimmed(a, close))).toHaveLength(1)
    const far = [...a, ...a.map((l) => `x${l}`)]
    const farChanged = far.map((line) => (line === '1' || line === 'x12' ? `${line}!` : line))
    expect(unifiedHunks(diffTrimmed(far, farChanged))).toHaveLength(2)
  })

  it('uses GNU ranges: no ,1, and the line before for an empty side', () => {
    expect(unifiedDiff(['a'], ['b']).split('\n')[2]).toBe('@@ -1 +1 @@')
    expect(unifiedDiff([], ['new']).split('\n')[2]).toBe('@@ -0,0 +1 @@')
  })

  it('is empty when nothing changed', () => {
    expect(unifiedDiff(a, [...a])).toBe('')
  })

  it('trims the shared ends without changing the answer', () => {
    const b = ['0', ...a.slice(0, 5), 'mid', ...a.slice(5)]
    expect(diffTrimmed(a, b)).toEqual(diffLines(a, b))
  })

  it('declines two large texts that share nothing', () => {
    const big = Array.from({ length: 2100 }, (_, i) => `a${i}`)
    expect(tooBigToDiff(big, big.map((l) => `b${l}`))).toBe(true)
    // …but not the same texts with a one-line edit: the shared ends are free.
    expect(tooBigToDiff(big, [...big.slice(0, 1000), 'x', ...big.slice(1001)])).toBe(false)
  })
})
