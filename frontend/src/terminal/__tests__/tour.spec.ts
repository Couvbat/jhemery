import { afterEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => motion.reduced,
}))

import { useTheme } from '@/composables/useTheme'
import { TOUR_STOPS } from '../commands/work'
import { allCommands, isLinkable, resolve, resolveLink } from '../registry'
import { recordingContext, runCommand } from './context'

const tour = resolve('tour')!
const runStops = TOUR_STOPS.flatMap((stop) => ('run' in stop ? [stop.run] : []))

afterEach(() => {
  motion.reduced = true
  vi.useRealTimers()
})

describe('tour', () => {
  // `?run=tour` is the link for a bio, so it may only run what a link could.
  it('is linkable, and every stop is something a link could run itself', () => {
    expect(isLinkable(tour)).toBe(true)
    expect(runStops.length).toBeGreaterThan(0)
    for (const stop of runStops) {
      const target = resolveLink(stop)
      expect(target, stop).toBeDefined()
      expect(isLinkable(target!.command, target!.args), stop).toBe(true)
    }
  })

  it('runs the stops in order, inside itself', async () => {
    const { ran } = await runCommand(tour)
    expect(ran).toEqual(runStops)
  })

  it.each(['en', 'fr'] as const)('never names a hidden command, in %s', async (locale) => {
    const { text } = await runCommand(tour, [], { locale })
    const hidden = allCommands().filter((c) => c.hidden).flatMap((c) => [c.name, ...(c.aliases ?? [])])
    for (const [, word] of text.matchAll(/`([^`\s]+)[^`]*`/g)) {
      expect(hidden, `the tour names \`${word}\``).not.toContain(word)
    }
  })

  it('prints everything at once under reduced motion, and changes no scheme', async () => {
    const before = useTheme().theme.value.id
    const started = Date.now()
    await runCommand(tour)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(useTheme().theme.value.id).toBe(before)
  })

  it('puts the scheme back when stopped halfway through showing it', async () => {
    motion.reduced = false
    vi.useFakeTimers()
    const before = useTheme().theme.value.id
    const controller = new AbortController()
    const recorded = recordingContext('tour', [], { signal: controller.signal })
    const done = tour.run(recorded.ctx) as Promise<void>
    const failed = done.catch((error: Error) => error.name)

    // First stop, the pause before the second, then the scheme is showing.
    await vi.advanceTimersByTimeAsync(6000 + 1000)
    expect(useTheme().theme.value.id).toBe('gruvbox')

    controller.abort()
    expect(await failed).toBe('AbortError')
    expect(useTheme().theme.value.id).toBe(before)
  })
})
