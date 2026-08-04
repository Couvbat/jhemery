import { describe, expect, it } from 'vitest'
import { diffLines, hasChanges } from '../diff'

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
