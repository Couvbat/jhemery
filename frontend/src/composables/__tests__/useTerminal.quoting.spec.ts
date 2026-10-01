import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the shell gives `echo`, `sign` and `ask` for quoted text, pinned before pipes
 * changed how a line is read. A line with no operator in it must reach every command
 * exactly as it did: the quotes the visitor typed, words split on spaces.
 */

const mocks = vi.hoisted(() => ({ askStream: vi.fn(), sign: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, askStream: mocks.askStream, sign: mocks.sign } }
})
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

import { setLocale } from '@/i18n'
import { submit, useTerminal } from '../useTerminal'

const { buffer, clearBuffer, run } = useTerminal()
const last = () => buffer.value.at(-1)!.text

beforeEach(() => {
  clearBuffer()
  setLocale('en')
  mocks.askStream.mockReset()
  mocks.sign.mockReset()
})

describe('quoting, as it was before pipes', () => {
  it.each([
    ['echo hi there', 'hi there'],
    ['echo "hi there"', '"hi there"'],
    ["echo 'single'", "'single'"],
    ['echo   spaced    out', 'spaced out'],
    ["echo c'est l'idée", "c'est l'idée"],
    ['echo {"a": 1}', '{"a": 1}'],
  ])('%s prints %s', async (input, printed) => {
    await run(input)
    expect(last()).toBe(printed)
  })

  it('hands sign the message with the quotes typed, and the name from the prompt', async () => {
    mocks.sign.mockResolvedValue({ id: '1', name: 'J', message: 'x', date: '2026-10-01' })
    const done = run('sign "great site"')
    await vi.waitFor(() => expect(buffer.value.some((l) => l.text.includes('your name'))).toBe(true))
    await submit('J')
    await done
    expect(mocks.sign).toHaveBeenCalledWith('J', '"great site"')
  })

  it("hands sign an elided French message whole: c'est top", async () => {
    mocks.sign.mockResolvedValue({ id: '1', name: 'J', message: 'x', date: '2026-10-01' })
    const done = run("sign c'est top, j'adore")
    await vi.waitFor(() => expect(buffer.value.some((l) => l.text.includes('your name'))).toBe(true))
    await submit('J')
    await done
    expect(mocks.sign).toHaveBeenCalledWith('J', "c'est top, j'adore")
  })

  it('unquotes the question it hands ask', async () => {
    mocks.askStream.mockImplementation(async function* () {
      yield 'ok'
    })
    await run('ask "where does he work?"')
    expect(mocks.askStream.mock.calls[0]![0]).toBe('where does he work?')
  })
})
