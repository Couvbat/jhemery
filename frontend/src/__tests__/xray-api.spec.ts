import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apiRoutes } from '@/lib/xray-data'

/**
 * X-ray's data line is only worth anything if every live widget has one, so the source is
 * read off disk, as `storage-keys.spec.ts` reads it: a component that reads the API and
 * ships without `data-api` on its root fails here, and so does one naming a route the API
 * client doesn't call. From the working directory, since under jsdom `import.meta.url` is
 * an http: URL.
 */

const SRC = join(process.cwd(), 'src')

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : vueFiles(path)
    return name.endsWith('.vue') ? [path] : []
  })
}

const files = [...vueFiles(join(SRC, 'components')), ...vueFiles(join(SRC, 'views'))].map((path) => ({
  path: relative(SRC, path).replaceAll('\\', '/'),
  source: readFileSync(path, 'utf8'),
}))

/** The reader itself, which names every route rather than being fed by one. */
const EXEMPT = new Set(['components/XrayLayer.vue'])

/**
 * The composables that fetch, by the names that start a fetch. `useStatus` is not among
 * them: it reads the build's own date and the clock, and no route.
 */
const DATA_COMPOSABLES: Record<string, string[]> = {
  useSteam: ['useSteam'],
  useGithub: ['useGithub'],
  useWeather: ['useWeather', 'fetchWeather'],
  usePresence: ['usePresence', 'startPresence'],
  useGuestbookTicker: ['useGuestbookTicker'],
  useStats: ['useStats'],
}

/** Whether a file reads the API: a value import of the client, or a fetching composable. */
function readsApi(source: string): boolean {
  // No quote before `from`: the source has no semicolons, and a match must not start at an
  // earlier import and run on to this one.
  if (/^import\s+(?!type\b)[^'"]*?from\s+'@\/lib\/api'/m.test(source)) return true
  for (const match of source.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+'@\/composables\/(\w+)'/gm)) {
    const names = match[1]!.split(',').map((name) => name.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0])
    if ((DATA_COMPOSABLES[match[2]!] ?? []).some((name) => names.includes(name))) return true
  }
  return false
}

const declared = (source: string) => [...source.matchAll(/\bdata-api="([^"]*)"/g)].flatMap((m) => apiRoutes(m[1]))

/** Every route the client names: its quoted paths, and the streams opened by path. */
const knownRoutes = (() => {
  const client = readFileSync(join(SRC, 'lib/api.ts'), 'utf8')
  const routes = new Set([...client.matchAll(/['`](\/[a-z][a-z0-9/_-]*)/g)].map((m) => m[1]!))
  for (const name of readdirSync(join(SRC, 'composables')).filter((file) => file.endsWith('.ts'))) {
    const source = readFileSync(join(SRC, 'composables', name), 'utf8')
    for (const m of source.matchAll(/openEventSource\(\s*'(\/[a-z][a-z0-9/_-]*)'/g)) routes.add(m[1]!)
  }
  return routes
})()

const readers = files.filter((file) => !EXEMPT.has(file.path) && readsApi(file.source))

describe('x-ray’s data line covers every live widget', () => {
  it('finds the live components', () => {
    // Fewer means the pattern broke, not that the site went quiet.
    expect(readers.length).toBeGreaterThanOrEqual(7)
    expect(readers.map((file) => file.path)).toContain('components/sections/GamingSection.vue')
  })

  it.each(readers.map((file) => [file.path, file] as const))('%s names its routes in data-api', (_path, file) => {
    expect(declared(file.source), `${file.path} reads the API and carries no data-api`).not.toEqual([])
  })

  it.each(files.filter((file) => declared(file.source).length).map((file) => [file.path, file] as const))(
    '%s names only routes the API client calls',
    (_path, file) => {
      for (const route of declared(file.source)) expect(knownRoutes, `${file.path}: ${route}`).toContain(route)
    },
  )

  it('tells a value import from a type-only one', () => {
    expect(readsApi(`import type { LabReport } from '@/lib/api'`)).toBe(false)
    expect(readsApi(`import { api, type LabReport } from '@/lib/api'`)).toBe(true)
    expect(readsApi(`import { relativeTime } from '@/composables/useGithub'`)).toBe(false)
    expect(readsApi(`import { fetchWeather, weatherMood } from '@/composables/useWeather'`)).toBe(true)
  })
})
