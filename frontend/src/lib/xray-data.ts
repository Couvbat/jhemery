import type { Locale } from '@/content/types'
import { age } from './lab'

/**
 * X-ray's data line (`docs/superpowers/specs/2026-10-15-xray-data-layer-design.md`): for a
 * component tagged `data-api`, which route fed it, how long that took and how old the
 * server's copy was. Read from what the browser already recorded, Resource Timing, so
 * `request()` keeps its fast path: x-ray turns on after the page's requests have happened,
 * and an observer there could not help anyway. Pure: entries in, words out.
 */

/** The fields of a `PerformanceResourceTiming` this reads, so a spec can hand in plain objects. */
export interface TimingEntry {
  name: string
  startTime: number
  duration: number
  /** Zero across origins without `Timing-Allow-Origin`, and for an answer from the HTTP cache. */
  transferSize?: number
  serverTiming?: readonly { name: string; duration: number; description: string }[]
}

/** The routes a `data-api` attribute names. */
export function apiRoutes(attribute: string | null | undefined): string[] {
  return (attribute ?? '').split(/\s+/).filter((route) => route.startsWith('/'))
}

/** An entry's route on the API, without its query, or null for any other URL. */
export function routeOf(url: string, base: string): string | null {
  if (!base || !url.startsWith(`${base}/`)) return null
  return url.slice(base.length).split(/[?#]/)[0]!
}

/** The newest entry for each route on the API. */
export function newestByRoute(entries: readonly TimingEntry[], base: string): Map<string, TimingEntry> {
  const newest = new Map<string, TimingEntry>()
  for (const entry of entries) {
    const route = routeOf(entry.name, base)
    if (!route) continue
    const seen = newest.get(route)
    if (!seen || entry.startTime >= seen.startTime) newest.set(route, entry)
  }
  return newest
}

/** The newest entry of all, for the request path's API hop. */
export function newestOf(entries: Iterable<TimingEntry>): TimingEntry | undefined {
  let newest: TimingEntry | undefined
  for (const entry of entries) if (!newest || entry.startTime >= newest.startTime) newest = entry
  return newest
}

export type ServerCopy = { cache: 'hit'; ageMs: number } | { cache: 'miss'; upstreamMs: number }

/** `cache;desc="hit", age;dur=180000` (or a miss with `upstream`), as the API's caching routes send it. */
export function readServerTiming(timing: TimingEntry['serverTiming']): ServerCopy | null {
  const metric = (name: string) => timing?.find((each) => each.name === name)
  const cache = metric('cache')?.description
  if (cache === 'hit') {
    const ageMetric = metric('age')
    return ageMetric ? { cache: 'hit', ageMs: ageMetric.duration } : null
  }
  if (cache === 'miss') {
    const upstream = metric('upstream')
    return upstream ? { cache: 'miss', upstreamMs: upstream.duration } : null
  }
  return null
}

/** `84 ms`. */
export function millis(ms: number): string {
  return `${Math.round(ms)} ms`
}

/** `512 B`, `1.2 kB` (`512 o`, `1,2 ko`). */
export function size(bytes: number, locale: Locale): string {
  const fr = locale === 'fr'
  if (bytes < 1024) return `${bytes} ${fr ? 'o' : 'B'}`
  const kb = Math.round((bytes / 1024) * 10) / 10
  return `${fr ? String(kb).replace('.', ',') : kb} ${fr ? 'ko' : 'kB'}`
}

/** The one form among the tagged widgets: its route is a POST, every other a GET. */
const METHODS: Record<string, string> = { '/contact': 'POST' }

/** The presence count is a held stream: no finished entry while it is open. */
export const STREAM_ROUTE = '/presence'

/**
 * One route's line: `GET /steam/activity · 84 ms · 1.2 kB · server copy 3 min old`.
 * `stream` is the presence stream's state, from `usePresence`, since an open stream has
 * no entry to read.
 */
export function dataLine(
  route: string,
  entry: TimingEntry | undefined,
  locale: Locale,
  stream?: 'open' | 'closed',
): string {
  const fr = locale === 'fr'
  const head = `${METHODS[route] ?? 'GET'} ${route}`
  if (route === STREAM_ROUTE && stream) {
    return `${head} · stream · ${stream === 'open' ? (fr ? 'ouvert' : 'open') : fr ? 'fermé' : 'closed'}`
  }
  if (!entry) return `${head} · ${fr ? 'pas encore de requête' : 'no request yet'}`
  const parts = [head, millis(entry.duration)]
  if (entry.transferSize) parts.push(size(entry.transferSize, locale))
  const copy = readServerTiming(entry.serverTiming)
  if (copy?.cache === 'hit') {
    parts.push(fr ? `copie serveur vieille de ${age(copy.ageMs, locale)}` : `server copy ${age(copy.ageMs, locale)} old`)
  } else if (copy?.cache === 'miss') {
    parts.push(fr ? `en amont ${millis(copy.upstreamMs)}` : `upstream ${millis(copy.upstreamMs)}`)
  }
  return parts.join(' · ')
}
