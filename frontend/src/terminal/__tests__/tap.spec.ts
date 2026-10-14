import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

import { work } from '@/content'
import { touchLayout } from '@/composables/useTerminalShell'
import { messages } from '@/i18n/messages'
import { GROUP_LABELS } from '../commands/core'
import { gameCommands } from '../commands/games'
import { textCommands } from '../commands/text'
import { isGame } from '../games/scores'
import { isLinkable, resolve, resolveLink } from '../registry'
import { tapCommands, tapLines, tapRuns } from '../tap'
import { triesOnPhone, triesPath } from '../work'
import { runCommand } from './context'

const lines = tapLines()

describe('the tap shell’s buttons', () => {
  // A button runs through `runLink`, so it may offer nothing a `?run=` link couldn't.
  it.each(lines)('`%s` is a line a link could run', (line) => {
    const target = resolveLink(line)
    expect(target, line).toBeDefined()
    expect(isLinkable(target!.command, target!.args), line).toBe(true)
  })

  it('offers no game and no command that only reads a pipe', () => {
    const left = new Set([...gameCommands, ...textCommands])
    for (const line of lines) expect(left.has(resolveLink(line)!.command), line).toBe(false)
  })

  // The real test of "none needs a tty": each one run with nobody at the keyboard, where
  // `capture` and `prompt` throw. Live data is unreachable here, which every one of them
  // already has to survive.
  describe('none needs a keyboard', () => {
    beforeEach(() => {
      touchLayout.value = true
      vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')))
    })
    afterEach(() => {
      touchLayout.value = false
      vi.unstubAllGlobals()
    })

    it.each(lines)('`%s`', async (line) => {
      const { command, args } = resolveLink(line)!
      const { text } = await runCommand(command, args, { interactive: false })
      expect(text).not.toContain(messages.tapShell.notATty.en)
      expect(text).not.toContain(messages.terminal.notATty.en)
    })
  })

  it('comes in help’s groups, in help’s order, each command once', () => {
    const groups = tapCommands()
    const order = Object.keys(GROUP_LABELS)
    expect(groups.map((g) => order.indexOf(g.group))).toEqual([...groups.map((g) => order.indexOf(g.group))].sort((a, b) => a - b))
    for (const group of groups) {
      expect(group.label).toBe(GROUP_LABELS[group.group])
      for (const command of group.commands) {
        expect(resolve(command.name)!.group, command.name).toBe(group.group)
        expect(command.lines.every((line) => line === command.name || line.startsWith(`${command.name} `)), command.name).toBe(true)
      }
    }
    const names = groups.flatMap((g) => g.commands.map((c) => c.name))
    expect(new Set(names).size).toBe(names.length)
  })

  // The roadmap's examples, the storage inspector's `du`, and the ones a bio link wants.
  it.each(['projects qr', 'why polling', 'hardware nas', 'du', 'tour', 'neofetch', 'guestbook'])('has `%s`', (line) => {
    expect(lines).toContain(line)
  })

  // Their argument is another command: a row of them would be every command again.
  it('leaves out help, man and strace reading another command, but keeps `man jules`', () => {
    for (const line of lines) {
      const [name, arg] = line.split(' ')
      if (['help', 'man', 'strace'].includes(name!) && arg) expect(resolve(arg), line).toBeUndefined()
    }
    expect(lines).toContain('help')
    expect(lines).toContain('man jules')
  })
})

describe('tapRuns', () => {
  it('runs what a link could, unless it is a game', () => {
    expect(tapRuns('why polling')).toBe(true)
    expect(tapRuns('head about.txt')).toBe(true)
    expect(tapRuns('wordle daily')).toBe(false)
    expect(tapRuns('games')).toBe(false)
    expect(tapRuns('theme dracula')).toBe(false)
    expect(tapRuns('nope')).toBe(false)
  })
})

// The case-study page decides without the registry, so its rule is held to the shell's.
describe('a case study’s `try` on a phone', () => {
  const tries = work.flatMap((part) => (part.try && !triesPath(part.try) ? [part.try] : []))

  it.each(tries)('`%s` is offered exactly when the touch layout can run it', (line) => {
    expect(triesOnPhone(line)).toBe(tapRuns(line))
  })

  it('still names a game rather than linking it', () => {
    expect(tries).toContain('wordle daily')
    expect(triesOnPhone('wordle daily')).toBe(false)
  })

  it('knows every game by name, and nothing else', () => {
    for (const command of gameCommands) expect(isGame(command.name), command.name).toBe(command.name !== 'games')
    expect(isGame('neofetch')).toBe(false)
  })
})
