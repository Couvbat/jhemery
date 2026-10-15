import { describe, expect, it } from 'vitest'
import { liveReport, OFF } from './lab-fixture'
import type { HealthReport } from '../api'
import {
  apiRoutes,
  dataLine,
  newestByRoute,
  newestOf,
  readServerTiming,
  routeOf,
  size,
  type TimingEntry,
} from '../xray-data'
import { parseTrace, pathHops } from '../xray-path'

const BASE = 'https://api.jhemery.xyz'
const entry = (path: string, startTime: number, extra: Partial<TimingEntry> = {}): TimingEntry => ({
  name: `${BASE}${path}`,
  startTime,
  duration: 84.4,
  ...extra,
})
const hit = (ageMs: number) => [
  { name: 'cache', duration: 0, description: 'hit' },
  { name: 'age', duration: ageMs, description: '' },
]

describe('x-ray’s data line', () => {
  it('reads the routes an attribute names', () => {
    expect(apiRoutes('/github/activity  /github/contributions')).toEqual(['/github/activity', '/github/contributions'])
    expect(apiRoutes(null)).toEqual([])
  })

  it('matches an entry to its route with the API’s base stripped and the query dropped', () => {
    expect(routeOf(`${BASE}/stats/wordle?day=2026-10-15&locale=en`, BASE)).toBe('/stats/wordle')
    expect(routeOf(`${BASE}/steam/activity`, BASE)).toBe('/steam/activity')
    expect(routeOf('https://jhemery.xyz/assets/index.js', BASE)).toBeNull()
    // A host that merely starts like the API's is another host.
    expect(routeOf('https://api.jhemery.xyz.evil.test/steam/activity', BASE)).toBeNull()
  })

  it('keeps the newest entry per route, and finds the newest of all', () => {
    const entries = [
      entry('/guestbook', 1_000, { duration: 30 }),
      entry('/steam/activity', 1_500),
      entry('/guestbook', 21_000, { duration: 12 }),
      { name: 'https://jhemery.xyz/fonts/x.woff2', startTime: 30_000, duration: 5 },
    ]
    const newest = newestByRoute(entries, BASE)
    expect([...newest.keys()]).toEqual(['/guestbook', '/steam/activity'])
    expect(newest.get('/guestbook')!.duration).toBe(12)
    expect(newestOf(newest.values())!.startTime).toBe(21_000)
  })

  it('reads Server-Timing as a hit with its age or a miss with the upstream time', () => {
    expect(readServerTiming(hit(180_000))).toEqual({ cache: 'hit', ageMs: 180_000 })
    expect(
      readServerTiming([
        { name: 'cache', duration: 0, description: 'miss' },
        { name: 'upstream', duration: 812, description: '' },
      ]),
    ).toEqual({ cache: 'miss', upstreamMs: 812 })
    // Across origins without Timing-Allow-Origin the list is empty.
    expect(readServerTiming([])).toBeNull()
    expect(readServerTiming(undefined)).toBeNull()
  })

  it('writes the line in both languages', () => {
    const steam = entry('/steam/activity', 0, { transferSize: 1_229, serverTiming: hit(180_000) })
    expect(dataLine('/steam/activity', steam, 'en')).toBe('GET /steam/activity · 84 ms · 1.2 kB · server copy 3 min old')
    expect(dataLine('/steam/activity', steam, 'fr')).toBe('GET /steam/activity · 84 ms · 1,2 ko · copie serveur vieille de 3 min')
    const miss = entry('/weather', 0, { serverTiming: [{ name: 'cache', duration: 0, description: 'miss' }, { name: 'upstream', duration: 640, description: '' }] })
    expect(dataLine('/weather', miss, 'en')).toBe('GET /weather · 84 ms · upstream 640 ms')
  })

  it('says when a route hasn’t been asked yet, names the form’s POST, and reads the stream from its state', () => {
    expect(dataLine('/guestbook', undefined, 'en')).toBe('GET /guestbook · no request yet')
    expect(dataLine('/contact', undefined, 'fr')).toBe('POST /contact · pas encore de requête')
    expect(dataLine('/presence', undefined, 'en', 'open')).toBe('GET /presence · stream · open')
    expect(dataLine('/presence', undefined, 'fr', 'closed')).toBe('GET /presence · stream · fermé')
  })

  it('formats sizes under and over a kilobyte', () => {
    expect(size(512, 'en')).toBe('512 B')
    expect(size(512, 'fr')).toBe('512 o')
    expect(size(20_480, 'en')).toBe('20 kB')
  })
})

describe('this visit’s path', () => {
  const TRACE = [
    'fl=123f45',
    'h=jhemery.xyz',
    'ip=203.0.113.42',
    'ts=1760557321.123',
    'visit_scheme=https',
    'uag=Mozilla/5.0',
    'colo=CDG',
    'sliver=none',
    'http=http/3',
    'loc=FR',
    'tls=TLSv1.3',
    'sni=plaintext',
    'warp=off',
    'gateway=off',
    'rbi=off',
    'kex=X25519',
  ].join('\n')

  it('keeps exactly colo, http and tls from the trace, and never the address or the country', () => {
    const trace = parseTrace(TRACE)
    expect(trace).toEqual({ colo: 'CDG', http: 'http/3', tls: 'TLSv1.3' })
    expect(JSON.stringify(trace)).not.toMatch(/203\.0\.113|FR|Mozilla/)
  })

  it('reads a page that isn’t the trace as nothing', () => {
    expect(parseTrace('<!doctype html><html lang="en">\n<p>colo=<script></p>')).toEqual({})
  })

  const health = (ask: boolean): HealthReport => ({
    uptime: 3 * 86_400,
    units: [{ unit: 'ask', state: ask ? 'active' : 'inactive' }],
  })

  it('has three hops with the lab absent, the first one through Cloudflare', () => {
    const hops = pathHops({ trace: parseTrace(TRACE), apiMs: 84, health: health(false), lab: OFF }, 'en')
    expect(hops.map((hop) => hop.id)).toEqual(['visitor', 'site', 'api'])
    expect(hops[0]!.path).toBe('you → Cloudflare, colo CDG, HTTP/3, TLS 1.3')
    expect(hops[1]!.path).toBe('Cloudflare → o2switch · site: Apache, serving the built app')
    expect(hops[2]).toMatchObject({
      path: 'the API: Cloudflare → o2switch · API, Passenger running NestJS',
      detail: 'last round trip 84 ms · up 3 days',
    })
  })

  it('adds the model while ask is on, and the lab’s push when the API takes it', () => {
    const hops = pathHops({ trace: {}, health: health(true), lab: liveReport(40_000) }, 'en')
    expect(hops.map((hop) => hop.id)).toEqual(['visitor', 'site', 'api', 'model', 'lab'])
    expect(hops[3]).toEqual({
      id: 'model',
      path: 'NestJS → Cloudflare’s restricted rule → Cloudflare Tunnel → Ollama on poseidon',
      detail: 'the model runtime is up',
    })
    expect(hops[4]).toEqual({ id: 'lab', path: 'the lab → the API: the snapshot, once a minute', detail: 'last push 40 s ago' })
  })

  it('says so when the page isn’t behind Cloudflare, and while the trace is on its way', () => {
    expect(pathHops({ trace: {} }, 'en')[0]).toMatchObject({ path: 'you → this server', detail: 'not behind Cloudflare here' })
    expect(pathHops({ trace: null }, 'fr')[0]).toMatchObject({ detail: 'pas derrière Cloudflare ici' })
    expect(pathHops({ trace: undefined }, 'en')[0]!.detail).toBe('reading the trace…')
  })
})
