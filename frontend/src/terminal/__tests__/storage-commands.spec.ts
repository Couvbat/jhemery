import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => true,
}))
// `sudo rm -rf /` paces its lines unless motion is paused.
vi.mock('@/composables/useMotion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useMotion')>()),
  decorativeMotion: () => 'paused',
}))
// The real one waits, reloads, and never settles; jsdom can't reload.
const reload = vi.hoisted(() => ({ page: vi.fn(() => Promise.resolve()) }))
vi.mock('@/lib/storage-keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage-keys')>()),
  reloadPage: () => reload.page(),
}))

import { setLocale } from '@/i18n'
import { history } from '@/terminal/history'
import { submit, useTerminal } from '@/composables/useTerminal'
import { isLinkable, resolve, writesOf } from '../registry'
import type { CommandContext } from '../types'
import { recordingContext, runCommand } from './context'

const du = () => resolve('du')!
const rm = () => resolve('rm')!

const PASSWORD = 'hunter2-correct-horse'

function seed() {
  localStorage.setItem('couvbat:locale', 'fr')
  localStorage.setItem('couvbat:history', JSON.stringify(['ls', 'theme dracula']))
  localStorage.setItem('couvbat:games:snake', '12')
  localStorage.setItem('couvbat:games:tetris', '3400')
  localStorage.setItem('couvbat:retired', 'old')
  localStorage.setItem('umami.disabled', '1')
  sessionStorage.setItem('couvbat:sudo', PASSWORD)
  sessionStorage.setItem('couvbat:room:AB3DE', 'host-token')
}

const namespaced = () =>
  [localStorage, sessionStorage].flatMap((store) => Object.keys(store).filter((key) => key.startsWith('couvbat:'))).sort()

const SEEDED = [
  'couvbat:games:snake',
  'couvbat:games:tetris',
  'couvbat:history',
  'couvbat:locale',
  'couvbat:retired',
  'couvbat:room:AB3DE',
  'couvbat:sudo',
]

beforeEach(() => {
  // Before the clear: switching the locale saves it.
  setLocale('en')
  localStorage.clear()
  sessionStorage.clear()
  reload.page.mockClear()
})
afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('du', () => {
  it('lists each key with its size, value and purpose, grouped', async () => {
    seed()
    const { text } = await runCommand(du(), ['~'])
    expect(text).toMatch(/^settings · localStorage$/m)
    expect(text).toMatch(/^ {2}2 B {6}couvbat:locale {2,}fr$/m)
    expect(text).toContain('the language you picked')
    expect(text).toContain('["ls","theme dracula"]')
    expect(text).toMatch(/^best scores · localStorage$/m)
    expect(text).toMatch(/^left by an older version · localStorage$/m)
    // Nothing outside the namespace is the site's to report.
    expect(text).not.toContain('umami')
  })

  it('never prints a secret, only its length', async () => {
    seed()
    const { text } = await runCommand(du(), [])
    expect(text).toMatch(/^secrets · sessionStorage, forgotten when the tab closes$/m)
    expect(text).toContain(`couvbat:sudo`)
    expect(text).toContain(`<secret, ${PASSWORD.length} bytes>`)
    expect(text).toContain('<secret, 10 bytes>')
    expect(text).not.toContain(PASSWORD)
    expect(text).not.toContain('host-token')
    // A stale key is its size: nothing vouches for what it holds.
    expect(text).toContain('<3 B>')
    expect(text).not.toMatch(/\bold\b/)
  })

  it('totals the keys, then the caches, and says what no page can list', async () => {
    seed()
    const { lines, text } = await runCommand(du(), ['~'])
    expect(text).toContain('7 keys, 64 B')
    expect(text).toMatch(/ffmpeg’s 32\.2 MB core, .* sits in the HTTP cache/)
    expect(text).toContain('SoundCloud players')
    expect(lines.at(-1)).toMatchObject({ href: '/privacy' })
  })

  it('says so when nothing is stored', async () => {
    const { text } = await runCommand(du(), [])
    expect(text).toContain('nothing stored here.')
  })

  it('reads one group or one key, and -s totals', async () => {
    seed()
    const scores = await runCommand(du(), ['scores'])
    expect(scores.text).toContain('couvbat:games:snake')
    expect(scores.text).not.toContain('couvbat:locale')
    expect(scores.text).not.toContain('HTTP cache')

    expect((await runCommand(du(), ['-sh', 'scores'])).text).toBe('6 B      scores')
    expect((await runCommand(du(), ['-s', 'history'])).text).toBe('22 B     history')
  })

  it('fails on what it can’t find, and on a flag it doesn’t know', async () => {
    const missing = await runCommand(du(), ['nope'])
    expect(missing.lines[0]).toMatchObject({ text: "du: cannot access 'nope': No such file or directory", stderr: true })
    expect((await runCommand(du(), ['-x'])).lines[0]).toMatchObject({ text: "du: invalid option -- 'x'", stderr: true })
  })

  it('speaks French', async () => {
    seed()
    const { text } = await runCommand(du(), ['~'], { locale: 'fr' })
    expect(text).toMatch(/^réglages · localStorage$/m)
    expect(text).toContain('la langue choisie')
    expect(text).toContain(`<secret, ${PASSWORD.length} octets>`)
  })

  it('writes nothing, and a link may run it', () => {
    expect(writesOf(du())).toBe('none')
    for (const args of [[], ['~'], ['-s', '~'], ['scores']]) expect(isLinkable(du(), args), args.join(' ')).toBe(true)
    expect(isLinkable(du(), ['your', 'data', 'is', 'gone'])).toBe(false)
  })
})

describe('rm', () => {
  it('writes, so no link runs it', () => {
    for (const args of [[], ['~'], ['-rf', '~'], ['history']]) {
      expect(writesOf(rm(), args)).toBe('local')
      expect(isLinkable(rm(), args)).toBe(false)
    }
  })

  it('clears one key, says so, then reloads', async () => {
    seed()
    const { text } = await runCommand(rm(), ['history'])
    expect(text).toContain("removed 'couvbat:history'")
    expect(text).toContain('1 key, 22 B cleared. Reloading')
    expect(localStorage.getItem('couvbat:history')).toBeNull()
    expect(localStorage.getItem('couvbat:locale')).toBe('fr')
    expect(reload.page).toHaveBeenCalledTimes(1)
  })

  it('speaks French', async () => {
    seed()
    expect((await runCommand(rm(), ['locale'], { locale: 'fr' })).text).toContain('1 clé, 2 B effacée. Rechargement')
  })

  it('takes the whole key as well as its short name', async () => {
    seed()
    await runCommand(rm(), ['couvbat:locale'])
    expect(localStorage.getItem('couvbat:locale')).toBeNull()
  })

  it('clears a group, a secret one included', async () => {
    seed()
    await runCommand(rm(), ['scores'])
    expect(namespaced()).not.toContain('couvbat:games:snake')
    expect(namespaced()).not.toContain('couvbat:games:tetris')
    const { text } = await runCommand(rm(), ['secrets'])
    expect(text).toContain("removed 'couvbat:sudo'")
    expect(text).toContain("removed 'couvbat:room:AB3DE'")
    expect(text).not.toContain(PASSWORD)
    expect(sessionStorage.length).toBe(0)
  })

  it('clears everything under the namespace with -rf ~, and nothing outside it', async () => {
    seed()
    await runCommand(rm(), ['-rf', '~'])
    expect(namespaced()).toEqual([])
    expect(localStorage.getItem('umami.disabled')).toBe('1')
    expect(reload.page).toHaveBeenCalledTimes(1)
  })

  it('says so when a group holds nothing', async () => {
    seed()
    expect((await runCommand(rm(), ['progress'])).text).toBe("rm: nothing stored in 'progress'")
    expect((await runCommand(rm(), ['-f', 'progress'])).lines).toEqual([])
    expect(reload.page).not.toHaveBeenCalled()
  })

  it('needs -r for ~, as a directory does', async () => {
    seed()
    const { lines } = await runCommand(rm(), ['~'])
    expect(lines).toEqual([expect.objectContaining({ text: "rm: cannot remove '~': Is a directory", stderr: true })])
    expect(namespaced()).toEqual(SEEDED)
    expect(reload.page).not.toHaveBeenCalled()
  })

  it('keeps GNU rm’s failsafe for /, and leaves the joke to sudo', async () => {
    seed()
    const { text } = await runCommand(rm(), ['-rf', '/'])
    expect(text).toBe("rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe")
    expect((await runCommand(rm(), ['-rf', '/', '--no-preserve-root'])).text).toBe("rm: unrecognized option '--no-preserve-root'")
    expect(namespaced()).toEqual(SEEDED)

    // `sudo` parses its own arguments, so `rm` existing changes nothing about the joke.
    const { ctx } = recordingContext('sudo', ['rm', '-rf', '/'])
    ctx.effects = { glitch: () => Promise.resolve() } as unknown as CommandContext['effects']
    const out = (await resolve('sudo')!.run(ctx)) ?? []
    expect(out.map((l) => l.text).join('\n')).toContain('just kidding. everything is fine.')
    // It still unlocks its achievement, and removes nothing.
    expect(namespaced()).toEqual(expect.arrayContaining(SEEDED))
    expect(reload.page).not.toHaveBeenCalled()
  })

  it('reports what it can’t remove, and -f hushes the missing', async () => {
    seed()
    expect((await runCommand(rm(), [])).lines[0]).toMatchObject({ text: 'rm: missing operand', stderr: true })
    expect((await runCommand(rm(), ['nope'])).lines).toEqual([
      expect.objectContaining({ text: "rm: cannot remove 'nope': No such file or directory", stderr: true }),
    ])
    expect((await runCommand(rm(), ['-f', 'nope'])).lines).toEqual([])
    // A key that isn't set is a file that isn't there.
    expect((await runCommand(rm(), ['aliases'])).text).toBe("rm: cannot remove 'aliases': No such file or directory")
    // The files `cat` reads are the site's.
    expect((await runCommand(rm(), ['about.txt'])).text).toBe("rm: cannot remove 'about.txt': Permission denied")
    expect(reload.page).not.toHaveBeenCalled()
  })

  it('completes ~, the groups and the keys that are set', () => {
    seed()
    const offered = rm().complete!({ args: [''], index: 0, word: '' })
    expect(offered).toEqual(expect.arrayContaining(['~', 'settings', 'secrets', 'history', 'games:snake', 'room:AB3DE', 'retired']))
    expect(offered).not.toContain('aliases')
  })
})

// Last: the line never settles, as in a browser, so the shell stays busy afterwards.
describe('rm in the shell', () => {
  it('doesn’t let the shell write the cleared history back', async () => {
    const { buffer } = useTerminal()
    reload.page.mockImplementation(() => new Promise<never>(() => {}))
    history.value = ['ls', 'neofetch']
    localStorage.setItem('couvbat:history', JSON.stringify(history.value))
    void submit('rm -rf ~')
    await vi.waitFor(() => expect(buffer.value.some((l) => l.text.includes('Reloading'))).toBe(true))
    await new Promise((settle) => setTimeout(settle, 20))
    expect(localStorage.getItem('couvbat:history')).toBeNull()
    expect(reload.page).toHaveBeenCalledTimes(1)
  })
})
