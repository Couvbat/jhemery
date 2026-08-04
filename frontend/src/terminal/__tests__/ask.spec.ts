import { watch } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  askStream: vi.fn(),
  reducedMotion: false,
}))

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => mocks.reducedMotion,
}))

// `ApiError` stays real — the degraded path branches on `instanceof` and status.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, askStream: mocks.askStream } }
})

import { ApiError } from '@/lib/api'
import { messages as m } from '@/i18n/messages'
import { setLocale } from '@/i18n'
import { suggest } from '@/terminal/registry'
import { unlocked } from '@/terminal/achievements'
import { useTerminal } from '@/composables/useTerminal'

const { buffer, clearBuffer, run } = useTerminal()

function texts(): string[] {
  return buffer.value.map((l) => l.text)
}

function yields(...deltas: string[]) {
  mocks.askStream.mockImplementation(async function* () {
    for (const delta of deltas) yield delta
  })
}

function fails(error: unknown) {
  // eslint-disable-next-line require-yield
  mocks.askStream.mockImplementation(async function* () {
    throw error
  })
}

/** The mock and the achievement set are module state, so each test starts clean. */
function reset() {
  clearBuffer()
  setLocale('en')
  unlocked.value = new Set()
  mocks.askStream.mockReset()
  mocks.reducedMotion = false
}

/** Every buffer the command wrote, so intermediate frames can be inspected. */
function recordFrames(): { frames: string[][]; stop: () => void } {
  const frames: string[][] = []
  const stop = watch(
    () => buffer.value,
    (lines) => frames.push(lines.map((l) => l.text)),
  )
  return { frames, stop }
}

describe('ask', () => {
  beforeEach(() => {
    reset()
  })

  it('leads with the disclaimer, before a single word of the answer', async () => {
    // A model paraphrasing someone's CV in the first person without a label is
    // a small lie, and the whole tone of the site depends on not telling those.
    yields('Yes, ', 'he does.')

    await run('ask does he know Rust')

    const disclaimer = texts().indexOf(m.ask.disclaimer.en)
    const answer = texts().findIndex((t) => t.includes('Yes, he does.'))
    expect(disclaimer).toBeGreaterThan(-1)
    expect(answer).toBeGreaterThan(disclaimer)
  })

  it('redraws the answer in place rather than stacking one copy per token', async () => {
    yields('Yes, ', 'he ', 'does.')

    await run('ask does he know Rust')

    expect(texts().filter((t) => t.includes('Yes, he does.'))).toHaveLength(1)
  })

  it('trails a cursor while streaming and drops it at the end', async () => {
    yields('Yes, ', 'he does.')
    const { frames, stop } = recordFrames()

    await run('ask does he know Rust')
    stop()

    expect(frames.some((f) => f.some((t) => t.includes('▌')))).toBe(true)
    expect(texts().some((t) => t.includes('▌'))).toBe(false)
  })

  it('prints the answer once under reduced motion', async () => {
    // Text appearing character by character is motion, and the rule has no
    // exception for text.
    mocks.reducedMotion = true
    yields('Yes, ', 'he ', 'does.')
    const { frames, stop } = recordFrames()

    await run('ask does he know Rust')
    stop()

    expect(frames.some((f) => f.some((t) => t.includes('▌')))).toBe(false)
    expect(texts().some((t) => t.includes('Yes, he does.'))).toBe(true)
  })

  it('sends the question without the quotes the not-found hint suggests', async () => {
    yields('sure')

    await run('ask "where does he work"')

    expect(mocks.askStream).toHaveBeenCalledWith('where does he work', 'en', expect.anything())
  })

  it('asks in the current locale', async () => {
    setLocale('fr')
    yields('oui')

    await run('ask parle-t-il rust')

    expect(mocks.askStream).toHaveBeenCalledWith('parle-t-il rust', 'fr', expect.anything())
  })

  it('refuses a question too short to be one', async () => {
    await run('ask hi')

    expect(mocks.askStream).not.toHaveBeenCalled()
    expect(texts().some((t) => t.startsWith('ask: usage'))).toBe(true)
  })

  it('refuses a question past the length the DTO accepts', async () => {
    await run(`ask ${'why '.repeat(80)}`)

    expect(mocks.askStream).not.toHaveBeenCalled()
    expect(texts().some((t) => t.includes('under 240 characters'))).toBe(true)
  })
})

describe('ask degradation', () => {
  beforeEach(() => {
    reset()
  })

  it('says the model is asleep when it is unreachable', async () => {
    fails(new ApiError('The model is unavailable', 502))

    await run('ask does he know Rust')

    expect(texts()).toContain(m.ask.asleep.en)
    expect(texts()).toContain(m.ask.asleepHint.en)
  })

  it('says the same thing when the fetch never lands', async () => {
    // Unconfigured, asleep and "the API is down" are one degraded path, not three.
    fails(new TypeError('Failed to fetch'))

    await run('ask does he know Rust')

    expect(texts()).toContain(m.ask.asleep.en)
  })

  it('distinguishes a busy model, because that is different advice', async () => {
    fails(new ApiError('One question at a time', 503))

    await run('ask does he know Rust')

    expect(texts()).toContain(m.ask.busy.en)
    expect(texts()).not.toContain(m.ask.asleep.en)
  })

  it('degrades rather than showing an empty answer', async () => {
    yields('', '   ')

    await run('ask does he know Rust')

    expect(texts()).toContain(m.ask.asleep.en)
  })

  it('replaces the placeholder instead of leaving it above the failure', async () => {
    fails(new ApiError('nope', 502))

    await run('ask does he know Rust')

    expect(texts()).not.toContain(m.ask.thinking.en)
  })
})

describe('ask achievement', () => {
  beforeEach(() => {
    reset()
  })

  it('unlocks on a completed answer', async () => {
    yields('Yes.')

    await run('ask does he know Rust')

    expect(unlocked.value.has('ask')).toBe(true)
  })

  it('stays locked when the model never answered', async () => {
    // Unlocked on completion rather than on invocation, so a timed-out request
    // does not award it.
    fails(new ApiError('nope', 502))

    await run('ask does he know Rust')

    expect(unlocked.value.has('ask')).toBe(false)
  })
})

describe('command not found', () => {
  beforeEach(() => {
    clearBuffer()
    setLocale('en')
  })

  it('offers `ask` for input that reads as a sentence', () => {
    // Someone who types `where does he work` into a terminal has told you
    // exactly what they want.
    expect(suggest('where')).toBeUndefined()
  })

  it('suggests the question back, quoted', async () => {
    await run('where does he work')

    expect(texts()).toContain(`${m.terminal.askInstead.en} \`ask "where does he work"\``)
  })

  it('still prefers a typo suggestion when there is one', async () => {
    await run('halp me please')

    expect(texts().some((t) => t.includes('`help`'))).toBe(true)
    expect(texts().some((t) => t.includes('ask "'))).toBe(false)
  })

  it('leaves a one-word typo alone', async () => {
    // A single word with no near miss is a typo, not a question.
    await run('qwertyuiop')

    expect(texts().some((t) => t.includes('ask "'))).toBe(false)
  })
})
