import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))
const mocks = vi.hoisted(() => ({ sign: vi.fn(), askStream: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, api: { ...actual.api, sign: mocks.sign, askStream: mocks.askStream } }
})

import { currentLocale, setLocale } from '@/i18n'
import { messages } from '@/i18n/messages'
import { clearAliases, setAlias } from '@/terminal/aliases'
import { history } from '@/terminal/history'
import { cancel, submit, useTerminal } from '../useTerminal'

/**
 * The shell language end to end: `|`, `;`, `&&` and `||`, through the real registry. The
 * parser's own rules are `parse.spec.ts`; this is what running a line does.
 */

const { buffer, busy, clearBuffer, run } = useTerminal()
const texts = () => buffer.value.filter((l) => !l.prompt).map((l) => l.text)

beforeEach(() => {
  clearBuffer()
  clearAliases()
  setLocale('en')
  mocks.sign.mockReset()
})

describe('pipes', () => {
  // First in the file: `fortune` only toasts the first time.
  it('keeps an achievement toast outside the cow: fortune | cowsay', async () => {
    await run('fortune | cowsay')
    const lines = texts()
    const toast = lines.findIndex((l) => l.includes('achievement unlocked'))
    const cow = lines.findIndex((l) => l.includes('(oo)'))
    expect(toast).toBeGreaterThanOrEqual(0)
    expect(cow).toBeGreaterThan(0)
    // The toast went to the screen while fortune ran, before the cow drew a word of it.
    expect(toast).toBeLessThan(cow)
    expect(lines.filter((l) => /^[<|/\\] .* [>|/\\]$/.test(l)).join(' ')).not.toContain('achievement')
  })

  it('hashes a file through a pipe exactly as by name', async () => {
    await run('sha256sum about.txt')
    const named = texts().at(-1)!.split(/\s+/)[0]
    clearBuffer()
    await run('cat about.txt | sha256sum')
    expect(texts().at(-1)).toBe(`${named}  -`)
  })

  it('pretty-prints what projects --json hands jq', async () => {
    await run('projects --json | jq .')
    const out = texts()
    expect(out[0]).toBe('[')
    expect(out.some((l) => l.includes('"name": "jhemery-portfolio"'))).toBe(true)
  })

  it('greps history for earlier lines, never the one running', async () => {
    history.value = ['theme nord', 'ls', 'theme dracula']
    await submit('history | grep theme')
    expect(texts()).toEqual(['  1  theme nord', '  3  theme dracula'].map((l) => l.replace(/^ {2}/, '')))
  })

  it('reads a command’s table through grep: ps aux | grep USER', async () => {
    await run('ps aux | grep USER')
    expect(texts()).toEqual([expect.stringMatching(/^USER: /)])
  })

  it('counts what ls lists: ls | wc -l', async () => {
    await run('ls')
    const listed = texts().length
    clearBuffer()
    await run('ls | wc -l')
    expect(texts()).toEqual([String(listed)])
  })

  it('says a command that needs the keyboard is not a tty on the left of a pipe', async () => {
    await run('snake | cat')
    expect(texts().some((l) => l.includes(messages.terminal.notATty.en))).toBe(true)
    expect(busy.value).toBe(false)
  })

  it('runs an alias that holds a pipe', async () => {
    setAlias('who2', 'whoami | wc -c')
    await run('who2')
    expect(texts()).toEqual(['8'])
  })

  // Found in review: a stage an expansion made was never expanded itself.
  it('expands an alias that an alias pipes into, and keeps env words as typed', async () => {
    setAlias('me', 'whoami')
    setAlias('count', 'me | wc -c')
    await run('count')
    expect(texts()).toEqual(['8'])
    clearBuffer()
    await run(`X='a;b' me`)
    expect(texts()).toEqual(['couvbat'])
  })

  it('refuses a game on the left of a pipe before it does anything', async () => {
    const { api } = await import('@/lib/api')
    const create = vi.spyOn(api, 'createRoom')
    await run('connect4 | cat')
    expect(create).not.toHaveBeenCalled()
    expect(texts().join('\n')).toContain(messages.terminal.notATty.en)
    expect(texts().join('\n')).not.toMatch(/[╔║]/)
  })
})

describe('; && ||', () => {
  it('runs both sides of ;', async () => {
    await run('whoami; pwd')
    expect(texts()[0]).toBe('couvbat')
    expect(texts()[1]).toMatch(/^\/home\/couvbat/)
  })

  it('stops && at a failure and takes || instead', async () => {
    await run('cat nope && pwd')
    expect(texts()).toEqual(['cat: nope: No such file or directory'])
    clearBuffer()
    await run('cat nope || whoami')
    expect(texts()).toEqual(['cat: nope: No such file or directory', 'couvbat'])
    clearBuffer()
    await run('whoami || pwd')
    expect(texts()).toEqual(['couvbat'])
  })

  // Found in review: `why` is a command, so resolving every stage first wasn't enough.
  it('runs nothing when a message to the server shares an unquoted line with an operator', async () => {
    await run('sign love it; why not')
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(texts()[0]).toMatch(/^sign: /)
    expect(texts()[1]).toContain('`sign "love it; why not"`')
  })

  // `ask` keeps its partial answer on Ctrl+C rather than rethrowing; the cow must not draw it.
  it('stops a pipe at Ctrl+C even when a stage keeps what it had instead of rethrowing', async () => {
    mocks.askStream.mockImplementation(async function* (_q: string, _l: string, signal: AbortSignal) {
      yield 'partial'
      if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve))
    })
    const done = run('ask "who is he" | cowsay')
    await vi.waitFor(() => expect(mocks.askStream).toHaveBeenCalled())
    cancel()
    await done
    expect(texts().join('\n')).not.toContain('(oo)')
    expect(texts().filter((l) => l === messages.terminal.cancelled.en)).toHaveLength(1)
  })

  it('offers no quoting hint after a command that takes no free text', async () => {
    await run('ls | frobnicate')
    expect(texts().join('\n')).not.toContain('"')
  })

  it('runs nothing when any stage is unknown, and suggests quoting after an operator', async () => {
    const done = run('sign great site; love it')
    await done
    expect(mocks.sign).not.toHaveBeenCalled()
    expect(texts()[0]).toBe(`love: ${messages.terminal.notFound.en}`)
    expect(texts()[1]).toContain('`sign "great site; love it"`')
  })

  // Found in review: `t` was fixed at the language the stage started in.
  it('toasts in the language lang has just switched to', async () => {
    window.localStorage.clear()
    await run('lang fr')
    expect(texts().join('\n')).toContain('Bilingue')
    setLocale('en')
  })

  it('reads LANG for one stage and leaves the visitor’s language alone', async () => {
    await run('LANG=fr help ls')
    expect(texts().join('\n')).toContain('Lister')
    expect(currentLocale()).toBe('en')
  })

  // `sign` waits on its name prompt, which is where the Ctrl+C lands.
  it('stops the whole line on one Ctrl+C, with one ^C', async () => {
    const done = run('sign "hi" ; whoami ; pwd')
    await vi.waitFor(() => expect(texts().some((l) => l.includes('your name'))).toBe(true))
    cancel()
    await done
    expect(texts()).not.toContain('couvbat')
    expect(texts().filter((l) => l === messages.terminal.cancelled.en)).toHaveLength(1)
    expect(mocks.sign).not.toHaveBeenCalled()
  })
})
