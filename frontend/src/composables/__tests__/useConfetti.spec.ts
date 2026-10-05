import { afterEach, describe, expect, it, vi } from 'vitest'
import { confettiQueue, drainConfetti, fireConfetti } from '../useConfetti'
import { setMotion } from '../useMotion'

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce, media: query })),
  )
}

afterEach(() => {
  drainConfetti()
  setMotion('full')
  vi.unstubAllGlobals()
})

describe('useConfetti', () => {
  it('queues bursts in order and drains them exactly once', () => {
    setReducedMotion(false)

    fireConfetti({ x: 10, y: 20, intensity: 1 })
    fireConfetti({ x: 30, y: 40, intensity: 2.5 })

    expect(drainConfetti()).toEqual([
      { x: 10, y: 20, intensity: 1 },
      { x: 30, y: 40, intensity: 2.5 },
    ])
    expect(confettiQueue.value).toEqual([])
    expect(drainConfetti()).toEqual([])
  })

  it('drops bursts under prefers-reduced-motion, so the queue cannot grow unrendered', () => {
    setReducedMotion(true)

    fireConfetti({ x: 10, y: 20, intensity: 1 })

    expect(confettiQueue.value).toEqual([])
  })

  // A burst is decoration on top of the toast, which `calm` keeps.
  it('drops bursts below full motion too', () => {
    setReducedMotion(false)
    for (const level of ['calm', 'paused'] as const) {
      setMotion(level)
      fireConfetti({ x: 10, y: 20, intensity: 1 })
      expect(confettiQueue.value, level).toEqual([])
    }
  })
})
