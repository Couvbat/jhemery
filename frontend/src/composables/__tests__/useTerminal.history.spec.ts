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
import { history } from '@/terminal/history'
import { recallHistory, runLink, submit, useTerminal } from '../useTerminal'

const { buffer, clearBuffer } = useTerminal()
const texts = () => buffer.value.map((l) => l.text)

const answerName = async (name: string) => {
  await vi.waitFor(() => expect(texts().some((l) => l.includes('your name'))).toBe(true))
  await submit(name)
}

beforeEach(() => {
  clearBuffer()
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

  it('never sends what !! turned into: into history instead, one ↑ away', async () => {
    history.value = ['sign hi']
    await submit('!!')
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(texts()).toContain(messages.terminal.histverify.en)
    expect(history.value.at(-1)).toBe('sign hi')
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
  it('walks only the lines starting with what was typed, then back to it', () => {
    history.value = ['theme nord', 'ls', 'theme dracula', 'cat about.txt']
    expect(recallHistory(-1, 'the')).toBe('theme dracula')
    expect(recallHistory(-1, 'theme dracula')).toBe('theme nord')
    expect(recallHistory(-1, 'theme nord')).toBe('theme nord')
    expect(recallHistory(1, 'theme nord')).toBe('theme dracula')
    expect(recallHistory(1, 'theme dracula')).toBe('the')
  })

  it('walks everything from an empty line, as before', () => {
    history.value = ['a', 'b']
    expect(recallHistory(-1, '')).toBe('b')
    expect(recallHistory(-1, 'b')).toBe('a')
    expect(recallHistory(1, 'a')).toBe('b')
    expect(recallHistory(1, 'b')).toBe('')
  })
})
