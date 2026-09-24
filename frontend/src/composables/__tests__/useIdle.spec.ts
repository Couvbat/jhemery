import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { roomPlaying } from '@/rooms/useRoom'
import { SCREENSAVER_AFTER_MS, startScreensaver, useScreensaver } from '../useIdle'
import { terminalCapturing } from '../useTerminalShell'
import { MAX_VISITOR_SHAPES, visitorShapesFor } from '../useSceneControl'

const { screensaver } = useScreensaver()
let stop: (() => void) | null = null

function press(key = 'a') {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  return event
}

beforeEach(() => {
  vi.useFakeTimers()
  terminalCapturing.value = false
  roomPlaying.value = false
  stop = startScreensaver()
})

afterEach(() => {
  stop?.()
  vi.useRealTimers()
})

describe('the screensaver', () => {
  it('starts after the idle time and marks the page', async () => {
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS - 1)
    expect(screensaver.value).toBe(false)
    vi.advanceTimersByTime(1)
    await nextTick()
    expect(screensaver.value).toBe(true)
    expect(document.documentElement.dataset.screensaver).toBe('')
  })

  it('restarts the clock on any activity', () => {
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS - 1000)
    window.dispatchEvent(new Event('pointermove'))
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS - 1000)
    expect(screensaver.value).toBe(false)
  })

  it('spends the waking key on waking, so it does nothing else', async () => {
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS)
    const later = vi.fn()
    window.addEventListener('keydown', later)
    const event = press('`')
    window.removeEventListener('keydown', later)

    expect(screensaver.value).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(later).not.toHaveBeenCalled()
    await nextTick()
    expect(document.documentElement.dataset.screensaver).toBeUndefined()

    // An ordinary key, with the page up, goes through untouched.
    expect(press().defaultPrevented).toBe(false)
  })

  it('never starts while a game holds the keyboard', () => {
    terminalCapturing.value = true
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS * 3)
    expect(screensaver.value).toBe(false)
  })

  it('never starts while a room is playing, and ends if one starts', async () => {
    roomPlaying.value = true
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS * 2)
    expect(screensaver.value).toBe(false)

    roomPlaying.value = false
    await nextTick()
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS)
    expect(screensaver.value).toBe(true)
    roomPlaying.value = true
    await nextTick()
    expect(screensaver.value).toBe(false)
  })

  it('does not count time the tab spends hidden', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS * 2)
    expect(screensaver.value).toBe(false)

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS)
    expect(screensaver.value).toBe(true)
  })

  it('lets go of everything when stopped', () => {
    stop?.()
    stop = null
    vi.advanceTimersByTime(SCREENSAVER_AFTER_MS * 2)
    expect(screensaver.value).toBe(false)
  })
})

describe('visitor shapes', () => {
  it('are everyone but you, from the same integer the footer shows', () => {
    expect(visitorShapesFor(null)).toBe(0)
    expect(visitorShapesFor(1)).toBe(0)
    expect(visitorShapesFor(4)).toBe(3)
  })

  it('stop well short of burying the scene', () => {
    expect(visitorShapesFor(500)).toBe(MAX_VISITOR_SHAPES)
  })
})
