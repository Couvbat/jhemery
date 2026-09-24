import type { Command } from './types'
import { aliases } from './aliases'
import { commands } from './commands'

const byName = new Map<string, Command>()
for (const command of commands) {
  byName.set(command.name, command)
  for (const alias of command.aliases ?? []) byName.set(alias, command)
}

export function allCommands(): Command[] {
  return commands
}

/** Commands that appear in `help` and tab-completion. */
export function visibleCommands(): Command[] {
  return commands.filter((c) => !c.hidden)
}

export function paletteCommands(): Command[] {
  return commands.filter((c) => c.palette)
}

export function resolve(name: string): Command | undefined {
  return byName.get(name.toLowerCase())
}

/**
 * The command a `?run=` link names, linkable or not — the shell says why it refused
 * rather than pretending the link was empty. Resolved **without** the reader's
 * aliases: a link's author must not be able to reach whatever the reader happens to
 * have named `ls`. Two-word names (`git log`) resolve as they do when typed.
 */
export function resolveLink(input: string): { command: Command; args: string[] } | undefined {
  const [name = '', ...args] = input.trim().split(/\s+/)
  const direct = resolve(name)
  if (direct) return { command: direct, args }
  const twoWord = resolve(`${name} ${args[0] ?? ''}`.trim())
  return twoWord ? { command: twoWord, args: args.slice(1) } : undefined
}

/**
 * What the empty prompt may suggest: visible, curated into the palette, and runnable
 * with no argument — `try: cd` would only teach someone an error message.
 */
export function suggestionPool(): string[] {
  return commands
    .filter((c) => !c.hidden && c.palette && !c.usage?.includes('<'))
    .map((c) => c.name)
}

/** Every name and alias that can be tab-completed. */
export function completionNames(): string[] {
  const names: string[] = []
  for (const command of visibleCommands()) {
    names.push(command.name, ...(command.aliases ?? []))
  }
  return names.sort()
}

export function complete(prefix: string): string[] {
  const needle = prefix.toLowerCase()
  return completionNames().filter((name) => name.startsWith(needle))
}

/** Keeps `prefix` matches, deduplicated and sorted — the shape Tab wants back. */
export function filterByPrefix(candidates: readonly string[], prefix: string): string[] {
  const needle = prefix.toLowerCase()
  return [...new Set(candidates)].filter((c) => c.toLowerCase().startsWith(needle)).sort()
}

/**
 * Candidates for the first word: every visible command and alias, plus whatever
 * the visitor named themselves with `alias`. Their own names belong here for the
 * same reason the built-in ones do — they are commands they can run.
 */
export function completeCommand(prefix: string): string[] {
  return filterByPrefix([...completionNames(), ...Object.keys(aliases.value)], prefix)
}

/** Longest string that all candidates start with — the shell's usual Tab behaviour. */
export function commonPrefix(candidates: string[]): string {
  if (candidates.length === 0) return ''
  let prefix = candidates[0]!
  for (const candidate of candidates.slice(1)) {
    while (!candidate.startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (!prefix) return ''
    }
  }
  return prefix
}

/**
 * How far a miss may be before it stops being a typo. A flat two let `where` — two
 * substitutions from `theme` — read as a misspelt command, which buried the `ask` hint
 * for anyone typing `where does he work`: in a word that short, two edits make a
 * different word. Longer names keep the slack.
 */
function allowedEdits(needle: string): number {
  return needle.length >= 6 ? 2 : 1
}

/** Edit-distance suggestion for "command not found — did you mean …?". */
export function suggest(name: string): string | undefined {
  const needle = name.toLowerCase()
  let best: { name: string; distance: number } | undefined

  for (const candidate of completionNames()) {
    const distance = editDistance(needle, candidate)
    if (distance <= allowedEdits(needle) && (!best || distance < best.distance)) {
      best = { name: candidate, distance }
    }
  }
  return best?.name
}

/** Levenshtein plus adjacent swaps at a cost of one (optimal string alignment):
 *  `hlep` is one slip of the fingers, and a one-edit budget has to see it as one. */
function editDistance(a: string, b: string): number {
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
