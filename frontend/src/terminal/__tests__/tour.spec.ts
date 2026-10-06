import { afterEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => motion.reduced,
}))

import { setMotion } from '@/composables/useMotion'
import { setTheme, useTheme } from '@/composables/useTheme'
import { TOUR_STOPS } from '../commands/work'
import { allCommands, isLinkable, resolve, resolveLink } from '../registry'
import { recordingContext, runCommand } from './context'

const tour = resolve('tour')!
const runStops = TOUR_STOPS.flatMap((stop) => ('run' in stop ? [stop.run] : []))

afterEach(() => {
  motion.reduced = true
  setMotion('full')
  vi.useRealTimers()
  setTheme('cyberpunk')
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

  it('prints everything at once under reduced motion, and changes no scheme or says it did', async () => {
    const before = useTheme().theme.value.id
    const started = Date.now()
    const { text } = await runCommand(tour)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(useTheme().theme.value.id).toBe(before)
    expect(text).not.toMatch(/Here is|and back/)
  })

  // The pauses are the pacing of something typed, which `calm` keeps; the repaint that
  // undoes itself is decoration, which it doesn't.
  it('keeps its pauses under calm, and shows no scheme', async () => {
    motion.reduced = false
    setMotion('calm')
    vi.useFakeTimers()
    const before = useTheme().theme.value.id
    const recorded = recordingContext('tour', [])
    const done = tour.run(recorded.ctx) as Promise<void>

    await vi.advanceTimersByTimeAsync(1000)
    expect(recorded.printed.map((l) => l.text).join('\n')).not.toContain('End of the tour')
    await vi.advanceTimersByTimeAsync(6000 + 1000)
    expect(useTheme().theme.value.id).toBe(before)

    await vi.runAllTimersAsync()
    await done
    const text = recorded.printed.map((l) => l.text).join('\n')
    expect(text).toContain('`theme` lists them.')
    expect(text).not.toMatch(/Here is/)
  })

  it('shows another scheme to a visitor who already wears the first', async () => {
    setTheme('gruvbox')
    motion.reduced = false
    vi.useFakeTimers()
    const recorded = recordingContext('tour', [])
    const done = tour.run(recorded.ctx) as Promise<void>
    await vi.advanceTimersByTimeAsync(6000 + 1000)
    expect(useTheme().theme.value.id).toBe('nord')
    expect(recorded.printed.map((l) => l.text).join('\n')).toContain('Here is Nord')
    await vi.runAllTimersAsync()
    await done
    expect(useTheme().theme.value.id).toBe('gruvbox')
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
