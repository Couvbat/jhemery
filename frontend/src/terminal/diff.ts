export type DiffKind = 'same' | 'add' | 'remove'

export interface DiffOp {
  kind: DiffKind
  text: string
}

/**
 * Line diff of two files, longest-common-subsequence style — the same shape
 * `diff -u` reports. Pure and dependency-free: the fake filesystem's files are a
 * few dozen lines each, so the O(n·m) table is far cheaper than pulling in a
 * diffing library for one easter-egg command.
 *
 * Removals for a given position come before additions, so the output reads as
 * "this became that" rather than interleaving.
 */
export function diffLines(a: readonly string[], b: readonly string[]): DiffOp[] {
  const rows = a.length
  const cols = b.length

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0))
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'same', text: a[i]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ops.push({ kind: 'remove', text: a[i]! })
      i++
    } else {
      ops.push({ kind: 'add', text: b[j]! })
      j++
    }
  }
  while (i < rows) ops.push({ kind: 'remove', text: a[i++]! })
  while (j < cols) ops.push({ kind: 'add', text: b[j++]! })

  return ops
}

export function hasChanges(ops: readonly DiffOp[]): boolean {
  return ops.some((op) => op.kind !== 'same')
}
