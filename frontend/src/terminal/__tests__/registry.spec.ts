import { describe, expect, it } from 'vitest'
import type { Command } from '../types'
import {
  allCommands,
  commonPrefix,
  complete,
  completionNames,
  isLinkable,
  paletteCommands,
  resolve,
  resolveLink,
  suggest,
  suggestionPool,
  visibleCommands,
  writesOf,
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

  it('counts two swapped letters as one slip', () => {
    expect(suggest('hlep')).toBe('help')
    expect(suggest('celar')).toBe('clear')
  })

  it('does not call a different short word a typo', () => {
    // `where` is two substitutions from `theme` — a question, not a misspelling.
    expect(suggest('where')).toBeUndefined()
  })

  it('allows a longer name two slips', () => {
    expect(suggest('nefecth')).toBe('neofetch')
    expect(suggest('achievmnts')).toBe('achievements')
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

describe('what a command writes', () => {
  const VALUES = ['none', 'local', 'server']

  it('is declared by every command, as one of the three values', () => {
    for (const command of allCommands()) {
      for (const args of [[], ['x'], ['reset'], ['share'], ['-d']]) {
        expect(VALUES, `${command.name} ${args.join(' ')}`).toContain(writesOf(command, args))
      }
    }
  })

  // The whole classification, pinned in both directions: a writer quietly downgraded to
  // `none` fails here, and so does a new writer nobody looked at. A new command lands in
  // one of these lists, or among the `none` ones, on purpose.
  it('pins which commands write, and how', () => {
    const named = (keep: (c: Command) => boolean) =>
      allCommands()
        .filter(keep)
        .map((c) => c.name)
        .sort()
    expect(named((c) => c.writes === 'server')).toEqual(['ask', 'connect4', 'mail', 'sign', 'sudo'])
    expect(named((c) => c.writes === 'local')).toEqual([
      ':q', 'alias', 'banner', 'clear', 'constellation', 'cowsay', 'crt', 'decrypt', 'echo',
      'flag', 'gravity', 'jq', 'open', 'play', 'rickroll', 'spawn', 'unalias', 'vim',
    ])
    expect(named((c) => typeof c.writes === 'function')).toEqual(['base64', 'hack', 'lang', 'scene', 'theme', 'wordle'])
  })

  // The arguments that make the function-form ones write, and one reason per line a link
  // must not run the command.
  it.each([
    ['sign', ['hi'], 'server'],
    ['mail', [], 'server'],
    ['ask', ['who'], 'server'],
    ['sudo', [], 'server'],
    ['connect4', [], 'server'],
    ['echo', ['hi'], 'local'],
    ['banner', ['hi'], 'local'],
    ['theme', ['dracula'], 'local'],
    ['lang', ['fr'], 'local'],
    ['alias', ["x='ls'"], 'local'],
    ['unalias', ['x'], 'local'],
    ['open', ['github'], 'local'],
    ['play', [], 'local'],
    ['crt', [], 'local'],
    ['vim', [], 'local'],
    [':q', [], 'local'],
    ['flag', ['CTF{x}'], 'local'],
    ['decrypt', [], 'local'],
    ['wordle', ['share'], 'local'],
    ['base64', ['-d', 'aGk='], 'local'],
    ['base64', ['--decode', 'aGk='], 'local'],
    ['jq', ['.', '{}'], 'local'],
    ['clear', [], 'local'],
    ['scene', ['reset'], 'local'],
    ['hack', ['mainframe'], 'local'],
  ] as const)('%s %j writes %s', (name, args, expected) => {
    expect(writesOf(resolve(name)!, args)).toBe(expected)
  })

  it.each([
    ['theme', []],
    ['lang', []],
    ['wordle', []],
    ['wordle', ['daily']],
    ['base64', ['hi']],
    ['scene', []],
    ['hack', []],
  ] as const)('%s %j only reads', (name, args) => {
    expect(writesOf(resolve(name)!, args)).toBe('none')
  })
})

describe('links (?run=)', () => {
  /**
   * A link is written by someone other than the person who clicks it. `isLinkable` is
   * the one test: opted in, not hidden, and writing nothing, for these arguments.
   */
  // Against built commands rather than the registry, so each condition is shown to matter
  // on its own: the real list has no hidden linkable command to prove that one with.
  const stub = (fields: Partial<Command>): Command => ({
    name: 'stub',
    description: { en: '', fr: '' },
    group: 'core',
    writes: 'none',
    linkable: true,
    run: () => {},
    ...fields,
  })

  it('needs every one of its conditions', () => {
    expect(isLinkable(stub({}))).toBe(true)
    expect(isLinkable(stub({ linkable: undefined }))).toBe(false)
    expect(isLinkable(stub({ hidden: true }))).toBe(false)
    expect(isLinkable(stub({ writes: 'local' }))).toBe(false)
    expect(isLinkable(stub({ writes: (args) => (args[0] ? 'server' : 'none'), complete: () => ['x'] }), ['x'])).toBe(false)
    expect(isLinkable(stub({ linkable: (args) => args.length === 0, complete: () => ['x'] }), ['x'])).toBe(false)
  })

  // A link's author picks its arguments, and the line is echoed as if the visitor typed it.
  it('accepts only arguments the command itself offers', () => {
    expect(isLinkable(stub({}), ['your', 'session', 'expired'])).toBe(false)
    expect(isLinkable(stub({ complete: () => ['daily'] }), ['daily'])).toBe(true)
    expect(isLinkable(stub({ complete: () => ['daily'] }), ['DAILY'])).toBe(true)
    expect(isLinkable(stub({ complete: () => ['daily'] }), ['daily', 'extra'])).toBe(false)
    expect(isLinkable(resolve('whoami')!, ['SESSION', 'EXPIRED'])).toBe(false)
  })

  it('still links the arguments the site hands out or documents', () => {
    for (const [name, args] of [
      ['wordle', ['daily']],
      ['projects', ['--json']],
      ['hardware', ['pc']],
      ['curl', ['jhemery.xyz']],
      ['help', ['ls']],
      ['ls', ['about']],
      ['skills', ['--why']],
      ['tools', ['qr']],
    ] as const) {
      expect(isLinkable(resolve(name)!, args), `${name} ${args.join(' ')}`).toBe(true)
    }
  })

  it('never lets a link run anything that writes, or anything hidden', () => {
    for (const command of allCommands()) {
      for (const args of [[], ['x'], ['share'], ['dracula'], ['-d'], ['reset']]) {
        if (!isLinkable(command, args)) continue
        expect(writesOf(command, args), command.name).toBe('none')
        expect(command.hidden, `${command.name} is linkable and hidden`).toBeFalsy()
      }
    }
  })

  it('refuses the arguments that would hand out something hidden', () => {
    expect(isLinkable(resolve('help')!, [])).toBe(true)
    expect(isLinkable(resolve('help')!, ['ls'])).toBe(true)
    expect(isLinkable(resolve('help')!, ['vim'])).toBe(false)
    expect(isLinkable(resolve('help')!, ['--all'])).toBe(false)
    for (const hidden of allCommands().filter((c) => c.hidden)) {
      expect(isLinkable(resolve('help')!, [hidden.name]), hidden.name).toBe(false)
    }
    expect(isLinkable(resolve('ls')!, [])).toBe(true)
    expect(isLinkable(resolve('ls')!, ['-a'])).toBe(false)
    expect(isLinkable(resolve('ls')!, ['-la', 'about'])).toBe(false)
  })

  it('has something worth linking to', () => {
    expect(allCommands().filter((c) => isLinkable(c)).map((c) => c.name)).toEqual(
      expect.arrayContaining(['neofetch', 'projects', 'wordle', 'ctf', 'tour', 'why']),
    )
  })

  it('resolves two-word names and splits off the arguments', () => {
    expect(resolveLink('wordle daily')).toMatchObject({ command: { name: 'wordle' }, args: ['daily'] })
    expect(resolveLink('git log')).toMatchObject({ command: { name: 'gitlog' }, args: [] })
    expect(resolveLink('nope')).toBeUndefined()
  })
})

describe('prompt suggestions', () => {
  it('only suggests visible commands that run without an argument', () => {
    const pool = suggestionPool()
    expect(pool.length).toBeGreaterThan(3)
    for (const name of pool) {
      const command = resolve(name)!
      expect(command.hidden, name).toBeFalsy()
      expect(command.usage ?? '', name).not.toContain('<')
    }
  })
})
