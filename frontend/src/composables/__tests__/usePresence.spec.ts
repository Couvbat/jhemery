import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const wall = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, wall } }
})

import { ApiError } from '@/lib/api'

/**
 * A stand-in for the browser's `EventSource`, driven by hand: `count()` is the stream's
 * plain message, `wave()` its named event, `fail()` a dropped connection.
 */
class FakeSource {
  static last: FakeSource | null = null
  static opened = 0
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private named = new Map<string, Array<() => void>>()

  constructor(readonly url: string) {
    FakeSource.last = this
    FakeSource.opened++
  }

  addEventListener(type: string, listener: () => void) {
    this.named.set(type, [...(this.named.get(type) ?? []), listener])
  }

  close() {
    this.closed = true
  }

  count(online: number) {
    this.onmessage?.({ data: JSON.stringify({ online }) } as MessageEvent)
  }

  wave() {
    for (const listener of this.named.get('wave') ?? []) listener()
  }

  fail() {
    this.onerror?.()
  }
}

/** The stream and its timers are module-level: each test is a fresh page. */
async function load() {
  vi.resetModules()
  return import('../usePresence')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  FakeSource.last = null
  FakeSource.opened = 0
  vi.stubGlobal('EventSource', FakeSource)
  wall.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('usePresence', () => {
  it('reads the count, and nothing in it but the count', async () => {
    const { startPresence, usePresence } = await load()
    startPresence()
    FakeSource.last!.count(4)
    expect(usePresence().online.value).toBe(4)
  })

  // A count frame is the stream's plain message; a wave is named, so the two can't mix.
  it('counts a wave from someone else, and does not mistake it for a count', async () => {
    const { startPresence, usePresence } = await load()
    startPresence()
    FakeSource.last!.count(3)

    FakeSource.last!.wave()

    expect(usePresence().wave.value).toBe(1)
    expect(usePresence().online.value).toBe(3)
  })

  it('shows one wave at most every fifteen seconds, however many arrive', async () => {
    const { SHOW_EVERY_MS, startPresence, usePresence } = await load()
    startPresence()
    const source = FakeSource.last!

    source.wave()
    vi.advanceTimersByTime(3_000)
    source.wave()
    vi.advanceTimersByTime(SHOW_EVERY_MS - 3_001)
    source.wave()
    expect(usePresence().wave.value).toBe(1)

    vi.advanceTimersByTime(1)
    source.wave()
    expect(usePresence().wave.value).toBe(2)
  })

  // The server can't tell connections apart, so the sender drops its own echo here.
  it('ignores its own wave coming back, then hears the next one', async () => {
    const { OWN_ECHO_MS, sendWave, startPresence, usePresence } = await load()
    startPresence()
    FakeSource.last!.count(2)
    wall.mockImplementation(async () => {
      // The broadcast can arrive before the reply does.
      FakeSource.last!.wave()
      return undefined
    })

    expect(await sendWave()).toBe('sent')
    expect(usePresence().wave.value).toBe(0)

    vi.advanceTimersByTime(OWN_ECHO_MS)
    FakeSource.last!.wave()
    expect(usePresence().wave.value).toBe(1)
  })

  describe('whenPresent', () => {
    it('starts the stream on demand and waits for its first count', async () => {
      const { usePresence, whenPresent } = await load()
      expect(FakeSource.opened).toBe(0)

      const count = whenPresent()
      expect(FakeSource.opened).toBe(1)
      FakeSource.last!.count(5)

      expect(await count).toBe(5)
      expect(usePresence().online.value).toBe(5)
    })

    it('answers at once when there is already a count, without a second stream', async () => {
      const { startPresence, whenPresent } = await load()
      startPresence()
      FakeSource.last!.count(2)
      expect(await whenPresent()).toBe(2)
      expect(FakeSource.opened).toBe(1)
    })

    it('gives up with the stream, after three failed connections', async () => {
      const { whenPresent } = await load()
      const count = whenPresent()
      const source = FakeSource.last!
      source.fail()
      source.fail()
      source.fail()
      await nextTick()
      expect(await count).toBeNull()
      expect(source.closed).toBe(true)
    })

    // `who` typed after the stream gave up is the visitor asking it to try again.
    it('tries afresh, three times, when asked again after giving up', async () => {
      const { whenPresent } = await load()
      const first = whenPresent()
      for (let i = 0; i < 3; i++) FakeSource.last!.fail()
      expect(await first).toBeNull()

      const second = whenPresent()
      expect(FakeSource.opened).toBe(2)
      FakeSource.last!.fail()
      FakeSource.last!.fail()
      expect(FakeSource.last!.closed).toBe(false)
      FakeSource.last!.count(2)
      expect(await second).toBe(2)
    })

    it('stops waiting on Ctrl+C', async () => {
      const { whenPresent } = await load()
      const controller = new AbortController()
      const count = whenPresent(controller.signal)
      controller.abort()
      await expect(count).rejects.toMatchObject({ name: 'AbortError' })
    })

    it('says nothing is there when no count ever comes', async () => {
      const { whenPresent } = await load()
      const count = whenPresent()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await count).toBeNull()
    })
  })

  describe('sendWave', () => {
    async function connected(online: number) {
      const presence = await load()
      presence.startPresence()
      FakeSource.last!.count(online)
      return presence
    }

    it('makes no request when nobody else is here', async () => {
      const { sendWave } = await connected(1)
      expect(await sendWave()).toBe('alone')
      expect(wall).not.toHaveBeenCalled()
    })

    it('reports a deployment that has not opted in, and keeps hearing everyone else', async () => {
      const { sendWave, usePresence } = await connected(3)
      wall.mockResolvedValue({ configured: false })

      expect(await sendWave()).toBe('off')
      FakeSource.last!.wave()
      expect(usePresence().wave.value).toBe(1)
    })

    it('tells a rate limit from anything else going wrong', async () => {
      const { sendWave } = await connected(3)
      wall.mockRejectedValueOnce(new ApiError('Too many requests', 429))
      expect(await sendWave()).toBe('limited')
      // An older backend has no such route.
      wall.mockRejectedValueOnce(new ApiError('Cannot POST', 404))
      expect(await sendWave()).toBe('unavailable')
      wall.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      expect(await sendWave()).toBe('unavailable')
    })

    it('is unavailable when there is no stream to count with', async () => {
      vi.stubGlobal('EventSource', undefined)
      const { sendWave } = await load()
      expect(await sendWave()).toBe('unavailable')
      expect(wall).not.toHaveBeenCalled()
    })
  })
})
