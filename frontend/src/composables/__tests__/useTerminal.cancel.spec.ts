import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ askStream: vi.fn(), lab: vi.fn() }))

// The animated commands only pace themselves when motion is allowed, and it is
// the paced ones that are interesting here — an instant command is over before
// there is anything to cancel.
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => false,
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, askStream: mocks.askStream, lab: mocks.lab } }
})

import { messages } from '@/i18n/messages'
import { setLocale } from '@/i18n'
import { cancel, useTerminal } from '../useTerminal'

const { buffer, clearBuffer, pendingPrompt, run, submit } = useTerminal()
const CANCELLED = messages.terminal.cancelled.en

function cancelledCount() {
  return buffer.value.filter((l) => l.text === CANCELLED).length
}

describe('cancel()', () => {
  beforeEach(() => {
    clearBuffer()
    setLocale('en')
    mocks.askStream.mockReset()
    vi.useFakeTimers()
  })

  it('prints one line at an idle prompt', () => {
    cancel()

    expect(cancelledCount()).toBe(1)
  })

  it('prints one line for a running command, not two', async () => {
    const done = run('sl')
    // Let the first frame land so the command is genuinely mid-animation.
    await vi.advanceTimersByTimeAsync(60)

    cancel()
    await done

    // The regression: `cancel()` printed unconditionally and `execute()` printed
    // again when the `AbortError` unwound, so `^C cancelled` showed up twice.
    expect(cancelledCount()).toBe(1)
  })

  it('prints one line for a command holding the keyboard', async () => {
    const done = run('2048')
    await vi.advanceTimersByTimeAsync(0)

    cancel()
    await done

    expect(cancelledCount()).toBe(1)
  })

  it('prints one line for a pending prompt', async () => {
    const done = submit('rickroll')
    await vi.advanceTimersByTimeAsync(0)
    expect(pendingPrompt.value).not.toBeNull()

    cancel()
    await done

    expect(cancelledCount()).toBe(1)
    expect(pendingPrompt.value).toBeNull()
  })

  it('closes the lab shell with one line, after echoing its prompt inline', async () => {
    mocks.lab.mockResolvedValue({ configured: false })
    const done = submit('ssh poseidon')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(pendingPrompt.value?.question).toBe('jules@poseidon:~$')

    const at = buffer.value.length
    await submit('whoami')
    await vi.advanceTimersByTimeAsync(0)
    // The prompt and the line typed at it are one line, as a shell's are; never the
    // question on a line of its own.
    expect(buffer.value.slice(at, at + 2).map((l) => l.text)).toEqual(['jules@poseidon:~$ whoami', 'jules'])
    expect(buffer.value.some((l) => l.text === 'jules@poseidon:~$')).toBe(false)

    cancel()
    await done
    expect(buffer.value.at(-2)?.text).toBe('Connection to poseidon closed.')
    expect(cancelledCount()).toBe(1)
  })

  it('prints one line for a command that swallows the abort itself', async () => {
    // `ask` keeps whatever the stream delivered before the Ctrl+C and returns
    // normally, so the line has to come from the shell rather than from an
    // `AbortError` reaching `execute()`.
    mocks.askStream.mockImplementation(async function* (
      _question: string,
      _locale: string,
      signal?: AbortSignal,
    ) {
      yield 'partial'
      await new Promise<void>((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')), {
          once: true,
        })
      })
    })

    const done = run('ask "who are you"')
    await vi.advanceTimersByTimeAsync(0)

    cancel()
    await done

    expect(cancelledCount()).toBe(1)
    expect(buffer.value.some((l) => l.text.includes('partial'))).toBe(true)
  })
})
