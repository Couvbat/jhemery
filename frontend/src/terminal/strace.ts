import { profile } from '@/content'
import type { RequestTrace } from '@/lib/api'
import { formatBytes } from '@/tools/image/image'
import { pre } from './format'
import type { OutputLine } from './types'

/**
 * How `strace` prints a request: what was asked for and how it went, and the *shape*
 * of what crossed the wire, never a value. A query keeps its names and loses its values;
 * a body becomes its keys, two levels deep, with arrays as their length. So `strace sign`
 * shows that a name and a message were sent, and neither of them.
 */

/** `/stats/wordle?day=2026-10-01&locale=en` → `/stats/wordle?day=…&locale=…`. */
export function maskQuery(url: string): string {
  const at = url.indexOf('?')
  if (at < 0) return url
  const names = url
    .slice(at + 1)
    .split('&')
    .filter(Boolean)
    .map((pair) => `${pair.split('=')[0]}=…`)
  return `${url.slice(0, at)}?${names.join('&')}`
}

/** Keys only, depth ≤ 2, arrays as `[n]`; a bare value is its type. */
export function shapeOf(value: unknown, depth = 1): string {
  if (Array.isArray(value)) return `[${value.length}]`
  if (value === null) return 'null'
  if (typeof value !== 'object') return typeof value
  if (depth > 2) return '{…}'
  const keys = Object.entries(value as Record<string, unknown>).map(([key, inner]) =>
    inner !== null && typeof inner === 'object' ? `${key}: ${shapeOf(inner, depth + 1)}` : key,
  )
  return keys.length ? `{ ${keys.join(', ')} }` : '{}'
}

/** `GET /weather = 200 · 1.1 kB · 84 ms`, then the shapes sent and received. */
export function traceLines(trace: RequestTrace): OutputLine[] {
  const where = trace.site ? `${profile.domain}${maskQuery(trace.url)}` : maskQuery(trace.url)
  const parts = [`${trace.method} ${where} = ${trace.status}`]
  if (typeof trace.status === 'number') parts.push(formatBytes(trace.bytes))
  parts.push(`${trace.ms} ms`)
  const tone = trace.status === 'error' || (typeof trace.status === 'number' && trace.status >= 400) ? 'error' : 'default'
  return [
    pre(parts.join(' · '), tone),
    ...(trace.sent !== undefined ? [pre(`  → ${shapeOf(trace.sent)}`, 'muted')] : []),
    ...(trace.received !== undefined ? [pre(`  ← ${shapeOf(trace.received)}`, 'muted')] : []),
  ]
}
