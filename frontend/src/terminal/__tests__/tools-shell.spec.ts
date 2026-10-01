import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { terminalOpen } from '@/composables/useTerminalShell'
import type { StopReason } from '@/tools/acid/engine'
import { DEFAULT_PATTERN, encode } from '@/tools/acid/pattern'
import { resolve } from '../registry'
import { operand } from '../commands/tools'
import { recordingContext } from './context'

/** The engine `acid` loads, replaced by one that records: the shell's job is when the
 *  context is made and what stops it, not what a filter sounds like (acid.spec.ts). */
const engine = vi.hoisted(() => ({
  created: [] as { context: unknown; onStop?: (reason: StopReason) => void }[],
  position: -1,
  started: 0,
  disposed: 0,
}))
vi.mock('@/tools/acid/engine', () => ({
  createEngine: (context: unknown, _read: unknown, options: { onStop?: (reason: StopReason) => void } = {}) => {
    engine.created.push({ context, onStop: options.onStop })
    return {
      start: () => void engine.started++,
      stop: () => {},
      playing: true,
      position: () => engine.position,
      dispose: () => void engine.disposed++,
    }
  },
}))

// jsdom has no `matchMedia`; the playhead is drawn unless a test asks otherwise.
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => motion.reduced,
}))

/** Runs a line as typed: `raw` is the whole line (the tools read the word the visitor
 *  typed, `sha1sum`, and the spacing inside the text), args are split on spaces. */
async function shell(input: string) {
  const [name = '', ...args] = input.split(/\s+/)
  const { ctx } = recordingContext(name, args)
  const out = (await resolve(name)!.run({ ...ctx, raw: input })) ?? []
  return out.map((l) => l.text).join('\n')
}

describe('operand', () => {
  it('takes everything after the command word, keeping inner spacing', () => {
    expect(operand('sha256sum hello   world')).toBe('hello   world')
  })

  it('skips leading flags and strips outer quotes', () => {
    expect(operand(`base64 -d 'aGk='`, ['-d'])).toBe('aGk=')
    expect(operand(`jq . '{"a": 1}'`, ['.'])).toBe('{"a": 1}')
  })
})

describe('sha256sum', () => {
  it('hashes text, printing - as the name like a pipe would', async () => {
    expect(await shell('sha256sum abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  -',
    )
  })

  it('picks the algorithm from the name it was called by', async () => {
    expect(await shell('sha1sum abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d  -')
    expect((await shell('sha512sum abc')).split('  ')[0]).toHaveLength(128)
  })

  it('hashes a file from the fake filesystem by its name', async () => {
    const out = await shell('sha256sum about.txt')
    expect(out).toMatch(/^[0-9a-f]{64} {2}about\.txt$/)
    expect(out).not.toBe(await shell('sha256sum about.tx'))
  })

  it('says what it can read when given nothing', async () => {
    expect(await shell('sha256sum')).toContain('pipe it in')
  })

  // The pipe form reads what came in as a file's bytes, so both spellings agree.
  it('hashes what a pipe hands it exactly as it hashes the file', async () => {
    const { runCommand } = await import('./context')
    const { resolve } = await import('../registry')
    const { resolveFileLines } = await import('../commands/files')
    const t = <T,>(value: { en: T; fr: T }) => value.en
    const piped = await runCommand(resolve('sha256sum')!, [], { stdin: resolveFileLines('about.txt', t) })
    expect(piped.text).toBe((await shell('sha256sum about.txt')).replace('about.txt', '-'))
  })
})

describe('base64', () => {
  it('encodes and decodes UTF-8 both ways', async () => {
    expect(await shell('base64 héllo')).toBe('aMOpbGxv')
    expect(await shell('base64 -d aMOpbGxv')).toBe('héllo')
  })

  it('refuses input that is not base64', async () => {
    expect(await shell('base64 -d !!!')).toBe('base64: invalid input')
  })

  it('wraps at 76 columns, like GNU base64', async () => {
    const lines = (await shell('base64 about.txt')).split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.slice(0, -1).every((l) => l.length === 76)).toBe(true)
  })
})

describe('uuidgen', () => {
  it('prints a v4 UUID', async () => {
    expect(await shell('uuidgen')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('jq', () => {
  it('pretty-prints with the identity filter', async () => {
    expect(await shell(`jq . '{"a":[1,2]}'`)).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}')
  })

  it('points at the error in invalid JSON', async () => {
    expect(await shell(`jq . '{"a":}'`)).toMatch(/^jq: error: .* at line 1, column 6$/)
  })

  it('says only . is supported', async () => {
    expect(await shell('jq .a {}')).toContain('only the identity filter')
  })
})

describe('acid', () => {
  /** Records what happens to it, in order, alongside what the command does. */
  let events: string[]
  let contexts: FakeAudioContext[]
  /** Whether a `resume()` takes: false is a browser refusing sound without a gesture. */
  let allowed: boolean

  class FakeAudioContext {
    state: AudioContextState = 'suspended'
    constructor() {
      events.push('construct')
      contexts.push(this)
    }
    resume() {
      events.push('resume')
      if (allowed) this.state = 'running'
      return Promise.resolve()
    }
    close() {
      events.push('close')
      this.state = 'closed'
      return Promise.resolve()
    }
  }

  beforeEach(() => {
    events = []
    contexts = []
    allowed = true
    motion.reduced = false
    Object.assign(engine, { created: [], position: -1, started: 0, disposed: 0 })
    vi.stubGlobal('AudioContext', FakeAudioContext)
    terminalOpen.value = true
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    terminalOpen.value = false
  })

  function start(args: string[] = []) {
    const controller = new AbortController()
    const recorded = recordingContext('acid', args, { signal: controller.signal })
    const running = Promise.resolve(resolve('acid')!.run(recorded.ctx)).then((out) => out ?? [])
    const text = () => recorded.printed.map((l) => l.text).join('\n')
    return { ...recorded, controller, running, text }
  }

  it('opens and resumes the audio context before its first await', async () => {
    const run = start()
    // Synchronously, inside the keystroke that ran it: nothing has been awaited yet, so
    // the engine's chunk hasn't even loaded.
    expect(events).toEqual(['construct', 'resume'])
    expect(engine.created).toHaveLength(0)

    await vi.waitFor(() => expect(engine.started).toBe(1))
    expect(engine.created[0]!.context).toBe(contexts[0])
    run.controller.abort()
    await expect(run.running).rejects.toMatchObject({ name: 'AbortError' })
    expect(engine.disposed).toBe(1)
    await vi.waitFor(() => expect(events).toContain('close'))
  })

  it('asks for a key when the context did not start, and resumes from that key', async () => {
    allowed = false
    const run = start()
    await vi.waitFor(() => expect(run.text()).toContain('press any key to start sound'))
    expect(engine.created).toHaveLength(0)

    allowed = true
    run.press('x')
    expect(events.at(-1)).toBe('resume')
    await vi.waitFor(() => expect(engine.started).toBe(1))
    run.press('q')
    expect((await run.running).map((l) => l.text)).toEqual(['acid: stopped'])
  })

  it('stops on Ctrl+C while it waits for that key', async () => {
    allowed = false
    const run = start()
    await vi.waitFor(() => expect(run.text()).toContain('press any key'))
    run.controller.abort()
    await expect(run.running).rejects.toMatchObject({ name: 'AbortError' })
    expect(engine.created).toHaveLength(0)
  })

  it('plays a shared code, and prints the link that edits it', async () => {
    const code = encode({ ...DEFAULT_PATTERN, bpm: 250 })
    const run = start([code])
    await vi.waitFor(() => expect(engine.started).toBe(1))
    expect(run.text()).toContain('acid · 250 bpm · saw · A')
    expect(run.printed.find((l) => l.href)?.text).toBe(`/tools/acid?p=${code}`)
    expect(run.printed.find((l) => l.href)).toMatchObject({ href: `/tools/acid?p=${code}` })
    run.press('q')
    await run.running
  })

  it('refuses a code that is not one, and closes the context it opened', async () => {
    const out = await start(['not-a-code!']).running
    expect(out.map((l) => l.text).join('\n')).toContain('acid: not-a-code!: not a pattern code')
    expect(engine.created).toHaveLength(0)
    await vi.waitFor(() => expect(events).toContain('close'))
  })

  it('says so when the browser has no Web Audio', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const out = await start().running
    expect(out.map((l) => l.text)).toEqual(['acid: this browser has no Web Audio, so there is nothing to play it on'])
  })

  it('draws a playhead under the step that is sounding', async () => {
    const run = start()
    await vi.waitFor(() => expect(engine.started).toBe(1))
    engine.position = 3
    await vi.waitFor(() => expect(run.printed.some((l) => l.text.indexOf('▲') === 12)).toBe(true))
    run.press('q')
    await run.running
  })

  it('draws no playhead under reduced motion', async () => {
    motion.reduced = true
    const run = start()
    await vi.waitFor(() => expect(engine.started).toBe(1))
    engine.position = 3
    run.press('q')
    await run.running
    expect(run.text()).not.toContain('▲')
  })

  // Found in review: the playhead ignored the site's own motion setting.
  it('draws no playhead with motion paused, whatever the OS says', async () => {
    const { setMotion } = await import('@/composables/useMotion')
    setMotion('paused')
    try {
      const run = start()
      await vi.waitFor(() => expect(engine.started).toBe(1))
      engine.position = 3
      run.press('q')
      await run.running
      expect(run.text()).not.toContain('▲')
    } finally {
      setMotion('full')
    }
  })

  it('stops after two minutes', async () => {
    vi.useFakeTimers()
    const run = start()
    await vi.waitFor(() => expect(engine.started).toBe(1))
    await vi.advanceTimersByTimeAsync(120_000)
    expect((await run.running).map((l) => l.text)).toEqual(['acid: stopped after two minutes; run it again for more'])
    expect(engine.disposed).toBe(1)
  })

  it.each([
    ['the tab went to the background', () => engine.created[0]!.onStop!('hidden')],
    ['the acid tool started a pattern', () => engine.created[0]!.onStop!('replaced')],
    ['the terminal was closed', () => void (terminalOpen.value = false)],
  ])('stops when %s', async (reason, trigger) => {
    const run = start()
    await vi.waitFor(() => expect(engine.started).toBe(1))
    trigger()
    expect((await run.running).map((l) => l.text)).toEqual([`acid: stopped: ${reason}`])
    expect(engine.disposed).toBe(1)
  })

  it('stops on a Ctrl+C that lands while its chunks load', async () => {
    const run = start()
    run.controller.abort()
    await expect(run.running).rejects.toMatchObject({ name: 'AbortError' })
    expect(engine.started).toBe(0)
  })
})
