/**
 * "Did you mean…?" for anything with a list of names: commands, `why` topics, case
 * studies. A leaf module, so a command module can use it without importing the
 * registry, which would put it in the registry's import cycle.
 */

/**
 * How far a miss may be before it stops being a typo. A flat two let `where` — two
 * substitutions from `theme` — read as a misspelt command, which buried the `ask` hint
 * for anyone typing `where does he work`: in a word that short, two edits make a
 * different word. Longer names keep the slack.
 */
export function allowedEdits(needle: string): number {
  return needle.length >= 6 ? 2 : 1
}

/** The closest candidate within `allowedEdits`, or nothing: a different word is not a typo. */
export function closest(needle: string, candidates: readonly string[]): string | undefined {
  const target = needle.toLowerCase()
  let best: { name: string; distance: number } | undefined
  for (const candidate of candidates) {
    const distance = editDistance(target, candidate)
    if (distance <= allowedEdits(target) && (!best || distance < best.distance)) {
      best = { name: candidate, distance }
    }
  }
  return best?.name
}

/** Levenshtein plus adjacent swaps at a cost of one (optimal string alignment):
 *  `hlep` is one slip of the fingers, and a one-edit budget has to see it as one. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 99

  let beforePrevious: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j]!, beforePrevious[j - 2]! + 1)
      }
    }
    beforePrevious = previous
    previous = current
  }
  return previous[b.length]!
}
