import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))
const mocks = vi.hoisted(() => ({ sign: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, sign: mocks.sign } }
})

import { setLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { clearAliases, setAlias } from '@/terminal/aliases'
import { history } from '@/terminal/history'
import { recallHistory, resetRecall, runLink, submit, useTerminal } from '../useTerminal'

const { buffer, clearBuffer } = useTerminal()
const texts = () => buffer.value.map((l) => l.text)

const answerName = async (name: string) => {
  await vi.waitFor(() => expect(texts().some((l) => l.includes('your name'))).toBe(true))
  await submit(name)
}

beforeEach(() => {
  clearBuffer()
  clearAliases()
  resetRecall()
  setLocale('en')
  history.value = []
  mocks.sign.mockReset()
  mocks.sign.mockResolvedValue({ id: '1', name: 'J', message: 'x', date: '2026-10-01' })
})

describe('history expansion in the shell', () => {
  it('runs the expansion, echoed, and keeps it in history as it ran', async () => {
    history.value = ['whoami']
    await submit('!!')
    expect(texts()).toContain('couvbat')
    expect(buffer.value.find((l) => l.text === 'whoami' && !l.prompt)?.tone).toBe('muted')
    expect(history.value.at(-1)).toBe('whoami')
  })

  it('hands the guestbook the !! that was typed', async () => {
    history.value = ['ls']
    const done = submit('sign Great site!!')
    await answerName('J!!')
    await done
    // The prompt's answer is never expanded either.
    expect(mocks.sign).toHaveBeenCalledWith('J!!', 'Great site!!')
  })

  // `!-2` against a different last entry, so only the histverify push can make it the last.
  it('never sends what !! turned into: into history instead, one ↑ away', async () => {
    history.value = ['sign hi', 'ls']
    await submit('!-2')
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(texts()).toContain(messages.terminal.histverify.en)
    expect(history.value.at(-1)).toBe('sign hi')
  })

  // Found in review: an alias stood in for sign and got past both checks.
  it('treats an alias of sign as sign: never expanded, and held back when !! reaches it', async () => {
    setAlias('s', 'sign')
    history.value = ['whoami']
    const done = submit('s Great site!!')
    await answerName('J')
    await done
    expect(mocks.sign).toHaveBeenCalledWith('J', 'Great site!!')

    mocks.sign.mockClear()
    history.value = ['s hi']
    await submit('!!')
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(texts()).toContain(messages.terminal.histverify.en)
  })

  it('keeps a typed \\! in history, so recalling it is still literal', async () => {
    history.value = ['ls']
    await submit('echo \\!!')
    expect(texts()).toContain('!!')
    expect(history.value.at(-1)).toBe('echo \\!!')
  })

  it('reports a missing event and runs nothing', async () => {
    await submit('!7')
    expect(texts().at(-1)).toBe('couvsh: !7: event not found')
  })

  it('never expands a link', async () => {
    history.value = ['whoami']
    await runLink('!!')
    expect(buffer.value[0]!.tone).toBe('warning')
    expect(texts()).not.toContain('couvbat')
  })
})

describe('↑ with text is a prefix search', () => {
  it('walks only the lines starting with what was typed, each once, then back to it', () => {
    history.value = ['theme nord', 'ls', 'theme dracula', 'cat about.txt', 'theme dracula']
    expect(recallHistory(-1, 'the')).toBe('theme dracula')
    expect(recallHistory(-1, 'theme dracula')).toBe('theme nord')
    expect(recallHistory(-1, 'theme nord')).toBe('theme nord')
    expect(recallHistory(1, 'theme nord')).toBe('theme dracula')
    expect(recallHistory(1, 'theme dracula')).toBe('the')
  })

  it('starts afresh after typing', () => {
    history.value = ['theme nord', 'ls one', 'ls two']
    expect(recallHistory(-1, 'the')).toBe('theme nord')
    resetRecall()
    expect(recallHistory(-1, 'ls')).toBe('ls two')
  })

  it('walks everything from an empty line, as before', () => {
    history.value = ['a', 'b']
    expect(recallHistory(-1, '')).toBe('b')
    expect(recallHistory(-1, 'b')).toBe('a')
    expect(recallHistory(1, 'a')).toBe('b')
    expect(recallHistory(1, 'b')).toBe('')
  })
})
