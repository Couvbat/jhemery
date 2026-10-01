import type { Command, Writes } from './types'
import { aliases } from './aliases'
import { collectCommands } from './commands'
import { closest } from './fuzzy'

/**
 * Built on first use, not at import. This module, `commands/index.ts` and
 * `commands/core.ts` import each other, so whichever is entered first, no module in
 * that cycle may call a registry function at module scope. `registry-load.spec.ts`
 * enters through every one of them; `import-cycles.spec.ts` keeps the cycle from
 * reaching outside `terminal/commands/`.
 */
let table: { list: Command[]; byName: Map<string, Command> } | undefined

function registry(): { list: Command[]; byName: Map<string, Command> } {
  if (!table) {
    const list = collectCommands()
    const byName = new Map<string, Command>()
    for (const command of list) {
      byName.set(command.name, command)
      for (const alias of command.aliases ?? []) byName.set(alias, command)
    }
    table = { list, byName }
  }
  return table
}

export function allCommands(): Command[] {
  return registry().list
}

/** Commands that appear in `help` and tab-completion. */
export function visibleCommands(): Command[] {
  return registry().list.filter((c) => !c.hidden)
}

export function paletteCommands(): Command[] {
  return registry().list.filter((c) => c.palette)
}

export function resolve(name: string): Command | undefined {
  return registry().byName.get(name.toLowerCase())
}

/** What `command` changes when run with `args`. */
export function writesOf(command: Command, args: readonly string[] = []): Writes {
  return typeof command.writes === 'function' ? command.writes(args) : command.writes
}

/**
 * Whether every argument is one the command itself offers for Tab at that position.
 * A link's author chooses its arguments, and anything after the name is echoed at the
 * prompt as if the visitor had typed it, so free text must not pass: otherwise
 * `?run=whoami your session expired, sign in at …` would print that line on the page.
 * A command that takes arguments from links declares them in `complete()`.
 */
function argsOffered(command: Command, args: readonly string[]): boolean {
  return args.every((arg, index) => {
    const offered = command.complete?.({ args: [...args], index, word: arg }) ?? []
    return offered.some((candidate) => candidate.toLowerCase() === arg.toLowerCase())
  })
}

/**
 * Whether `command`, with these arguments, may run without the visitor typing it: it
 * opted in, it isn't hidden, it writes nothing, and its arguments are ones it offers.
 * `runLink` is the caller today. The roadmap's `tour`, pipe stages and `strace` are meant
 * to ask the same question, so none of them keeps its own list of writers. `ctx.run`
 * does not: its callers pass fixed command lines.
 */
export function isLinkable(command: Command, args: readonly string[] = []): boolean {
  if (command.hidden) return false
  const opted = typeof command.linkable === 'function' ? command.linkable(args) : command.linkable === true
  return opted && writesOf(command, args) === 'none' && argsOffered(command, args)
}

/**
 * Whether `name` is a command, or the first word of a two-word one (`git` of `git log`),
 * which an alias of that name would hide just the same.
 */
export function isCommandWord(name: string): boolean {
  const word = name.toLowerCase()
  if (resolve(word)) return true
  return allCommands().some((command) =>
    [command.name, ...(command.aliases ?? [])].some((n) => n.startsWith(`${word} `)),
  )
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
  const { list } = registry()
  return list.filter((c) => !c.hidden && c.palette && !c.usage?.includes('<')).map((c) => c.name)
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

/** Edit-distance suggestion for "command not found — did you mean …?". */
export function suggest(name: string): string | undefined {
  return closest(name, completionNames())
}
