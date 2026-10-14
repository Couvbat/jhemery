import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NAMESPACE,
  STORAGE_GROUPS,
  STORAGE_KEYS,
  cachePurpose,
  cacheReport,
  entryFor,
  groupOf,
  removeItems,
  shortName,
  storedItems,
} from '../storage-keys'

/**
 * The list is a disclosure, so it is only worth anything if it is complete. The source is
 * read off disk for every string that starts with the namespace, a template's fixed head
 * included, and every module that touches either storage: a key that ships without a row
 * fails here, and so does a row whose key nothing writes any more. From the working
 * directory, as `discovery.spec.ts` does: under jsdom `import.meta.url` is an http: URL.
 */

const SRC = join(process.cwd(), 'src')
const SELF = 'lib/storage-keys.ts'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path)
    return /\.(ts|vue)$/.test(name) && !name.endsWith('.d.ts') ? [path] : []
  })
}

const files = sourceFiles(SRC)
  .map((path) => ({ path: relative(SRC, path), source: readFileSync(path, 'utf8') }))
  .filter((file) => file.path !== SELF)
// `index.html` runs in the page too, before any module does.
files.push({ path: '../index.html', source: readFileSync(join(process.cwd(), 'index.html'), 'utf8') })

/**
 * Every string literal that starts with the namespace: `'couvbat:theme'`, a table's
 * `'couvbat:games:snake'`, and the head of `` `couvbat:room:${code}` ``, marked as a template.
 * Concatenation (`'couvbat:' + id`) shows up as the bare namespace, which is no key, so it
 * fails until it has a row too.
 */
function namespaced(source: string): { text: string; template: boolean }[] {
  return [...source.matchAll(/(['"`])(couvbat:[^'"`$\n]*)(\$\{)?/g)].map((m) => ({ text: m[2]!, template: !!m[3] }))
}

const found = files.flatMap((file) => namespaced(file.source).map((literal) => ({ ...literal, file: file.path })))

describe('the list of what the site keeps', () => {
  it('finds the keys in the source', () => {
    // 22 localStorage keys, the admin password, the room tokens' template: fewer means the pattern broke.
    expect(found.length).toBeGreaterThanOrEqual(24)
    expect(found).toContainEqual({ text: 'couvbat:room:', template: true, file: 'rooms/useRoom.ts' })
  })

  it.each(found.map((f) => [`${f.file}: ${f.text}${f.template ? '${…}' : ''}`, f] as const))('lists %s, owned by that file', (_label, literal) => {
    const entry = STORAGE_KEYS.find((e) => e.key === literal.text && !!e.prefix === literal.template)
    expect(entry, `${literal.file} keeps ${literal.text} and lib/storage-keys.ts doesn't list it`).toBeDefined()
    expect(entry!.owner).toBe(literal.file)
  })

  it.each(STORAGE_KEYS.map((e) => [e.key, e] as const))('%s is still written where the list says', (_key, entry) => {
    const path = join(SRC, entry.owner)
    expect(existsSync(path), entry.owner).toBe(true)
    const source = readFileSync(path, 'utf8')
    expect(namespaced(source)).toContainEqual({ text: entry.key, template: !!entry.prefix })
    // The area too: a session key's owner uses sessionStorage; a local one's, localStorage or
    // the shared helper in `terminal/storage.ts`.
    expect(source, entry.owner).toMatch(entry.area === 'session' ? /sessionStorage/ : /localStorage|from '\.\/storage'/)
  })

  it('only lets the modules on the list touch either storage', () => {
    // `terminal/storage.ts` is the helper achievements and the CTF write through; their
    // keys are literals in their own files, which the scan above reads. A quoted name
    // (`du`'s and the page's area labels) is a word, not a use.
    const owners = new Set([...STORAGE_KEYS.map((e) => e.owner), 'terminal/storage.ts'])
    const touching = files.filter((file) => /\b(?:local|session)Storage\b(?!['"`])/.test(file.source)).map((file) => file.path)
    expect(touching.filter((path) => !owners.has(path))).toEqual([])
  })

  it('has no cookie and no database of its own, so the list is all there is', () => {
    const others = files.filter((file) => /document\.cookie|cookieStore|indexedDB|openDatabase/.test(file.source))
    expect(others.map((file) => file.path)).toEqual([])
  })

  it('describes every key in both languages, once', () => {
    expect(new Set(STORAGE_KEYS.map((e) => `${e.area}:${e.key}`)).size).toBe(STORAGE_KEYS.length)
    for (const entry of STORAGE_KEYS) {
      expect(entry.key.startsWith(NAMESPACE), entry.key).toBe(true)
      expect(entry.purpose.en.trim(), entry.key).toBeTruthy()
      expect(entry.purpose.fr.trim(), entry.key).toBeTruthy()
      expect(STORAGE_GROUPS.map((g) => g.id)).toContain(entry.group)
    }
  })

  it('keeps the secrets in sessionStorage, where closing the tab forgets them', () => {
    const secrets = STORAGE_KEYS.filter((e) => e.secret)
    expect(secrets.map((e) => e.key).sort()).toEqual(['couvbat:room:', 'couvbat:sudo'])
    for (const entry of secrets) expect(entry.area).toBe('session')
  })

  // The copy names a cache and an expiry; the config is what decides both.
  it('names the cache and the expiry vite.config.ts configures', () => {
    const config = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(config).toContain("cacheName: 'async-chunks'")
    expect(config).toContain('maxAgeSeconds: 60 * 60 * 24 * 30')
    expect(cachePurpose('async-chunks')).toBeDefined()
    expect(cachePurpose('workbox-precache-v2-https://jhemery.xyz/')).toBeDefined()
    expect(cachePurpose('something-else')).toBeUndefined()
  })
})

describe('reading what is stored', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('lists the namespace in both storages, in the list’s order, with UTF-8 sizes', () => {
    localStorage.setItem('couvbat:history', '["ls"]')
    localStorage.setItem('couvbat:locale', 'fr')
    sessionStorage.setItem('couvbat:room:AB3DE', 'tok')
    localStorage.setItem('couvbat:games:snake', '12')
    localStorage.setItem('couvbat:aliases', '{"é":"ls"}')

    const items = storedItems()
    expect(items.map((i) => i.key)).toEqual(['couvbat:locale', 'couvbat:games:snake', 'couvbat:history', 'couvbat:aliases', 'couvbat:room:AB3DE'])
    // Ten characters, eleven bytes: the é is two.
    expect(items.find((i) => i.key === 'couvbat:aliases')!.bytes).toBe(11)
    expect(items.at(-1)).toMatchObject({ area: 'session', entry: { key: 'couvbat:room:', secret: true } })
  })

  it('leaves keys outside the namespace alone, and calls an unlisted one stale', () => {
    localStorage.setItem('umami.disabled', '1')
    localStorage.setItem('couvbat:old-thing', 'x')
    const items = storedItems()
    expect(items.map((i) => i.key)).toEqual(['couvbat:old-thing'])
    expect(groupOf(items[0]!)).toBe('stale')
  })

  it('matches a prefix row only with something after the prefix', () => {
    expect(entryFor('couvbat:room:AB3DE', 'session')?.key).toBe('couvbat:room:')
    expect(entryFor('couvbat:room:', 'session')).toBeUndefined()
    // Areas are distinct: the same name in the other one is not the listed key.
    expect(entryFor('couvbat:sudo', 'local')).toBeUndefined()
    expect(shortName('couvbat:history:base')).toBe('history:base')
  })

  it('removes exactly what it is given', () => {
    localStorage.setItem('couvbat:games:snake', '12')
    localStorage.setItem('couvbat:locale', 'fr')
    const removed = removeItems(storedItems().filter((i) => groupOf(i) === 'scores'))
    expect(removed.map((i) => i.key)).toEqual(['couvbat:games:snake'])
    expect(localStorage.getItem('couvbat:games:snake')).toBeNull()
    expect(localStorage.getItem('couvbat:locale')).toBe('fr')
  })

  it('reads nothing, and throws nothing, when storage itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    sessionStorage.setItem('couvbat:sudo', 'pw')
    expect(storedItems().map((i) => i.key)).toEqual(['couvbat:sudo'])
  })
})

describe('the caches', () => {
  afterEach(() => vi.unstubAllGlobals())

  // jsdom has neither Cache Storage nor `navigator.storage`.
  it('degrades to nothing where the browser offers neither', async () => {
    expect(await cacheReport()).toEqual({ caches: null, usage: null })
  })

  it('counts each cache’s files and bytes, and takes the browser’s estimate', async () => {
    const bodies: Record<string, string[]> = { 'async-chunks': ['abc', 'defgh'], 'workbox-precache-v2-x': ['1'] }
    vi.stubGlobal('caches', {
      keys: async () => Object.keys(bodies),
      open: async (name: string) => ({ matchAll: async () => bodies[name]!.map((body) => new Response(body)) }),
    })
    vi.stubGlobal('navigator', { ...navigator, storage: { estimate: async () => ({ usage: 2048, quota: 1e9 }) } })
    expect(await cacheReport()).toEqual({
      caches: [
        { name: 'async-chunks', files: 2, bytes: 8 },
        { name: 'workbox-precache-v2-x', files: 1, bytes: 1 },
      ],
      usage: 2048,
    })
  })
})
