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
/** The completed line alone, for the cases where the caret is not the point. */
const line = (value: string, caret?: number) => completeInput(value, caret).value

describe('completeInput', () => {
  beforeEach(() => {
    clearAliases()
  })

  it('still completes the command word', () => {
    expect(line('whoam')).toBe('whoami ')
  })

  it('leaves an unmatched command word alone', () => {
    expect(line('zzzz')).toBe('zzzz')
  })

  it('completes an argument once the line has a space', () => {
    expect(line('cat ab')).toBe('cat about.txt ')
  })

  it('offers every file on a bare trailing space', () => {
    // Ambiguous, so the line comes back unchanged — but the listing proves the
    // candidates were found.
    expect(line('cat ')).toBe('cat ')
  })

  it('completes the second operand of diff too', () => {
    expect(line('diff about.txt sk')).toBe('diff about.txt skills.txt ')
  })

  it('completes a section for cd', () => {
    const [first] = sectionIds
    expect(line(`cd ${first!.slice(0, 3)}`)).toBe(`cd ${first} `)
  })

  it('inserts the common prefix when several candidates share one', () => {
    // `off`/`on` share `o`, which is already typed, so the line stands.
    expect(line('gravity o')).toBe('gravity o')
    expect(line('gravity of')).toBe('gravity off ')
  })

  it('returns the line untouched for a command with no candidates', () => {
    expect(line('echo hello wor')).toBe('echo hello wor')
  })

  it('returns the line untouched after an unknown command', () => {
    expect(line('zzzz ab')).toBe('zzzz ab')
  })

  it('preserves leading whitespace', () => {
    expect(line('  cat ab')).toBe('  cat about.txt ')
  })

  it('completes the visitor’s own aliases as command words', () => {
    setAlias('zzt', 'cat about.txt')
    expect(line('zz')).toBe('zzt ')
  })

  it('completes arguments through an alias, against the command that will run', () => {
    setAlias('zzt', 'cat')
    expect(line('zzt ab')).toBe('zzt about.txt ')
  })

  it('completes alias names for unalias', () => {
    setAlias('zzt', 'cat')
    expect(line('unalias zz')).toBe('unalias zzt ')
  })

  it('never leaks a hidden command through help', () => {
    // `help vi<Tab>` would hand out `vim` — the same leak `suggest()` refuses.
    expect(line('help vi')).toBe('help vi')
  })

  it('completes the word the caret is in, not the end of the line', () => {
    // `cat ab|out` — the tail is somebody else's word and stays put.
    expect(completeInput('cat ab out', 6)).toEqual({ value: 'cat about.txt  out', caret: 14 })
  })

  it('reads only the text behind the caret as the prefix', () => {
    // The caret sits after `ab`, so `.txt` behind it plays no part in matching.
    expect(line('cat abzzz', 6)).toBe('cat about.txt zzz')
  })

  it('keeps the whitespace the visitor typed', () => {
    expect(line('cat  ab')).toBe('cat  about.txt ')
  })

  it('leaves the caret alone when nothing completes', () => {
    expect(completeInput('zzzz ab', 4)).toEqual({ value: 'zzzz ab', caret: 4 })
  })

  it('puts the caret after the inserted common prefix', () => {
    expect(completeInput('gravity of')).toEqual({ value: 'gravity off ', caret: 12 })
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
