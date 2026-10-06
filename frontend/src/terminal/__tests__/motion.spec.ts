import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const os = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/composables/useCrt', () => ({ prefersReducedMotion: () => os.reduced }))

import { setMotion, useMotion } from '@/composables/useMotion'
import { isLinkable, resolve, writesOf } from '../registry'
import { runCommand } from './context'

const motion = resolve('motion')!

beforeEach(() => {
  os.reduced = false
  window.localStorage.clear()
})

afterEach(() => {
  setMotion('full')
})

describe('motion', () => {
  it('lists the three settings and marks the one in force', async () => {
    setMotion('calm')
    const { lines } = await runCommand(motion)
    const rows = lines.filter((l) => /^[* ] (full|calm|paused) /.test(l.text))
    expect(rows.map((l) => l.text.slice(2).split(/\s+/)[0])).toEqual(['full', 'calm', 'paused'])
    expect(rows.find((l) => l.text.startsWith('* '))?.text).toContain('calm')
  })

  it('sets one, whatever case it is typed in, and saves it', async () => {
    const { text } = await runCommand(motion, ['Paused'])
    expect(text).toContain('motion: paused')
    expect(useMotion().level.value).toBe('paused')
    expect(window.localStorage.getItem('couvbat:motion')).toBe('paused')
    expect(document.documentElement.dataset.motion).toBe('paused')
  })

  it('refuses anything else and says what it takes', async () => {
    const { lines } = await runCommand(motion, ['ludicrous'])
    expect(lines[0]).toMatchObject({ tone: 'error', text: 'motion: unknown setting `ludicrous`' })
    expect(lines[1]!.text).toContain('full|calm|paused')
    expect(useMotion().setting.value).toBe('full')
  })

  // The OS setting is a floor the command can't lift, and it says so rather than
  // looking like it ignored the visitor.
  it('says when the system is holding everything still', async () => {
    os.reduced = true
    const { lines } = await runCommand(motion, ['full'])
    expect(lines.some((l) => l.tone === 'warning' && /reduced motion/.test(l.text))).toBe(true)
    expect(useMotion().setting.value).toBe('full')
    const listing = await runCommand(motion)
    expect(listing.lines.find((l) => l.text.startsWith('* '))?.text).toContain('paused')
  })

  it('completes its settings, and only the first argument', () => {
    expect(motion.complete!({ args: [''], index: 0, word: '' })).toEqual(['full', 'calm', 'paused'])
    expect(motion.complete!({ args: ['calm', ''], index: 1, word: '' })).toEqual([])
  })

  // It changes a setting, so a link may never run it, and the palette may.
  it('writes locally, is never linkable, and is in the palette', () => {
    expect(writesOf(motion, ['calm'])).toBe('local')
    expect(isLinkable(motion, ['paused'])).toBe(false)
    expect(motion.palette).toBe(true)
    expect(motion.group).toBe('core')
  })
})
