import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))

import { setLocale } from '@/i18n'
import { runLink, submit, useTerminal } from '@/composables/useTerminal'
import { clearAliases, setAlias } from '../aliases'
import { cancel } from '@/composables/useTerminal'
import { isLinkable, resolve } from '../registry'
import { maskQuery, shapeOf } from '../strace'

/**
 * `strace` runs a command for real, inside the shell, and lists what it asked the
 * network for: the request and the *shape* of each body, never a value.
 */

const { buffer, clearBuffer, run } = useTerminal()
const texts = () => buffer.value.map((l) => l.text)
let fetchMock: ReturnType<typeof vi.fn>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  clearBuffer()
  clearAliases()
  setLocale('en')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('shapes', () => {
  it('masks query values and keeps their names', () => {
    expect(maskQuery('/stats/wordle?day=2026-10-01&locale=en')).toBe('/stats/wordle?day=…&locale=…')
    expect(maskQuery('/weather')).toBe('/weather')
  })

  it('shows keys two levels deep, arrays as their length, and no value', () => {
    expect(shapeOf({ configured: true, now: { temperature: 12, wind: { speed: 3 } }, forecast: [1, 2, 3] })).toBe(
      '{ configured, now: { temperature, wind: {…} }, forecast: [3] }',
    )
    expect(shapeOf([1, 2])).toBe('[2]')
    expect(shapeOf('secret')).toBe('string')
    expect(shapeOf({})).toBe('{}')
  })
})

describe('strace', () => {
  it('prints exactly what the command prints when it makes no request', async () => {
    await run('ls')
    const plain = texts().slice(1)
    clearBuffer()
    await run('strace ls')
    expect(texts().slice(1)).toEqual(plain)
  })

  it('lists one line for weather, after its output, and the exit trailer', async () => {
    fetchMock.mockResolvedValue(json({ configured: false }))
    await run('strace weather')
    const lines = texts()
    const at = lines.findIndex((l) => l.startsWith('GET /weather = 200 · '))
    expect(at).toBeGreaterThan(1)
    expect(lines[at + 1]).toBe('  ← { configured }')
    expect(lines.at(-1)).toBe('+++ exited with 0 +++')
    expect(lines.filter((l) => / = \d{3} · /.test(l))).toHaveLength(1)
  })

  it('shows what sign sent as its shape, and neither the name nor the message', async () => {
    fetchMock.mockResolvedValue(json({ id: '1', name: 'Jules', message: 'great site', date: '2026-10-01' }))
    const done = run('strace sign great site')
    await vi.waitFor(() => expect(texts().some((l) => l.includes('your name'))).toBe(true))
    await submit('Jules')
    await done
    const traced = texts().slice(texts().findIndex((l) => l.startsWith('POST /guestbook')))
    expect(traced[0]).toMatch(/^POST \/guestbook = 200 · /)
    expect(traced[1]).toBe('  → { name, message }')
    expect(traced.join('\n')).not.toContain('great site')
    expect(traced.join('\n')).not.toContain('Jules')
  })

  // `weather` caches what it fetched; `guestbook` asks every time, so the rest use it.
  it('traces the command, not what the visitor aliased its name to', async () => {
    setAlias('mine', 'echo not this')
    await run('strace mine')
    expect(texts().join('\n')).not.toContain('not this')
    expect(texts().at(-1)).toBe("strace: Can't stat 'mine': No such file or directory")
  })

  it('refuses to trace itself, and says so for an unknown command', async () => {
    await run('strace strace ls')
    expect(texts().at(-1)).toMatch(/^strace: /)
    clearBuffer()
    await run('strace nope')
    expect(texts().at(-1)).toBe("strace: Can't stat 'nope': No such file or directory")
  })

  // Found in review: the command strace ran never saw the pipe's input.
  it('hands the traced command what came in through the pipe', async () => {
    await run('sha256sum about.txt')
    const digest = texts().at(-1)!.split(/\s+/)[0]
    clearBuffer()
    await run('cat about.txt | strace sha256sum')
    expect(texts().some((l) => l.startsWith(`${digest}  -`))).toBe(true)
  })

  it('links a two-word command the way it links it bare', () => {
    expect(isLinkable(resolve('git log')!, [])).toBe(true)
    expect(isLinkable(resolve('strace')!, ['git', 'log'])).toBe(true)
  })

  // Found in review: `ask` keeps what it had on Ctrl+C rather than rethrowing, which
  // strace read as a clean exit.
  it('ends a run stopped by Ctrl+C as killed, whether or not the command rethrew', async () => {
    let finish: (value: Response) => void = () => {}
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)))
    const done = run('strace guestbook')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    cancel()
    finish(json({ enabled: false }))
    await done
    const lines = texts()
    expect(lines).toContain('+++ killed by SIGINT +++')
    expect(lines).not.toContain('+++ exited with 0 +++')
  })

  it('prints no trailer for a run stopped before any request', async () => {
    const done = run('strace ls')
    cancel()
    await done
    expect(texts().join('\n')).not.toContain('+++')
  })

  it('runs from a link only when what it traces could', async () => {
    fetchMock.mockResolvedValue(json({ enabled: false }))
    await runLink('strace guestbook')
    expect(texts().some((l) => l.startsWith('GET /guestbook = 200'))).toBe(true)

    clearBuffer()
    await runLink('strace sign x')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(buffer.value[0]!.tone).toBe('warning')
  })
})
