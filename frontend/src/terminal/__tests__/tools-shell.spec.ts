import { describe, expect, it } from 'vitest'
import { resolve } from '../registry'
import { operand } from '../commands/tools'
import { recordingContext } from './context'

/** Runs a line as typed: `raw` is the whole line (the tools read the word the visitor
 *  typed, `sha1sum`, and the spacing inside the text), args are split on spaces. */
async function shell(input: string) {
  const [name = '', ...args] = input.split(/\s+/)
  const { ctx } = recordingContext(name, args)
  const out = (await resolve(name)!.run({ ...ctx, raw: input })) ?? []
  return out.map((l) => l.text).join('\n')
}

describe('operand', () => {
  it('takes everything after the command word, keeping inner spacing', () => {
    expect(operand('sha256sum hello   world')).toBe('hello   world')
  })

  it('skips leading flags and strips outer quotes', () => {
    expect(operand(`base64 -d 'aGk='`, ['-d'])).toBe('aGk=')
    expect(operand(`jq . '{"a": 1}'`, ['.'])).toBe('{"a": 1}')
  })
})

describe('sha256sum', () => {
  it('hashes text, printing - as the name like a pipe would', async () => {
    expect(await shell('sha256sum abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  -',
    )
  })

  it('picks the algorithm from the name it was called by', async () => {
    expect(await shell('sha1sum abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d  -')
    expect((await shell('sha512sum abc')).split('  ')[0]).toHaveLength(128)
  })

  it('hashes a file from the fake filesystem by its name', async () => {
    const out = await shell('sha256sum about.txt')
    expect(out).toMatch(/^[0-9a-f]{64} {2}about\.txt$/)
    expect(out).not.toBe(await shell('sha256sum about.tx'))
  })

  it('explains that there are no pipes when given nothing', async () => {
    expect(await shell('sha256sum')).toContain('no pipes')
  })
})

describe('base64', () => {
  it('encodes and decodes UTF-8 both ways', async () => {
    expect(await shell('base64 héllo')).toBe('aMOpbGxv')
    expect(await shell('base64 -d aMOpbGxv')).toBe('héllo')
  })

  it('refuses input that is not base64', async () => {
    expect(await shell('base64 -d !!!')).toBe('base64: invalid input')
  })

  it('wraps at 76 columns, like GNU base64', async () => {
    const lines = (await shell('base64 about.txt')).split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.slice(0, -1).every((l) => l.length === 76)).toBe(true)
  })
})

describe('uuidgen', () => {
  it('prints a v4 UUID', async () => {
    expect(await shell('uuidgen')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('jq', () => {
  it('pretty-prints with the identity filter', async () => {
    expect(await shell(`jq . '{"a":[1,2]}'`)).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}')
  })

  it('points at the error in invalid JSON', async () => {
    expect(await shell(`jq . '{"a":}'`)).toMatch(/^jq: error: .* at line 1, column 6$/)
  })

  it('says only . is supported', async () => {
    expect(await shell('jq .a {}')).toContain('only the identity filter')
  })
})
