import { beforeEach, describe, expect, it } from 'vitest'
import { clearAliases, expandAliases, parseDefinition, removeAlias, setAlias } from '../aliases'

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
