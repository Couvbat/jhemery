import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GuestbookEntry, GuestbookList } from '@/lib/api'

const guestbook = vi.hoisted(() => vi.fn<() => Promise<GuestbookList>>())
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, guestbook } }
})

/**
 * What the ticker hands the field: the page each poll found, which is all the wireframes
 * read, so the field never asks the API for anything itself.
 */

const POLL_MS = 20_000

const ada: GuestbookEntry = { id: 'a', name: 'ada', message: 'hi', date: '2026-08-01T12:00:00.000Z' }
const bob: GuestbookEntry = { id: 'b', name: 'bob', message: 'yo', date: '2026-08-02T12:00:00.000Z' }

/** The ticker's state is module-level: each test is a fresh page. */
async function load() {
  vi.resetModules()
  return import('../useGuestbookTicker')
}

beforeEach(() => {
  vi.useFakeTimers()
  guestbook.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the entries the ticker exposes', () => {
  it('are the first page, though that page announces nothing', async () => {
    guestbook.mockResolvedValue({ enabled: true, entries: [bob, ada] })
    const ticker = await load()
    const { entries, queue } = ticker.useGuestbookTicker()
    ticker.startGuestbookTicker()
    await vi.waitFor(() => expect(entries.value).toEqual([bob, ada]))
    expect(queue.value).toEqual([])
    ticker.stopGuestbookTicker()
  })

  it('follow each poll, so a deleted entry drops out', async () => {
    guestbook.mockResolvedValue({ enabled: true, entries: [bob, ada] })
    const ticker = await load()
    const { entries } = ticker.useGuestbookTicker()
    ticker.startGuestbookTicker()
    await vi.waitFor(() => expect(entries.value).toHaveLength(2))

    guestbook.mockResolvedValue({ enabled: true, entries: [ada] })
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(entries.value).toEqual([ada])
    ticker.stopGuestbookTicker()
  })

  it('are empty while the guestbook is off, and nothing more is asked for', async () => {
    guestbook.mockResolvedValue({ enabled: false })
    const ticker = await load()
    const { entries } = ticker.useGuestbookTicker()
    ticker.startGuestbookTicker()
    await vi.waitFor(() => expect(guestbook).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(guestbook).toHaveBeenCalledTimes(1)
    expect(entries.value).toEqual([])
  })

  it('are emptied when the guestbook is switched off mid-visit', async () => {
    guestbook.mockResolvedValue({ enabled: true, entries: [ada] })
    const ticker = await load()
    const { entries } = ticker.useGuestbookTicker()
    ticker.startGuestbookTicker()
    await vi.waitFor(() => expect(entries.value).toEqual([ada]))

    guestbook.mockResolvedValue({ enabled: false })
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(entries.value).toEqual([])
  })

  it('stay as they were through a failed poll: a blip is not a deletion', async () => {
    guestbook.mockResolvedValue({ enabled: true, entries: [ada] })
    const ticker = await load()
    const { entries } = ticker.useGuestbookTicker()
    ticker.startGuestbookTicker()
    await vi.waitFor(() => expect(entries.value).toEqual([ada]))

    guestbook.mockRejectedValue(new Error('offline'))
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(guestbook).toHaveBeenCalledTimes(2)
    expect(entries.value).toEqual([ada])
    ticker.stopGuestbookTicker()
  })

  it('are emptied when the ticker gives up, since no poll will correct them after', async () => {
    guestbook.mockResolvedValue({ enabled: true, entries: [bob, ada] })
    const ticker = await load()
    const { entries } = ticker.useGuestbookTicker()
    ticker.startGuestbookTicker()
    await vi.waitFor(() => expect(entries.value).toEqual([bob, ada]))

    guestbook.mockRejectedValue(new Error('offline'))
    await vi.advanceTimersByTimeAsync(POLL_MS * 2)
    expect(entries.value).toEqual([bob, ada])
    await vi.advanceTimersByTimeAsync(POLL_MS)
    expect(guestbook).toHaveBeenCalledTimes(4)
    expect(entries.value).toEqual([])

    // The owner deletes bob while the API is back: this tab has stopped asking, and shows neither.
    guestbook.mockResolvedValue({ enabled: true, entries: [ada] })
    await vi.advanceTimersByTimeAsync(POLL_MS * 3)
    expect(guestbook).toHaveBeenCalledTimes(4)
    expect(entries.value).toEqual([])
  })
})
