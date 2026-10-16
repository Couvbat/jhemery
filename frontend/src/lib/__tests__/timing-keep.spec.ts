import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * What survives the timing buffer being emptied (`lib/timing-keep.ts`): the newest entry
 * of each API route, so a route fetched once a visit still has its line when x-ray opens
 * after the buffer filled (review of #160). Module state, so each case re-imports.
 */

const BASE = 'https://api.example'
const entry = (name: string, startTime: number) => ({ name, startTime, entryType: 'resource' }) as PerformanceEntry

function buffer(entries: PerformanceEntry[]) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue(entries)
  // jsdom has no `clearResourceTimings`: stood in for, and counted.
  const clear = vi.fn()
  Object.defineProperty(performance, 'clearResourceTimings', { value: clear, configurable: true })
  return clear
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('keeping timings across a cleared buffer', () => {
  it('keeps the newest entry of each API route, nothing else, and empties the buffer', async () => {
    const { keepAndClear, keptTimings } = await import('../timing-keep')
    const clear = buffer([
      entry(`${BASE}/steam/activity`, 10),
      entry(`${BASE}/guestbook?limit=5`, 20),
      entry('https://site.example/assets/index.js', 25),
      entry(`${BASE}/guestbook?limit=5`, 30),
    ])

    keepAndClear(BASE)

    expect(clear).toHaveBeenCalledOnce()
    expect(keptTimings().map((each) => [each.name, each.startTime])).toEqual([
      [`${BASE}/steam/activity`, 10],
      [`${BASE}/guestbook?limit=5`, 30],
    ])
  })

  it('holds what it kept across a second clear that no longer has it', async () => {
    const { keepAndClear, keptTimings } = await import('../timing-keep')
    buffer([entry(`${BASE}/steam/activity`, 10)])
    keepAndClear(BASE)
    buffer([entry(`${BASE}/guestbook`, 50)])
    keepAndClear(BASE)

    expect(keptTimings().map((each) => each.name)).toEqual([`${BASE}/steam/activity`, `${BASE}/guestbook`])
  })

  it('stays bounded, dropping the oldest route first', async () => {
    const { keepAndClear, keptTimings } = await import('../timing-keep')
    buffer(Array.from({ length: 40 }, (_, i) => entry(`${BASE}/r${i}`, i)))
    keepAndClear(BASE)

    const names = keptTimings().map((each) => each.name)
    expect(names).toHaveLength(32)
    expect(names[0]).toBe(`${BASE}/r8`)
  })

  it('keeps nothing without an API to keep for', async () => {
    const { keepAndClear, keptTimings } = await import('../timing-keep')
    const clear = buffer([entry(`${BASE}/steam/activity`, 10)])
    keepAndClear('')
    expect(keptTimings()).toEqual([])
    expect(clear).toHaveBeenCalledOnce()
  })
})
