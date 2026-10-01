import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildResume } from '../../../vite-plugins/resume'
import { profile } from '@/content'
import { contentCommands } from '../commands/content'
import { isPrintable, parseCurlArgs, resolveTarget } from '../curl'
import { runCommand } from './context'

const curl = contentCommands.find((c) => c.name === 'curl')!
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const text = (body: string, type = 'text/plain; charset=utf-8', status = 200) =>
  new Response(body, { status, headers: { 'content-type': type } })

describe('parseCurlArgs', () => {
  it('reads -I and --head, accepts -s and -L, combined or not', () => {
    expect(parseCurlArgs(['-I', 'jhemery.xyz'])).toEqual({ ok: true, head: true, targets: ['jhemery.xyz'] })
    expect(parseCurlArgs(['-sLI'])).toEqual({ ok: true, head: true, targets: [''] })
    expect(parseCurlArgs(['--head', '--silent', '--location', '/llms.txt'])).toMatchObject({ head: true, targets: ['/llms.txt'] })
    expect(parseCurlArgs([])).toEqual({ ok: true, head: false, targets: [''] })
  })

  it('refuses any other flag the way curl does', () => {
    expect(parseCurlArgs(['-X', 'POST'])).toEqual({
      ok: false,
      lines: ['curl: option -X: is unknown', "curl: try 'curl --help' or 'curl --manual' for more information"],
    })
    expect(parseCurlArgs(['--data', 'x'])).toMatchObject({ ok: false, lines: ['curl: option --data: is unknown', expect.any(String)] })
  })
})

describe('resolveTarget', () => {
  it.each([
    ['', '/resume.txt'],
    ['jhemery.xyz', '/resume.txt'],
    ['https://jhemery.xyz/', '/resume.txt'],
    ['www.jhemery.xyz/llms.txt', '/llms.txt'],
    ['localhost:5173/sitemap.xml', '/sitemap.xml'],
    ['http://127.0.0.1:4173', '/resume.txt'],
    ['here.test:8080/robots.txt', '/robots.txt'],
    ['/content.json', '/content.json'],
    ['jhemery.xyz/notes/#heading', '/notes/'],
    ['https://jhemery.xyz:443/llms.txt', '/llms.txt'],
    ['/content.json?x=1', '/content.json?x=1'],
  ])('%s is %s on this origin', (target, path) => {
    expect(resolveTarget(target, 'here.test:8080')).toEqual({ path })
  })

  it('cannot resolve any other host', () => {
    expect(resolveTarget('example.com/x', 'here.test')).toEqual({ unresolved: 'example.com' })
    expect(resolveTarget('https://evil.example:8443', 'here.test')).toEqual({ unresolved: 'evil.example' })
  })

  // Found in review: `fetch('//host/x')` is another origin's URL, so these must not pass as paths.
  it.each(['//api.jhemery.xyz/weather', '/\\api.jhemery.xyz/weather', 'jhemery.xyz//api.jhemery.xyz/presence'])(
    'refuses %s, a protocol-relative path to another origin',
    (target) => {
      expect(resolveTarget(target, 'here.test')).toEqual({ unresolved: 'api.jhemery.xyz' })
    },
  )
})

describe('isPrintable', () => {
  it('prints text and JSON, not binary', () => {
    expect(isPrintable('text/plain; charset=utf-8', new Uint8Array([65]))).toBe(true)
    expect(isPrintable('application/json', new Uint8Array([123]))).toBe(true)
    expect(isPrintable('application/manifest+json', new Uint8Array([123]))).toBe(true)
    expect(isPrintable('image/png', new Uint8Array([137]))).toBe(false)
    expect(isPrintable('text/plain', new Uint8Array([65, 0, 66]))).toBe(false)
  })
})

describe('curl', () => {
  it('fetches the real résumé for a bare host, through the SGR parser: the name, no flag, no escape', async () => {
    fetchMock.mockResolvedValue(text(buildResume()))
    const { text: out, lines } = await runCommand(curl, ['jhemery.xyz'])
    expect(fetchMock.mock.calls[0]![0]).toBe('/resume.txt')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET', cache: 'no-store' })
    expect(out).toContain(profile.name)
    expect(out).not.toMatch(/CTF\{/)
    expect(out).not.toContain('\u001b')
    expect(lines.some((l) => l.segments?.some((s) => s.tone === 'primary'))).toBe(true)
  })

  it('prints the status and the real headers for -I, from a HEAD', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 200, headers: { 'content-security-policy': "default-src 'none'", 'strict-transport-security': 'max-age=63072000' } }),
    )
    const { text: out } = await runCommand(curl, ['-I', profile.domain])
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'HEAD' })
    expect(out.split('\n')[0]).toBe('HTTP/2 200')
    expect(out).toContain("content-security-policy: default-src 'none'")
    expect(out).toContain('strict-transport-security: max-age=63072000')
  })

  it('caps a long text at 400 lines and says how many more there were', async () => {
    fetchMock.mockResolvedValue(text(Array.from({ length: 450 }, (_, i) => `line ${i}`).join('\n')))
    const { lines } = await runCommand(curl, ['/llms.txt'])
    expect(lines).toHaveLength(401)
    expect(lines.at(-1)!.text).toContain('50 more lines')
  })

  it('warns about binary, and about a body past 256 kB, rather than printing either', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }))
    expect((await runCommand(curl, ['/icon.png'])).text).toContain('Binary output can mess up your terminal')

    fetchMock.mockResolvedValue(new Response('x', { headers: { 'content-length': String(300 * 1024), 'content-type': 'text/plain' } }))
    const big = await runCommand(curl, ['/assets/ffmpeg-core.wasm'])
    expect(big.lines[0]).toMatchObject({ tone: 'warning' })
    expect(big.text).toContain('curl -O https://jhemery.xyz/assets/ffmpeg-core.wasm')
  })

  it('says (7) when the network fails, and (6) for any other host without fetching', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await runCommand(curl, [])).text).toMatch(/^curl: \(7\) Failed to connect to jhemery\.xyz port 443/)

    fetchMock.mockClear()
    const other = await runCommand(curl, ['example.com'])
    expect(other.text).toMatch(/^curl: \(6\) Could not resolve host: example\.com/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Found in review: the résumé's tip, `curl jhemery.xyz/help`, printed index.html here.
  it('reads a one-word path as its curl page, in the reader’s language, as a real terminal is served', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/run/fr/help.txt' ? text('Ce qu’un terminal peut lire ici') : text('<!doctype html>', 'text/html'),
    )
    expect((await runCommand(curl, ['jhemery.xyz/help'], { locale: 'fr' })).text).toContain('Ce qu’un terminal')
    // Not a page: the path itself, as a browser would get it.
    fetchMock.mockClear()
    await runCommand(curl, ['jhemery.xyz/nope'])
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/run/en/nope.txt', '/nope'])
  })

  it('passes unknown flags back as curl would, without fetching', async () => {
    const { lines } = await runCommand(curl, ['-d', 'x'])
    expect(lines[0]).toMatchObject({ text: 'curl: option -d: is unknown', tone: 'error' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
