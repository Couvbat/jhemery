import { describe, expect, it } from 'vitest'
import {
  allCommands,
  commonPrefix,
  complete,
  completionNames,
  paletteCommands,
  resolve,
  suggest,
  visibleCommands,
} from '../registry'

/**
 * "The registry is the API" (features-spec §2): `help`, tab-completion and the
 * command palette are all derived from this array, so a duplicate name or a
 * missing translation silently degrades three surfaces at once rather than
 * throwing anywhere. These are the invariants that keep that derivation honest.
 */
describe('command registry', () => {
  const commands = allCommands()

  it('registers commands', () => {
    expect(commands.length).toBeGreaterThan(0)
  })

  it('has no duplicate names', () => {
    const names = commands.map((c) => c.name)
    expect(names).toHaveLength(new Set(names).size)
  })

  it('has no name or alias claimed twice', () => {
    // `resolve` is a flat Map, so the second registration of a token would
    // silently shadow the first — the shadowed command becomes unreachable.
    const seen = new Map<string, string>()
    for (const command of commands) {
      for (const token of [command.name, ...(command.aliases ?? [])]) {
        expect(
          seen.has(token),
          `"${token}" is claimed by both ${seen.get(token)} and ${command.name}`,
        ).toBe(false)
        seen.set(token, command.name)
      }
    }
  })

  it('uses lowercase names and aliases', () => {
    // `resolve` lowercases its input, so an uppercase registration is unreachable.
    for (const command of commands) {
      for (const token of [command.name, ...(command.aliases ?? [])]) {
        expect(token, `"${token}" is not lowercase`).toBe(token.toLowerCase())
      }
    }
  })

  it('describes every command in both locales', () => {
    for (const command of commands) {
      expect(command.description.en, `${command.name} is missing an en description`).toBeTruthy()
      expect(command.description.fr, `${command.name} is missing a fr description`).toBeTruthy()
    }
  })

  it('gives every command a runnable handler and a known group', () => {
    const groups = new Set(['core', 'navigate', 'content', 'live', 'fun'])
    for (const command of commands) {
      expect(typeof command.run, `${command.name}.run`).toBe('function')
      expect(groups.has(command.group), `${command.name} has group "${command.group}"`).toBe(true)
    }
  })

  it('never surfaces a hidden command in the palette', () => {
    // Hidden commands are the easter eggs — putting one in Ctrl+K gives it away.
    for (const command of paletteCommands()) {
      expect(command.hidden, `${command.name} is both hidden and in the palette`).toBeFalsy()
    }
  })
})

describe('resolve', () => {
  it('finds a command by name', () => {
    expect(resolve('help')?.name).toBe('help')
  })

  it('is case-insensitive', () => {
    expect(resolve('HELP')?.name).toBe('help')
  })

  it('finds a command by alias', () => {
    const withAlias = allCommands().find((c) => (c.aliases?.length ?? 0) > 0)!
    expect(resolve(withAlias.aliases![0]!)?.name).toBe(withAlias.name)
  })

  it('resolves hidden commands even though they are not listed', () => {
    // Finding them is the point; they still have to run once found.
    const hidden = allCommands().filter((c) => c.hidden)
    expect(hidden.length).toBeGreaterThan(0)
    for (const command of hidden) {
      expect(resolve(command.name)?.name).toBe(command.name)
    }
  })

  it('returns undefined for an unknown name', () => {
    expect(resolve('definitely-not-a-command')).toBeUndefined()
  })
})

describe('completion', () => {
  it('omits hidden commands', () => {
    const names = completionNames()
    for (const command of allCommands().filter((c) => c.hidden)) {
      expect(names, `${command.name} leaked into tab-completion`).not.toContain(command.name)
    }
  })

  it('includes every visible command and its aliases', () => {
    const names = completionNames()
    for (const command of visibleCommands()) {
      expect(names).toContain(command.name)
      for (const alias of command.aliases ?? []) expect(names).toContain(alias)
    }
  })

  it('is sorted', () => {
    const names = completionNames()
    expect(names).toEqual([...names].sort())
  })

  it('matches on prefix', () => {
    expect(complete('hel')).toContain('help')
  })

  it('returns nothing for an unmatched prefix', () => {
    expect(complete('zzzz')).toEqual([])
  })

  it('returns every name for an empty prefix', () => {
    expect(complete('')).toEqual(completionNames())
  })
})

describe('commonPrefix', () => {
  it('is empty for no candidates', () => {
    expect(commonPrefix([])).toBe('')
  })

  it('returns the only candidate whole', () => {
    expect(commonPrefix(['help'])).toBe('help')
  })

  it('returns the longest shared prefix', () => {
    expect(commonPrefix(['contact', 'content', 'context'])).toBe('cont')
  })

  it('is empty when nothing is shared', () => {
    expect(commonPrefix(['help', 'vim'])).toBe('')
  })

  it('stops at the shorter candidate', () => {
    expect(commonPrefix(['cat', 'catalog'])).toBe('cat')
  })
})

describe('suggest', () => {
  it('suggests a near miss', () => {
    expect(suggest('halp')).toBe('help')
  })

  it('suggests nothing for input that resembles no command', () => {
    expect(suggest('qwertyuiop')).toBeUndefined()
  })

  it('never suggests a hidden command', () => {
    // Suggesting `vim` to someone who typed `vom` would hand out an easter egg.
    const hidden = new Set(allCommands().filter((c) => c.hidden).map((c) => c.name))
    for (const name of hidden) {
      const result = suggest(name.slice(0, -1) + 'z')
      if (result) expect(hidden.has(result), `suggest leaked "${result}"`).toBe(false)
    }
  })
})
