import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ askStream: vi.fn(), lab: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, askStream: mocks.askStream, lab: mocks.lab } }
})

import { ApiError, type AskMeta } from '../api'
import { COLD_CHECK_MS, metaLine, modelIsCold, questionProblem, runAsk, sourceHref } from '../ask-session'
import { liveReport, SNAPSHOT } from './lab-fixture'

/**
 * What the terminal's `ask` and the `/lab` panel share, so they can't drift: the limits a
 * question must meet, the runner, the line under an answer, where a source goes, and the
 * cold-model pre-check. The degraded copy is held line by line in `terminal/__tests__/ask.spec.ts`.
 */

const META: AskMeta = {
  model: 'gemma4:e4b',
  label: 'poseidon · RTX 3080',
  outputTokens: 58,
  firstTokenMs: 410,
  totalMs: 1930,
  tokensPerSecond: 38.2,
  sources: [{ title: 'Why the ticker polls', target: 'why polling' }],
}

beforeEach(() => {
  mocks.askStream.mockReset()
  mocks.lab.mockReset()
})

afterEach(() => vi.useRealTimers())

describe('questionProblem', () => {
  it('holds a question to the DTO’s 3 to 240 characters, trimmed', () => {
    expect(questionProblem('  hi ')).toBe('short')
    expect(questionProblem('why?')).toBeNull()
    expect(questionProblem('x'.repeat(240))).toBeNull()
    expect(questionProblem('x'.repeat(241))).toBe('long')
  })
})

describe('runAsk', () => {
  it('accumulates the answer, tells the caller as it grows, and keeps the meta', async () => {
    mocks.askStream.mockImplementation(async function* () {
      yield { delta: 'Yes, ' }
      yield { delta: 'he does. ' }
      yield { meta: META }
    })
    const heard: string[] = []
    const outcome = await runAsk('does he know Rust?', 'en', { onAnswer: (answer) => heard.push(answer) })
    expect(heard).toEqual(['Yes, ', 'Yes, he does. '])
    expect(outcome).toEqual({ answer: 'Yes, he does.', meta: META, aborted: false, failed: false })
  })

  it('keeps what arrived on a cancel, and fails with the error otherwise', async () => {
    mocks.askStream.mockImplementation(async function* () {
      yield { delta: 'Partial' }
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    })
    expect(await runAsk('q??', 'en')).toMatchObject({ answer: 'Partial', aborted: true, failed: false })

    const error = new ApiError('nope', 502, 'refused')
    // eslint-disable-next-line require-yield
    mocks.askStream.mockImplementation(async function* () {
      throw error
    })
    expect(await runAsk('q??', 'en')).toMatchObject({ aborted: false, failed: true, error })
  })

  it('calls a stream that ended without a word a failure', async () => {
    mocks.askStream.mockImplementation(async function* () {
      yield { delta: '   ' }
    })
    expect(await runAsk('q??', 'en')).toEqual({ answer: '', meta: undefined, aborted: false, failed: true })
  })
})

describe('the line under an answer', () => {
  it('names the model, the rate, the first token and where it ran', () => {
    expect(metaLine(META, 'en')).toBe('gemma4:e4b · 38.2 tok/s · first token 0.4 s · poseidon · RTX 3080')
    expect(metaLine({ ...META, approx: true, label: undefined }, 'fr')).toBe('gemma4:e4b · ~38,2 tok/s · premier jeton 0,4 s')
    expect(metaLine({ ...META, tokensPerSecond: null, label: undefined }, 'en')).toBe('gemma4:e4b · first token 0.4 s')
  })

  it('sends a route where it is and a command through a ?run= link', () => {
    expect(sourceHref('/work/qr')).toBe('/work/qr')
    expect(sourceHref('/notes/ask#retrieval')).toBe('/notes/ask#retrieval')
    expect(sourceHref('why polling')).toBe('/?run=why%20polling')
  })
})

describe('modelIsCold', () => {
  const withModels = (resident: { name: string; vramMb: number }[], ageMs = 40_000) =>
    liveReport(ageMs, { ...SNAPSHOT, models: { ...SNAPSHOT.models!, resident } })

  it('says so when the runtime is up with nothing resident', async () => {
    mocks.lab.mockResolvedValue(withModels([]))
    expect(await modelIsCold()).toBe(true)
    mocks.lab.mockResolvedValue(withModels([{ name: 'gemma4:e4b', vramMb: 2100 }]))
    expect(await modelIsCold()).toBe(false)
  })

  it('says nothing from a stale snapshot, a failed read or a slow one', async () => {
    mocks.lab.mockResolvedValue(withModels([], 3 * 3_600_000))
    expect(await modelIsCold()).toBe(false)
    mocks.lab.mockRejectedValue(new Error('offline'))
    expect(await modelIsCold()).toBe(false)

    vi.useFakeTimers()
    mocks.lab.mockReturnValue(new Promise(() => {}))
    const checked = modelIsCold()
    await vi.advanceTimersByTimeAsync(COLD_CHECK_MS)
    expect(await checked).toBe(false)
  })
})
