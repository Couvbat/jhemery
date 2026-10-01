import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, fetchSite, observeRequests, openEventSource, type RequestTrace } from '../api'
import { startGuestbookTicker, stopGuestbookTicker } from '@/composables/useGuestbookTicker'

/**
 * The request observer behind `strace`. What matters: nobody watching means the old code
 * path exactly; somebody watching sees method, path, status, size and the bodies' data,
 * and never a header, which is where the admin password and room tokens travel.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
let traces: RequestTrace[]
let stop: () => void

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  traces = []
  stop = () => {}
})

afterEach(() => {
  stop()
  vi.unstubAllGlobals()
})

const watch = () => {
  stop = observeRequests((trace) => traces.push(trace))
}

describe('request()', () => {
  it('takes the old path when nobody is watching: one fetch, the init untouched, no clone', async () => {
    const res = json({ configured: false })
    const clone = vi.spyOn(res, 'clone')
    fetchMock.mockResolvedValue(res)
    expect(await api.weather()).toEqual({ configured: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![1]).toBeUndefined()
    expect(clone).not.toHaveBeenCalled()
  })

  it('reports method, path, status, size and both bodies to an observer', async () => {
    watch()
    fetchMock.mockResolvedValue(json({ day: '2026-10-01', locale: 'en', counts: [0, 1, 2, 3, 4, 5, 6] }))
    await api.recordWordle('2026-10-01', 'en', 4)
    expect(traces).toHaveLength(1)
    expect(traces[0]).toMatchObject({
      method: 'POST',
      url: '/stats/wordle',
      status: 200,
      sent: { day: '2026-10-01', locale: 'en', guesses: 4 },
      received: { day: '2026-10-01', locale: 'en' },
    })
    expect(traces[0]!.bytes).toBeGreaterThan(20)
  })

  it('never reports a header: not the room token, not the admin password', async () => {
    watch()
    fetchMock.mockResolvedValue(json({ code: 'ABCDE' }))
    await api.updateRoom('ABCDE', 'room-token-secret', { playing: true })
    fetchMock.mockResolvedValue(json({ configured: true, jobs: [] }))
    await api.jobs('admin-password-secret')
    const reported = JSON.stringify(traces)
    expect(reported).not.toContain('room-token-secret')
    expect(reported).not.toContain('admin-password-secret')
    for (const trace of traces) expect(Object.keys(trace)).not.toContain('headers')
  })

  it('reports a request that never got an answer, and still throws', async () => {
    watch()
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.weather()).rejects.toThrow('Failed to fetch')
    expect(traces[0]).toMatchObject({ url: '/weather', status: 'error', bytes: 0 })
  })

  it('still throws the API’s own error after reporting it', async () => {
    watch()
    fetchMock.mockResolvedValue(json({ message: 'nope' }, 400))
    await expect(api.weather()).rejects.toThrow('nope')
    expect(traces[0]).toMatchObject({ status: 400 })
  })

  it('stops reporting once unsubscribed', async () => {
    watch()
    stop()
    fetchMock.mockResolvedValue(json({}))
    await api.weather()
    expect(traces).toEqual([])
  })
})

describe('the two pollers', () => {
  it('marks the guestbook ticker’s polls as background', async () => {
    watch()
    fetchMock.mockResolvedValue(json({ enabled: true, entries: [] }))
    startGuestbookTicker()
    await vi.waitFor(() => expect(traces).toHaveLength(1))
    stopGuestbookTicker()
    expect(traces[0]).toMatchObject({ url: '/guestbook', background: true })
  })

  it('marks the download tool’s interval as background, and only its interval', async () => {
    watch()
    fetchMock.mockResolvedValue(json({ configured: true, jobs: [] }))
    await api.jobs('pw', { background: true })
    expect(traces[0]!.background).toBe(true)
    // The component itself: the interval passes `true`, the first load doesn't.
    const source = readFileSync(join(process.cwd(), 'src/tools/download/DownloadTool.vue'), 'utf8')
    expect(source).toMatch(/setInterval\(\(\) => \{\s*if \(isAdmin\.value && moving\.value\) void refresh\(true\)/)
    expect(source).toMatch(/if \(isAdmin\.value\) void refresh\(\)\n/)
  })
})

describe('askStream', () => {
  it('reports once, at the end, with the bytes read and the question’s shape', async () => {
    watch()
    const body = 'data: {"delta":"hi"}\n\ndata: {"delta":" there"}\n\ndata: [DONE]\n\n'
    fetchMock.mockResolvedValue(new Response(body, { status: 200 }))
    const out: string[] = []
    for await (const delta of api.askStream('who are you', 'en')) out.push(delta)
    expect(out.join('')).toBe('hi there')
    expect(traces).toHaveLength(1)
    expect(traces[0]).toMatchObject({ method: 'POST', url: '/ask', status: 200, sent: { question: 'who are you', locale: 'en' } })
    expect(traces[0]!.bytes).toBe(new TextEncoder().encode(body).byteLength)
  })
})

describe('fetchSite', () => {
  it('reads a body up to the limit and says when it cut it off', async () => {
    watch()
    fetchMock.mockResolvedValue(new Response('x'.repeat(100), { headers: { 'content-type': 'text/plain' } }))
    const small = await fetchSite('/llms.txt', 'GET', { limit: 1000 })
    expect(small).toMatchObject({ status: 200, truncated: false })
    expect(small.body.byteLength).toBe(100)

    fetchMock.mockResolvedValue(new Response('x'.repeat(5000)))
    const big = await fetchSite('/big.txt', 'GET', { limit: 1000 })
    expect(big.truncated).toBe(true)
    expect(big.body.byteLength).toBe(1000)

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET', cache: 'no-store' })
    expect(traces.map((t) => t.site)).toEqual([true, true])
  })

  it('reads no body for HEAD', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200, headers: { 'content-security-policy': "default-src 'self'" } }))
    const res = await fetchSite('/resume.txt', 'HEAD')
    expect(res.body.byteLength).toBe(0)
    expect(res.headers.get('content-security-policy')).toBe("default-src 'self'")
  })
})

describe('openEventSource', () => {
  class FakeSource extends EventTarget {
    constructor(readonly url: string) {
      super()
    }
  }

  it('reports a stream once, when it opens', () => {
    vi.stubGlobal('EventSource', FakeSource)
    watch()
    const source = openEventSource('/presence') as unknown as FakeSource
    source.dispatchEvent(new Event('open'))
    source.dispatchEvent(new Event('error'))
    expect(traces).toHaveLength(1)
    expect(traces[0]).toMatchObject({ method: 'GET', url: '/presence', status: 'stream' })
  })

  it('adds no listener when nobody is watching', () => {
    vi.stubGlobal('EventSource', FakeSource)
    const add = vi.spyOn(FakeSource.prototype, 'addEventListener')
    openEventSource('/presence')
    expect(add).not.toHaveBeenCalled()
    watch()
    openEventSource('/presence')
    expect(add).toHaveBeenCalled()
    add.mockRestore()
  })
})
