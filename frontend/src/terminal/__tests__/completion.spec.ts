import { beforeEach, describe, expect, it } from 'vitest'
import { completeInput } from '@/composables/useTerminal'
import { sectionIds } from '@/content'
import { clearAliases, setAlias } from '../aliases'
import { FILES, listFiles } from '../commands/files'
import { SECRET_FILE } from '../commands/secret'
import { allCommands } from '../registry'

/**
 * Tab is the only way most of the registry is discoverable, so these cover the
 * word-splitting rules rather than any one command's candidate list — a command
 * declaring its own `complete()` is covered by the registry invariants below.
 */
describe('completeInput', () => {
  beforeEach(() => {
    clearAliases()
  })

  it('still completes the command word', () => {
    expect(completeInput('whoam')).toBe('whoami ')
  })

  it('leaves an unmatched command word alone', () => {
    expect(completeInput('zzzz')).toBe('zzzz')
  })

  it('completes an argument once the line has a space', () => {
    expect(completeInput('cat ab')).toBe('cat about.txt ')
  })

  it('offers every file on a bare trailing space', () => {
    // Ambiguous, so the line comes back unchanged — but the listing proves the
    // candidates were found.
    expect(completeInput('cat ')).toBe('cat ')
  })

  it('completes the second operand of diff too', () => {
    expect(completeInput('diff about.txt sk')).toBe('diff about.txt skills.txt ')
  })

  it('completes a section for cd', () => {
    const [first] = sectionIds
    expect(completeInput(`cd ${first!.slice(0, 3)}`)).toBe(`cd ${first} `)
  })

  it('inserts the common prefix when several candidates share one', () => {
    // `off`/`on` share `o`, which is already typed, so the line stands.
    expect(completeInput('gravity o')).toBe('gravity o')
    expect(completeInput('gravity of')).toBe('gravity off ')
  })

  it('returns the line untouched for a command with no candidates', () => {
    expect(completeInput('echo hello wor')).toBe('echo hello wor')
  })

  it('returns the line untouched after an unknown command', () => {
    expect(completeInput('zzzz ab')).toBe('zzzz ab')
  })

  it('preserves leading whitespace', () => {
    expect(completeInput('  cat ab')).toBe('  cat about.txt ')
  })

  it('completes the visitor’s own aliases as command words', () => {
    setAlias('zzt', 'cat about.txt')
    expect(completeInput('zz')).toBe('zzt ')
  })

  it('completes arguments through an alias, against the command that will run', () => {
    setAlias('zzt', 'cat')
    expect(completeInput('zzt ab')).toBe('zzt about.txt ')
  })

  it('completes alias names for unalias', () => {
    setAlias('zzt', 'cat')
    expect(completeInput('unalias zz')).toBe('unalias zzt ')
  })

  it('never leaks a hidden command through help', () => {
    // `help vi<Tab>` would hand out `vim` — the same leak `suggest()` refuses.
    expect(completeInput('help vi')).toBe('help vi')
  })
})

describe('listFiles', () => {
  it('lists the visible files', () => {
    expect(listFiles()).toEqual(expect.arrayContaining([...FILES]))
  })

  it('withholds a dotfile until its achievement is unlocked', () => {
    // Unlocked state is whatever localStorage holds; in a fresh jsdom it is empty,
    // so the dotfiles must be absent rather than advertised.
    expect(listFiles()).not.toContain(SECRET_FILE)
  })
})

describe('command.complete', () => {
  it('returns an array of strings wherever it is declared', () => {
    for (const command of allCommands()) {
      if (!command.complete) continue
      const result = command.complete({ args: [''], index: 0, word: '' })
      expect(Array.isArray(result), `${command.name}.complete`).toBe(true)
      for (const candidate of result) {
        expect(typeof candidate, `${command.name}.complete`).toBe('string')
      }
    }
  })

  it('offers nothing past the arguments it knows about', () => {
    // Guards the `index` contract: a command that ignored it would keep
    // suggesting filenames for a tenth operand it has no use for.
    for (const command of allCommands()) {
      if (!command.complete) continue
      expect(
        command.complete({ args: Array(10).fill(''), index: 9, word: '' }),
        `${command.name}.complete at index 9`,
      ).toEqual([])
    }
  })
})
