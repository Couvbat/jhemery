import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command } from '@/terminal/types'

/**
 * `ctx.run` runs one command inside another: what `tour` does between its stops,
 * and what `tour` and pipes are built on. The parent is still running throughout, so
 * the child must not look like a command of its own: when it finishes, the shell has
 * to stay busy, Ctrl+C has to still reach the parent, and the keyboard must stay the
 * parent's.
 */

// `readBusy` is filled in once the shell is imported: importing it from inside the mock
// factory would deadlock, since the shell imports the registry, which imports this mock.
const seen = vi.hoisted(() => ({
  busyAfterChild: undefined as boolean | undefined,
  capturingAfterChild: undefined as boolean | undefined,
  childArgs: [] as string[],
  readBusy: (() => undefined) as () => boolean | undefined,
  readCapturing: (() => undefined) as () => boolean | undefined,
}))

// A parent that runs a child and then waits to be cancelled, like a tour between stops.
vi.mock('@/terminal/commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/terminal/commands')>()
  const parent: Command = {
    name: 'nest',
    description: { en: 'test', fr: 'test' },
    group: 'core',
    writes: 'none',
    async run(ctx) {
      await ctx.run('whoami')
      seen.busyAfterChild = seen.readBusy()
      await new Promise<void>((_, reject) =>
        ctx.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
      )
    },
  }
  const echo: Command = {
    name: 'args',
    description: { en: 'test', fr: 'test' },
    group: 'core',
    writes: 'none',
    run(ctx) {
      seen.childArgs = ctx.args
    },
  }
  const holding: Command = {
    name: 'nesthold',
    description: { en: 'test', fr: 'test' },
    group: 'core',
    writes: 'none',
    async run(ctx) {
      const release = ctx.capture(() => {})
      await ctx.run('whoami')
      seen.capturingAfterChild = seen.readCapturing()
      release()
    },
  }
  const viaAlias: Command = {
    name: 'nestalias',
    description: { en: 'test', fr: 'test' },
    group: 'core',
    writes: 'none',
    async run(ctx) {
      await ctx.run('args one two')
      await ctx.run('mine')
    },
  }
  return { ...actual, collectCommands: () => [...actual.collectCommands(), parent, echo, holding, viaAlias] }
})

import { messages } from '@/i18n/messages'
import { setLocale } from '@/i18n'
import { clearAliases, setAlias } from '@/terminal/aliases'
import { cancel, useTerminal } from '../useTerminal'

const { buffer, busy, capturing, clearBuffer, run } = useTerminal()
const CANCELLED = messages.terminal.cancelled.en
seen.readBusy = () => busy.value
seen.readCapturing = () => capturing.value

beforeEach(() => {
  clearBuffer()
  clearAliases()
  setLocale('en')
  seen.busyAfterChild = undefined
  seen.childArgs = []
})

describe('ctx.run', () => {
  it('runs the child inside the parent: still busy afterwards, and Ctrl+C reaches the parent', { timeout: 2000 }, async () => {
    const done = run('nest')
    await vi.waitFor(() => expect(seen.busyAfterChild).toBeDefined())

    expect(seen.busyAfterChild).toBe(true)
    expect(busy.value).toBe(true)
    // whoami's output is in the buffer, from inside the parent.
    expect(buffer.value.some((l) => l.text.includes('couvbat'))).toBe(true)

    cancel()
    await done
    expect(busy.value).toBe(false)
    expect(buffer.value.filter((l) => l.text === CANCELLED)).toHaveLength(1)
  })

  it('hands a parent holding the keyboard its capture back after the child', async () => {
    await run('nesthold')
    expect(seen.capturingAfterChild).toBe(true)
  })

  it('passes the child its own arguments, and never expands the visitor’s aliases', async () => {
    setAlias('mine', 'echo should-not-run')
    await run('nestalias')

    expect(seen.childArgs).toEqual(['one', 'two'])
    expect(buffer.value.map((l) => l.text).join('\n')).not.toContain('should-not-run')
    expect(buffer.value.some((l) => l.text.startsWith('mine:'))).toBe(true)
  })
})
