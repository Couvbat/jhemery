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

/**
 * Past this many cells in the LCS table, the diff tool declines rather than freeze
 * the tab: two pasted 2 000-line files that share nothing would be 4 million. The
 * common head and tail are trimmed first, so ordinary edits never get near it.
 */
export const MAX_DIFF_CELLS = 4_000_000

/** Lines shared at the start and end, which cost nothing to diff. */
function commonEnds(a: readonly string[], b: readonly string[]): { head: number; tail: number } {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  return { head, tail }
}

export function tooBigToDiff(a: readonly string[], b: readonly string[]): boolean {
  const { head, tail } = commonEnds(a, b)
  return (a.length - head - tail) * (b.length - head - tail) > MAX_DIFF_CELLS
}

/** `diffLines` over only the part that differs — the same answer, with the table sized
 *  to the change instead of the files. */
export function diffTrimmed(a: readonly string[], b: readonly string[]): DiffOp[] {
  const { head, tail } = commonEnds(a, b)
  const same = (text: string): DiffOp => ({ kind: 'same', text })
  return [
    ...a.slice(0, head).map(same),
    ...diffLines(a.slice(head, a.length - tail), b.slice(head, b.length - tail)),
    ...a.slice(a.length - tail).map(same),
  ]
}

export interface Hunk {
  header: string
  ops: DiffOp[]
}

/** GNU's range: `start,count`, with `,1` left out, and a start of the line *before*
 *  the hunk when it is empty on that side. */
function range(start: number, count: number): string {
  if (count === 0) return `${start - 1},0`
  return count === 1 ? String(start) : `${start},${count}`
}

/**
 * The hunks `diff -u` would print: each change with `context` unchanged lines around
 * it, and changes closer than twice that merged into one hunk.
 */
export function unifiedHunks(ops: readonly DiffOp[], context = 3): Hunk[] {
  // Line numbers on each side before every op, so a hunk can say where it starts.
  const before: Array<{ a: number; b: number }> = []
  let a = 1
  let b = 1
  for (const op of ops) {
    before.push({ a, b })
    if (op.kind !== 'add') a++
    if (op.kind !== 'remove') b++
  }

  const changes = ops.flatMap((op, i) => (op.kind === 'same' ? [] : [i]))
  const hunks: Hunk[] = []
  let i = 0
  while (i < changes.length) {
    const first = changes[i]!
    let last = first
    while (i + 1 < changes.length && changes[i + 1]! - last <= context * 2 + 1) last = changes[++i]!
    i++

    const start = Math.max(0, first - context)
    const end = Math.min(ops.length, last + context + 1)
    const slice = ops.slice(start, end)
    const oldCount = slice.filter((op) => op.kind !== 'add').length
    const newCount = slice.filter((op) => op.kind !== 'remove').length
    hunks.push({
      header: `@@ -${range(before[start]!.a, oldCount)} +${range(before[start]!.b, newCount)} @@`,
      ops: slice,
    })
  }
  return hunks
}

/** The whole `diff -u` text, headers included. Empty when nothing changed. */
export function unifiedDiff(a: readonly string[], b: readonly string[], names = { from: 'a', to: 'b' }, context = 3): string {
  const hunks = unifiedHunks(diffTrimmed(a, b), context)
  if (!hunks.length) return ''
  const sign = { same: ' ', add: '+', remove: '-' } as const
  return [
    `--- ${names.from}`,
    `+++ ${names.to}`,
    ...hunks.flatMap((hunk) => [hunk.header, ...hunk.ops.map((op) => `${sign[op.kind]}${op.text}`)]),
  ].join('\n')
}
