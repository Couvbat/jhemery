import { describe, expect, it, vi } from 'vitest'
import type { Localised } from '@/content/types'
import { eggCommands } from '../commands/eggs'
import { handleVimKey } from '../vimEditor'
import type { CommandContext, VimBufferState } from '../types'

/**
 * The escape hatches out of the vim pane. A visitor who cannot leave is stuck
 * with the whole site behind a modal overlay, so each route out gets a test:
 * typed `:q` (refused while dirty — that's the joke), typed `:q!` (always
 * works), and the title bar's red dot, which submits `:q!` for exactly that
 * reason. A friend reported being trapped after inserting text; `:q` had
 * refused and the red dot was wired to `:q` too, so nothing let go.
 */

const quit = eggCommands.find((c) => c.name === ':q')!

function buffer(overrides: Partial<VimBufferState> = {}): VimBufferState {
  return {
    name: 'about.txt',
    lines: ['hello'],
    cursor: { row: 0, col: 0 },
    mode: 'normal',
    dirty: false,
    statusMessage: null,
    ...overrides,
  }
}

/** Drives the real `:q` command against a stub of the vim effects, returning
 *  whether the pane was closed and what the status line ended up saying. */
function run(raw: string, state: VimBufferState) {
  let open = true
  const effects = {
    vim: (enabled: boolean) => {
      open = enabled
    },
    vimIsDirty: () => state.dirty,
    vimMessage: (text: string) => {
      state.statusMessage = text
    },
  } as unknown as CommandContext['effects']

  const ctx = {
    args: [],
    raw,
    locale: 'en',
    t: (<T,>(value: Localised<T>) => value.en) as CommandContext['t'],
    print: () => {},
    frame: () => () => {},
    clear: () => {},
    close: () => {},
    navigate: () => true,
    prompt: () => Promise.resolve(''),
    capture: () => () => {},
    run: () => Promise.resolve(),
    effects,
    signal: new AbortController().signal,
  } as unknown as CommandContext

  quit.run(ctx)
  return { open, message: state.statusMessage }
}

describe(':q', () => {
  it('claims every spelling the muscle memory reaches for', () => {
    expect(quit.aliases).toEqual(
      expect.arrayContaining([':q!', ':quit', ':quit!', ':wq', ':wq!', ':x']),
    )
  })

  it('closes the pane on a clean buffer', () => {
    expect(run(':q', buffer()).open).toBe(false)
  })

  it('refuses a dirty buffer, and says why in the pane', () => {
    const state = buffer({ dirty: true })
    const { open, message } = run(':q', state)
    expect(open).toBe(true)
    expect(message).toContain('E37')
  })

  it('lets `:q!` out of a dirty buffer — the always-available escape', () => {
    expect(run(':q!', buffer({ dirty: true })).open).toBe(false)
  })

  it('refuses to write, since the fake filesystem is readonly', () => {
    const state = buffer({ dirty: true })
    const { open, message } = run(':wq', state)
    expect(open).toBe(true)
    expect(message).toContain('E45')
  })
})

describe('the red dot', () => {
  /**
   * TerminalOverlay's `requestClose()` falls back to submitting this when
   * `closeTerminal()` is refused by the vim trap. It is asserted here rather
   * than through the component because the repo has no component-mount
   * harness — what matters is that whatever it submits escapes a *dirty*
   * buffer, which is the state the reported bug was stuck in.
   */
  it('submits a command that escapes a dirty buffer', () => {
    expect(run(':q!', buffer({ dirty: true })).open).toBe(false)
  })
})

describe('typing in the pane', () => {
  it('marks the buffer dirty, which is what made `:q` start refusing', () => {
    const state = buffer({ mode: 'insert' })
    handleVimKey(state, new KeyboardEvent('keydown', { key: 'x' }))
    expect(state.dirty).toBe(true)
    expect(state.lines[0]).toBe('xhello')
  })

  it('consumes Escape in insert mode so it does not also close the terminal', () => {
    const state = buffer({ mode: 'insert' })
    expect(handleVimKey(state, new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true)
    expect(state.mode).toBe('normal')
  })

  it('lets Escape through in normal mode, so it reaches the close path', () => {
    expect(handleVimKey(buffer(), new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false)
  })

  it('lets `:` through, so the command line is typed in the shell input', () => {
    expect(handleVimKey(buffer({ mode: 'insert' }), new KeyboardEvent('keydown', { key: ':' }))).toBe(
      false,
    )
  })
})

// `announce()` reaches localStorage through the achievement store; jsdom
// provides it, so nothing needs stubbing — but fail loudly if that changes.
it('does not throw on the achievement unlock path', () => {
  const spy = vi.spyOn(console, 'error')
  run(':q!', buffer({ dirty: true }))
  expect(spy).not.toHaveBeenCalled()
})
