import { beforeEach, describe, expect, it } from 'vitest'
import { useTerminal } from '@/composables/useTerminal'
import { clearAliases, expandAliases, parseDefinition, removeAlias, setAlias } from '../aliases'
import { coreCommands } from '../commands/core'
import { runCommand } from './context'

beforeEach(() => {
  clearAliases()
})

describe('parseDefinition', () => {
  it('accepts `name=value`', () => {
    expect(parseDefinition('gl=git log')).toEqual({ name: 'gl', value: 'git log' })
  })

  it('accepts spaces around the equals sign', () => {
    expect(parseDefinition('gl = git log')).toEqual({ name: 'gl', value: 'git log' })
  })

  it('accepts a bare space separator', () => {
    expect(parseDefinition('gl git log')).toEqual({ name: 'gl', value: 'git log' })
  })

  it('strips matching surrounding quotes', () => {
    expect(parseDefinition("gl='git log'")).toEqual({ name: 'gl', value: 'git log' })
    expect(parseDefinition('gl="git log"')).toEqual({ name: 'gl', value: 'git log' })
  })

  it('leaves mismatched quotes alone rather than guessing', () => {
    expect(parseDefinition('gl=\'git log"')).toEqual({ name: 'gl', value: '\'git log"' })
  })

  it('rejects a name with no value', () => {
    expect(parseDefinition('gl')).toBeUndefined()
    expect(parseDefinition('gl=')).toBeUndefined()
  })
})

describe('expandAliases', () => {
  it('leaves an unknown head word alone', () => {
    expect(expandAliases('ls -a')).toBe('ls -a')
  })

  it('rewrites the head word', () => {
    setAlias('gl', 'git log')
    expect(expandAliases('gl')).toBe('git log')
  })

  it('keeps the arguments that followed', () => {
    setAlias('gl', 'git log')
    expect(expandAliases('gl --oneline')).toBe('git log --oneline')
  })

  it('follows a chain of aliases', () => {
    setAlias('a', 'b')
    setAlias('b', 'ls -a')
    expect(expandAliases('a')).toBe('ls -a')
  })

  it('stops instead of looping on a self-referential alias', () => {
    setAlias('loop', 'loop')
    expect(expandAliases('loop')).toBe('loop')
  })

  it('stops instead of looping on a cycle', () => {
    setAlias('a', 'b')
    setAlias('b', 'a')
    expect(expandAliases('a')).toBe('a')
  })

  it('matches case-insensitively', () => {
    setAlias('gl', 'git log')
    expect(expandAliases('GL')).toBe('git log')
  })

  it('stops resolving once an alias is removed', () => {
    setAlias('gl', 'git log')
    expect(removeAlias('gl')).toBe(true)
    expect(removeAlias('gl')).toBe(false)
    expect(expandAliases('gl')).toBe('gl')
  })
})

// A stored alias can predate a command of the same name: §H adds tour, why, grep and
// more. `alias` refuses a command's name only when the alias is defined.
describe('an alias a later command shadows', () => {
  const isCommand = (name: string) => name === 'tour'

  it('is not expanded: the command wins', () => {
    setAlias('tour', 'echo mine')
    expect(expandAliases('tour', isCommand)).toBe('tour')
    expect(expandAliases('tour --fast', isCommand)).toBe('tour --fast')
  })

  it('still lets an alias expand into a command', () => {
    setAlias('t', 'tour')
    expect(expandAliases('t', isCommand)).toBe('tour')
  })

  it('runs the real command in the shell', async () => {
    const { buffer, clearBuffer, run } = useTerminal()
    clearBuffer()
    setAlias('whoami', 'echo hijacked')
    await run('whoami')
    expect(buffer.value.map((l) => l.text).join('\n')).not.toContain('hijacked')
  })

  // `git log` is a two-word command; an alias named `git` would hide it just the same.
  it('does not hide a two-word command behind its first word', async () => {
    const { buffer, clearBuffer, run } = useTerminal()
    clearBuffer()
    setAlias('git', 'echo hijacked')
    await run('git log')
    expect(buffer.value.map((l) => l.text).join('\n')).not.toContain('hijacked')
  })

  it('refuses to define an alias on the first word of a two-word command', async () => {
    const alias = coreCommands.find((c) => c.name === 'alias')!
    const { lines } = await runCommand(alias, ["git='echo", "x'"])
    expect(lines.map((l) => l.text).join('\n')).toContain('already a command')
  })

  // Tab completes against what Enter will run.
  it('completes against the command, not an alias it shadows', () => {
    const { completeInput } = useTerminal()
    setAlias('cd', 'theme')
    setAlias('zz', 'cd')
    // `zz` → `cd`, which is a command, so the stored `cd` → `theme` alias never applies.
    expect(completeInput('zz dra').value).not.toContain('dracula')
  })

  it('is marked in the alias listing', async () => {
    setAlias('whoami', 'echo hijacked')
    setAlias('gl', 'git log')
    const alias = coreCommands.find((c) => c.name === 'alias')!
    const { lines } = await runCommand(alias)
    const listed = lines.map((l) => l.text)
    expect(listed.find((t) => t.startsWith('whoami'))).toContain('(shadowed by a command)')
    expect(listed.find((t) => t.startsWith('gl'))).not.toContain('shadowed')
  })
})
