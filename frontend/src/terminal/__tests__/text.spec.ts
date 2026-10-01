import { describe, expect, it } from 'vitest'
import { textCommands } from '../commands/text'
import { isLinkable } from '../registry'
import type { OutputLine } from '../types'
import { runCommand } from './context'

const command = (name: string) => textCommands.find((c) => c.name === name)!
const lines = (...texts: string[]): OutputLine[] => texts.map((text) => ({ text }))
const piped = async (name: string, args: string[], stdin: OutputLine[]) => (await runCommand(command(name), args, { stdin })).lines
const text = (out: OutputLine[]) => out.map((l) => l.text)

const input = lines('Alpha one', 'beta two', 'gamma three', 'beta two', 'alpha four')

describe('grep', () => {
  it('keeps the lines containing the text, literally', async () => {
    expect(text(await piped('grep', ['beta'], input))).toEqual(['beta two', 'beta two'])
    // A regex metacharacter is just a character: no RegExp is built from input.
    expect(text(await piped('grep', ['.*'], lines('a.*b', 'ab')))).toEqual(['a.*b'])
    expect(text(await piped('grep', ['"two', 'words"'], lines('two words here', 'two')))).toEqual(['two words here'])
  })

  it('takes -i, -v, -n and -c, alone or combined', async () => {
    expect(text(await piped('grep', ['-i', 'alpha'], input))).toEqual(['Alpha one', 'alpha four'])
    expect(text(await piped('grep', ['-v', 'beta'], input))).toEqual(['Alpha one', 'gamma three', 'alpha four'])
    expect(text(await piped('grep', ['-n', 'beta'], input))).toEqual(['2:beta two', '4:beta two'])
    expect(text(await piped('grep', ['-c', 'beta'], input))).toEqual(['2'])
    expect(text(await piped('grep', ['-ic', 'ALPHA'], input))).toEqual(['2'])
  })

  it('keeps a matched line’s colours, and gives -n a prefix of its own', async () => {
    const coloured: OutputLine = { text: 'hi there', segments: [{ text: 'hi', tone: 'primary' }, { text: ' there' }] }
    expect((await piped('grep', ['hi'], [coloured]))[0]).toBe(coloured)
    expect((await piped('grep', ['-n', 'hi'], [coloured]))[0]!.segments).toEqual([
      { text: '1:', tone: 'muted' },
      ...coloured.segments!,
    ])
  })

  it('reads a file, and fails without a pattern, a file or a pipe', async () => {
    expect(text((await runCommand(command('grep'), ['Jules', 'about.txt'])).lines).length).toBeGreaterThan(0)
    for (const args of [[], ['x'], ['x', 'nope.txt'], ['-z', 'x']]) {
      const out = (await runCommand(command('grep'), args)).lines
      expect(out[0], args.join(' ')).toMatchObject({ tone: 'error', stderr: true })
    }
  })
})

describe('head and tail', () => {
  const many = lines(...Array.from({ length: 15 }, (_, i) => `l${i + 1}`))

  it('take ten by default, or -n N, or -N', async () => {
    expect(text(await piped('head', [], many))).toHaveLength(10)
    expect(text(await piped('head', ['-n', '2'], many))).toEqual(['l1', 'l2'])
    expect(text(await piped('head', ['-3'], many))).toEqual(['l1', 'l2', 'l3'])
    expect(text(await piped('head', ['-n3'], many))).toEqual(['l1', 'l2', 'l3'])
    expect(text(await piped('tail', [], many))).toEqual(text(many.slice(5)))
    expect(text(await piped('tail', ['-n', '2'], many))).toEqual(['l14', 'l15'])
    expect(text(await piped('tail', ['-0'], many))).toEqual([])
  })

  it('want a number after -n', async () => {
    expect((await piped('head', ['-n', 'x'], many))[0]).toMatchObject({ stderr: true })
  })
})

describe('wc', () => {
  it('counts lines, words and bytes as a file would, or one of them', async () => {
    const two = lines('hello world', 'é')
    expect(text(await piped('wc', [], two))).toEqual([' 2  3 15'])
    expect(text(await piped('wc', ['-l'], two))).toEqual(['2'])
    expect(text(await piped('wc', ['-w'], two))).toEqual(['3'])
    expect(text(await piped('wc', ['-c'], two))).toEqual(['15'])
    expect(text(await piped('wc', ['-lw'], two))).toEqual(['2 3'])
  })

  it('names the file it counted', async () => {
    expect(text((await runCommand(command('wc'), ['-l', 'about.txt'])).lines)[0]).toMatch(/^\d+ about\.txt$/)
  })
})

describe('sort and uniq', () => {
  it('sorts, numerically with -n, backwards with -r, once each with -u', async () => {
    expect(text(await piped('sort', [], lines('b', 'a', 'c')))).toEqual(['a', 'b', 'c'])
    expect(text(await piped('sort', ['-n'], lines('10', '9', 'x', '2')))).toEqual(['x', '2', '9', '10'])
    expect(text(await piped('sort', ['-r'], lines('b', 'a', 'c')))).toEqual(['c', 'b', 'a'])
    expect(text(await piped('sort', ['-u'], lines('b', 'a', 'b')))).toEqual(['a', 'b'])
  })

  it('folds neighbouring repeats, counting them with -c', async () => {
    const repeated = lines('a', 'a', 'b', 'a')
    expect(text(await piped('uniq', [], repeated))).toEqual(['a', 'b', 'a'])
    expect(text(await piped('uniq', ['-c'], repeated))).toEqual(['      2 a', '      1 b', '      1 a'])
  })
})

describe('all of them', () => {
  it('write nothing and may run from a link', () => {
    for (const c of textCommands) expect(isLinkable(c, []), c.name).toBe(true)
  })

  it('say what they need when there is nothing to read', async () => {
    for (const c of textCommands.filter((c) => c.name !== 'grep')) {
      expect((await runCommand(c, [])).lines[0], c.name).toMatchObject({ tone: 'error', stderr: true })
    }
  })
})
