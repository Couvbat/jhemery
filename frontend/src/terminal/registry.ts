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

/** Levenshtein-lite suggestion for "command not found — did you mean …?". */
export function suggest(name: string): string | undefined {
  const needle = name.toLowerCase()
  let best: { name: string; distance: number } | undefined

  for (const candidate of completionNames()) {
    const distance = editDistance(needle, candidate)
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { name: candidate, distance }
    }
  }
  return best?.name
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 99

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost)
    }
    previous = current
  }
  return previous[b.length]!
}
