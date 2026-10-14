import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Season } from '@/content'
import { followSeason, SEASON_CHECK_MS } from '../season'

// Local `Date`s throughout, as in content's seasons spec: the day is the visitor's own.

describe('followSeason', () => {
  let today: Season | undefined
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    today = undefined
  })

  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('turns over on the dot of the visitor’s midnight', () => {
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 30))
    stop = followSeason((season) => (today = season))

    vi.advanceTimersByTime(29_999)
    expect(today).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(today?.id).toBe('halloween')
  })

  it('catches up within a check after the device sleeps through midnight', () => {
    vi.setSystemTime(new Date(2026, 9, 30, 22, 0))
    stop = followSeason((season) => (today = season))

    // A suspend moves the wall clock and not the one timers wait on, which is exactly
    // what `setSystemTime` does under fake timers: nothing pending fires early.
    vi.setSystemTime(new Date(2026, 9, 31, 7, 30))
    vi.advanceTimersByTime(SEASON_CHECK_MS)
    expect(today?.id).toBe('halloween')
  })

  it('says nothing once stopped', () => {
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59))
    const onDay = vi.fn()
    stop = followSeason(onDay)
    stop()

    vi.advanceTimersByTime(2 * 24 * 3_600_000)
    expect(onDay).not.toHaveBeenCalled()
  })
})
