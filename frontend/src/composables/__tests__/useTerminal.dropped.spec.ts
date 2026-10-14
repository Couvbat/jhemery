import { beforeEach, describe, expect, it, vi } from 'vitest'

// `sl` only animates when motion is allowed.
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => false,
}))

import { useTerminal } from '../useTerminal'

/**
 * The buffer keeps its last 500 lines, and `dropped()` counts what has left its head, so
 * that with an index it numbers a line for good. The touch layout reads a tap's output from
 * its first line, and once the buffer is full its length no longer says where that is.
 */

const { buffer, clearBuffer, dropped, run } = useTerminal()

/** The number a line keeps for good: what has left the head, and where it sits now. */
function numberOf(text: string) {
  const index = buffer.value.findIndex((line) => line.text === text)
  return index === -1 ? null : dropped() + index
}

async function fill() {
  for (let i = 0; i < 500; i++) await run(`echo ${i}`)
  expect(buffer.value).toHaveLength(500)
}

describe('the buffer’s line numbers', () => {
  beforeEach(() => {
    clearBuffer()
    vi.useRealTimers()
  })

  it('stay put while the cap trims the head', async () => {
    await fill()
    const last = numberOf('499')!
    await run('echo next')
    await run('echo after')

    expect(buffer.value).toHaveLength(500)
    expect(numberOf('0')).toBeNull()
    expect(numberOf('499')).toBe(last)
    expect(numberOf('after')).toBe(last + 2)
  })

  it('stay put under a frame drawn on a full buffer', async () => {
    await fill()
    const last = numberOf('499')!
    vi.useFakeTimers()
    const done = run('sl')
    await vi.runAllTimersAsync()
    await done

    expect(buffer.value).toHaveLength(500)
    expect(numberOf('499')).toBe(last)
  })

  it('count a cleared buffer as gone from the head', async () => {
    await run('echo a')
    await run('echo b')
    const next = dropped() + buffer.value.length
    clearBuffer()
    await run('echo c')

    expect(numberOf('c')).toBe(next)
  })
})
