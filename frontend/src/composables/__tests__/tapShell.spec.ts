import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => motion.reduced,
}))

import { setLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { setMotion } from '../useMotion'
import { cancel, primeOverlay, runLink, useTerminal } from '../useTerminal'
import {
  openTerminal,
  pendingInitialCommand,
  pendingLinkCommand,
  terminalOpen,
  touchLayout,
} from '../useTerminalShell'

/**
 * The shell in the touch layout, below `md` (features-spec §9). The overlay is a `.vue`,
 * which this suite can't mount, so its two halves are tested apart: the buttons'
 * list in `terminal/__tests__/tap.spec.ts`, and here what the shell does with a tap,
 * which goes through `runLink` with every stage on `tty: false`.
 */

const { buffer, busy, capturing, clearBuffer } = useTerminal()
const texts = () => buffer.value.map((l) => l.text)

function screen(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: desktop, media: query }))
}

beforeEach(() => {
  clearBuffer()
  setLocale('en')
  touchLayout.value = true
  terminalOpen.value = false
  pendingInitialCommand.value = null
  pendingLinkCommand.value = null
})

afterEach(() => {
  touchLayout.value = false
  motion.reduced = true
  setMotion('full')
  vi.unstubAllGlobals()
})

describe('the touch layout', () => {
  // `?run=wordle daily` is what `wordle share` hands out, and it gets opened on phones.
  it('answers a game with the reason a phone has, and never takes the keyboard', async () => {
    await runLink('wordle daily')
    expect(capturing.value).toBe(false)
    expect(busy.value).toBe(false)
    expect(texts().join('\n')).toContain(`wordle: ${messages.tapShell.notATty.en}`)
    expect(texts().join('\n')).not.toContain(messages.terminal.notATty.en)
  })

  // On a desktop `man ls` waits in the pager for q; here there is no q to press.
  it('prints a manual page whole instead of paging it', async () => {
    await runLink('man ls')
    expect(capturing.value).toBe(false)
    expect(texts().some((l) => l.startsWith('LS(1)'))).toBe(true)
    expect(texts().join('\n')).not.toMatch(/press q to quit/)
  })

  it('still refuses what a link may not run', async () => {
    await runLink('theme dracula')
    expect(buffer.value).toHaveLength(1)
    expect(buffer.value[0]!.tone).toBe('warning')
  })

  // The stop button is `cancel()`, as Ctrl+C is.
  it('stops a running command from the stop button', async () => {
    motion.reduced = false
    setMotion('full')
    const done = runLink('tour')
    await vi.waitFor(() => expect(texts().join('\n')).toContain('This is a shell'))
    expect(busy.value).toBe(true)
    // Found here: pressed before the tour reached its next pause, the stop was missed
    // and the tour walked on, because `sleep` only listened for an abort still to come.
    cancel()
    await done
    expect(busy.value).toBe(false)
    expect(texts()).toContain(messages.terminal.cancelled.en)
  })

  it('greets a first open with what to tap, not what to type', () => {
    primeOverlay()
    expect(texts()).toContain(messages.tapShell.hint.en)
    expect(texts()).not.toContain(messages.terminal.hint.en)
  })
})

// The palette, the guestbook toast and the 404 page open the shell with a line to run.
describe('openTerminal with a line', () => {
  it('hands it over as a link below md, where it runs in the touch layout', () => {
    screen(false)
    openTerminal('guestbook')
    expect(terminalOpen.value).toBe(true)
    expect(pendingLinkCommand.value).toBe('guestbook')
    expect(pendingInitialCommand.value).toBeNull()
  })

  it('types it at the prompt from md up, as it always did', () => {
    screen(true)
    openTerminal('guestbook')
    expect(pendingInitialCommand.value).toBe('guestbook')
    expect(pendingLinkCommand.value).toBeNull()
  })
})
