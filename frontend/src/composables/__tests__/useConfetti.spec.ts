import { afterEach, describe, expect, it, vi } from 'vitest'
import { confettiQueue, drainConfetti, fireConfetti } from '../useConfetti'

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce, media: query })),
  )
}

afterEach(() => {
  drainConfetti()
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
})
