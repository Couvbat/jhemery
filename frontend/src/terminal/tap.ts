import type { Localised } from '@/content/types'
import { GROUP_LABELS } from './commands/core'
import { gameCommands } from './commands/games'
import { textCommands } from './commands/text'
import { allCommands, isLinkable, resolve, resolveLink } from './registry'
import type { Command, CommandGroup } from './types'

/**
 * The buttons of the terminal's touch layout, below `md`, where there is no prompt
 * (features-spec §9). A button runs its line through `runLink()`, so it can offer nothing
 * a `?run=` link couldn't run: the command bare when `isLinkable(c, [])`, and each first
 * argument its `complete()` offers that `isLinkable(c, [arg])` accepts (`projects qr`,
 * `why polling`, `hardware nas`). Built from the registry on each call, so a new command
 * gets its button by being linkable, and nothing here names one.
 *
 * Two kinds are left out. The games, and their listing, since the touch layout runs every
 * stage with `tty: false` and a game would only answer "not a tty". And the text commands
 * (`grep`, `head`…), which are for reading a pipe, and a tap never makes one.
 */

export interface TapCommand {
  /** The command's name: the button's label, and the first word of each of its lines. */
  name: string
  /** `help`'s line for it. */
  description: Localised<string>
  /** What its buttons run: the bare name when a link could run it, then one line per argument. */
  lines: string[]
}

export interface TapGroup {
  group: CommandGroup
  label: Localised<string>
  commands: TapCommand[]
}

/** A game holds the keyboard, and a text command reads a pipe: neither has anything to do for a tap. */
function untappable(command: Command): boolean {
  return gameCommands.includes(command) || textCommands.includes(command)
}

/** What a command's Tab offers for its first argument. */
function firstArguments(command: Command): string[] {
  return command.complete?.({ args: [''], index: 0, word: '' }) ?? []
}

/**
 * The buttons, in `help`'s groups and order. `help`, `man` and `strace` take another
 * command as their argument, so a row of their arguments would be every command again (a
 * hundred buttons), and `strace snake` a game; those arguments are left out, and the
 * command's own button is the tap. That is decided by what they offer, not by name: a
 * command whose first argument may be every bare button's name. What they offer besides
 * stays (`man jules`).
 */
export function tapCommands(): TapGroup[] {
  const candidates = allCommands().filter((command) => !untappable(command))
  const bare = candidates.filter((command) => isLinkable(command, [])).map((command) => command.name)

  const byGroup = new Map<CommandGroup, TapCommand[]>()
  for (const command of candidates) {
    const offered = firstArguments(command)
    const takesCommands = bare.every((name) => offered.includes(name))
    const args = offered.filter((arg) => !(takesCommands && resolve(arg)) && isLinkable(command, [arg]))
    const lines = [...(isLinkable(command, []) ? [command.name] : []), ...args.map((arg) => `${command.name} ${arg}`)]
    if (!lines.length) continue
    const group = byGroup.get(command.group) ?? []
    group.push({ name: command.name, description: command.description, lines })
    byGroup.set(command.group, group)
  }

  return (Object.keys(GROUP_LABELS) as CommandGroup[]).flatMap((group) => {
    const commands = byGroup.get(group)
    return commands ? [{ group, label: GROUP_LABELS[group], commands }] : []
  })
}

/** Every line a button runs, flattened: what the palette offers below `md`. */
export function tapLines(): string[] {
  return tapCommands().flatMap((group) => group.commands.flatMap((command) => command.lines))
}

/**
 * Whether the touch layout can run `line` when a link or a case study hands it over:
 * a link could run it, and it isn't a game. Wider than the buttons, since a text command
 * reading a file (`head about.txt`) prints something even without a pipe.
 */
export function tapRuns(line: string): boolean {
  const target = resolveLink(line)
  return target !== undefined && isLinkable(target.command, target.args) && !gameCommands.includes(target.command)
}
