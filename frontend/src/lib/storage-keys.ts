import type { Localised } from '@/content/types'

/**
 * Every key the site keeps in a visitor's browser, in one list. Each module still declares
 * its own key where it reads it (`useTheme`, `history.ts`, `scores.ts`…), and nothing made
 * those declarations add up to a disclosure. This list does, and `storage-keys.spec.ts`
 * reads the source for every `couvbat:` literal, template and table entry, so a new key
 * can't ship without a row here, nor a row outlive its key.
 *
 * `du` and `rm` in the terminal and the `/privacy` page all read this one list, so the two
 * surfaces can't describe the same key two ways.
 */

export type StorageArea = 'local' | 'session'

/** What `rm <group>` and a button on `/privacy` clear together. */
export type StorageGroup = 'settings' | 'progress' | 'scores' | 'shell' | 'secrets'

export interface StorageKey {
  /** The key, or for a `prefix` entry what every key of its kind starts with. */
  key: string
  /** One entry for a family of keys built at run time: a room's token is keyed by its code. */
  prefix?: boolean
  area: StorageArea
  group: StorageGroup
  purpose: Localised
  /** The module that reads and writes it, from `src/`. The spec holds it to the truth. */
  owner: string
  /**
   * Never printed, only its length: a password or a host token. Screens get shared and
   * screenshotted, and these two would let someone else act as the visitor.
   */
  secret?: boolean
}

/** Every key the site writes starts with this; a stored key that does and isn't listed is stale. */
export const NAMESPACE = 'couvbat:'

export const STORAGE_GROUPS: { id: StorageGroup; label: Localised }[] = [
  { id: 'settings', label: { en: 'settings', fr: 'réglages' } },
  { id: 'progress', label: { en: 'progress', fr: 'progression' } },
  { id: 'scores', label: { en: 'best scores', fr: 'meilleurs scores' } },
  { id: 'shell', label: { en: 'shell', fr: 'shell' } },
  { id: 'secrets', label: { en: 'secrets', fr: 'secrets' } },
]

/**
 * A key under the namespace that nothing on the list owns: an older version of the site left
 * it. A noun, like the other labels, because it is read after `clear` on the page's button
 * as well as on its own as a heading.
 */
export const STALE_LABEL: Localised = { en: 'leftovers from an older version', fr: 'restes d’une version précédente' }
export const STALE_PURPOSE: Localised = {
  en: 'no longer read by anything; `rm -rf ~` clears it',
  fr: 'plus rien ne la lit ; `rm -rf ~` l’efface',
}

const SCORES = 'terminal/games/scores.ts'

function best(game: string, purpose: Localised = { en: `your best score at ${game}`, fr: `votre meilleur score à ${game}` }): StorageKey {
  return { key: `${NAMESPACE}games:${game}`, area: 'local', group: 'scores', purpose, owner: SCORES }
}

export const STORAGE_KEYS: StorageKey[] = [
  {
    key: 'couvbat:locale',
    area: 'local',
    group: 'settings',
    purpose: { en: 'the language you picked', fr: 'la langue choisie' },
    owner: 'i18n/index.ts',
  },
  {
    key: 'couvbat:theme',
    area: 'local',
    group: 'settings',
    purpose: { en: 'the colour scheme you picked', fr: 'le jeu de couleurs choisi' },
    owner: 'composables/useTheme.ts',
  },
  {
    key: 'couvbat:theme:custom',
    area: 'local',
    group: 'settings',
    purpose: { en: 'the scheme you forged, as its colours', fr: 'le jeu forgé, sous forme de ses couleurs' },
    owner: 'composables/useTheme.ts',
  },
  {
    key: 'couvbat:motion',
    area: 'local',
    group: 'settings',
    purpose: { en: 'how much the page moves, when not everything', fr: 'combien la page bouge, quand pas tout' },
    owner: 'composables/useMotion.ts',
  },
  {
    key: 'couvbat:crt',
    area: 'local',
    group: 'settings',
    purpose: { en: 'whether CRT overdrive is on', fr: 'si l’overdrive CRT est activé' },
    owner: 'composables/useCrt.ts',
  },
  {
    key: 'couvbat:booted',
    area: 'local',
    group: 'settings',
    purpose: { en: 'the boot log has played once, so it doesn’t again', fr: 'le journal de démarrage a déjà défilé, et ne défile plus' },
    owner: 'components/BootSequence.vue',
  },
  {
    key: 'couvbat:achievements',
    area: 'local',
    group: 'progress',
    purpose: { en: 'the achievements you unlocked', fr: 'les succès débloqués' },
    owner: 'terminal/achievements.ts',
  },
  {
    key: 'couvbat:achievements:sections',
    area: 'local',
    group: 'progress',
    purpose: { en: 'the sections you visited, towards an achievement', fr: 'les sections visitées, pour un succès' },
    owner: 'terminal/achievements.ts',
  },
  {
    key: 'couvbat:achievements:themes',
    area: 'local',
    group: 'progress',
    purpose: { en: 'the colour schemes you tried, towards an achievement', fr: 'les jeux de couleurs essayés, pour un succès' },
    owner: 'terminal/achievements.ts',
  },
  {
    key: 'couvbat:ctf',
    area: 'local',
    group: 'progress',
    purpose: { en: 'the flags you captured', fr: 'les flags capturés' },
    owner: 'terminal/ctf.ts',
  },
  best('2048'),
  best('snake'),
  best('minesweeper', { en: 'your fastest minesweeper clear', fr: 'votre déminage le plus rapide' }),
  best('tetris'),
  best('wordle'),
  best('hangman'),
  best('wpm', { en: 'your best typing speed', fr: 'votre meilleure vitesse de frappe' }),
  best('connect4', { en: 'your most connect4 wins in one sitting', fr: 'votre record de victoires à connect4 en une séance' }),
  {
    key: 'couvbat:games:wordle:daily',
    area: 'local',
    group: 'scores',
    purpose: { en: 'today’s wordle board, so it is played once', fr: 'la grille wordle du jour, pour qu’elle ne se joue qu’une fois' },
    owner: SCORES,
  },
  {
    key: 'couvbat:history',
    area: 'local',
    group: 'shell',
    purpose: { en: 'the last 100 lines you typed, for ↑ and `history`', fr: 'les 100 dernières lignes tapées, pour ↑ et `history`' },
    owner: 'terminal/history.ts',
  },
  {
    key: 'couvbat:history:base',
    area: 'local',
    group: 'shell',
    purpose: { en: 'how many old lines dropped off, so `!N` keeps its numbers', fr: 'combien de vieilles lignes sont tombées, pour que `!N` garde ses numéros' },
    owner: 'terminal/history.ts',
  },
  {
    key: 'couvbat:aliases',
    area: 'local',
    group: 'shell',
    purpose: { en: 'the aliases you defined', fr: 'les alias définis' },
    owner: 'terminal/aliases.ts',
  },
  {
    key: 'couvbat:sudo',
    area: 'session',
    group: 'secrets',
    purpose: { en: 'the owner’s password, after `sudo -i`, until the tab closes', fr: 'le mot de passe du propriétaire, après `sudo -i`, jusqu’à la fermeture de l’onglet' },
    owner: 'lib/admin.ts',
    secret: true,
  },
  {
    key: 'couvbat:room:',
    prefix: true,
    area: 'session',
    group: 'secrets',
    purpose: { en: 'the host token of a room you opened, until the tab closes', fr: 'le jeton d’hôte d’un salon ouvert, jusqu’à la fermeture de l’onglet' },
    owner: 'rooms/useRoom.ts',
    secret: true,
  },
]

/** `couvbat:history` → `history`: what `rm` and `du` accept, and how the page labels a row. */
export function shortName(key: string): string {
  return key.startsWith(NAMESPACE) ? key.slice(NAMESPACE.length) : key
}

/** The entry `key` falls under in `area`: its own row, or the prefix row it starts with. */
export function entryFor(key: string, area: StorageArea): StorageKey | undefined {
  return STORAGE_KEYS.find((entry) => entry.area === area && (entry.prefix ? key.startsWith(entry.key) && key.length > entry.key.length : key === entry.key))
}

export interface StoredItem {
  key: string
  area: StorageArea
  value: string
  /** The value's size in UTF-8, which is what a visitor would call its size. */
  bytes: number
  /** Undefined for a stale key. */
  entry: StorageKey | undefined
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

/**
 * Either storage, or null where reading it throws: Safari's private mode and a browser
 * blocking site data throw on the getter itself, as `i18n/index.ts` found out.
 */
function storageFor(area: StorageArea): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function namespaced(store: Storage): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key?.startsWith(NAMESPACE)) keys.push(key)
    }
  } catch {
    // Unreadable storage holds nothing worth listing.
  }
  return keys
}

/**
 * What is stored right now under the namespace, in both areas: the list's order first, then
 * any stale key. Nothing outside the namespace is touched. The site writes nothing there,
 * and a key a browser extension or the visitor put on this origin isn't the site's to
 * report or to clear.
 */
export function storedItems(): StoredItem[] {
  const items: StoredItem[] = []
  for (const area of ['local', 'session'] as const) {
    const store = storageFor(area)
    if (!store) continue
    for (const key of namespaced(store)) {
      let value: string | null = null
      try {
        value = store.getItem(key)
      } catch {
        // Read as absent.
      }
      if (value !== null) items.push({ key, area, value, bytes: byteLength(value), entry: entryFor(key, area) })
    }
  }
  const rank = (item: StoredItem) => (item.entry ? STORAGE_KEYS.indexOf(item.entry) : STORAGE_KEYS.length)
  return items.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key))
}

/** The group a stored item is cleared with; a stale key has none of its own. */
export function groupOf(item: StoredItem): StorageGroup | 'stale' {
  return item.entry?.group ?? 'stale'
}

const listeners = new Set<() => void>()
let unwrap: (() => void) | undefined
let queued = false

function changed(): void {
  if (queued) return
  queued = true
  queueMicrotask(() => {
    queued = false
    for (const listener of [...listeners]) listener()
  })
}

function wrapMutators(): () => void {
  const proto = Storage.prototype
  const { setItem, removeItem, clear } = proto
  proto.setItem = function (key: string, value: string) {
    setItem.call(this, key, value)
    changed()
  }
  proto.removeItem = function (key: string) {
    removeItem.call(this, key)
    changed()
  }
  proto.clear = function () {
    clear.call(this)
    changed()
  }
  window.addEventListener('storage', changed)
  return () => {
    Object.assign(proto, { setItem, removeItem, clear })
    window.removeEventListener('storage', changed)
  }
}

/**
 * Calls `onChange` after a write to either storage, from this tab or another, until the
 * returned function is called. Another tab's write fires `storage`, but nothing tells a page
 * about its own, and the owners on the list write their keys themselves, a dozen modules of
 * them. So for as long as anyone listens, the three mutators all of them go through are
 * wrapped, and put back after. The call waits a microtask: the several writes of one action
 * (a scheme, and the achievement it counts towards) make one call, after the last of them,
 * and never in the middle of the writer's own code.
 */
export function onStorageChange(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof Storage === 'undefined') return () => {}
  listeners.add(onChange)
  unwrap ??= wrapMutators()
  return () => {
    listeners.delete(onChange)
    if (listeners.size) return
    unwrap?.()
    unwrap = undefined
  }
}

/** Removes each item, and returns the ones that went. Never throws. */
export function removeItems(items: readonly StoredItem[]): StoredItem[] {
  return items.filter((item) => {
    const store = storageFor(item.area)
    if (!store) return false
    try {
      store.removeItem(item.key)
      return true
    } catch {
      return false
    }
  })
}

/**
 * Writes each value to the key it names, in `localStorage`, and returns the keys that took.
 * Only for keys on the list: a save file (`save-file.ts`) restores through this and has
 * already dropped anything else. Never throws: a full quota keeps what fitted.
 */
export function writeItems(items: readonly { key: string; value: string }[]): string[] {
  const store = storageFor('local')
  if (!store) return []
  return items
    .filter((item) => entryFor(item.key, 'local'))
    .flatMap(({ key, value }) => {
      try {
        store.setItem(key, value)
        return [key]
      } catch {
        return []
      }
    })
}

/** One Cache Storage cache, as `du` prints it. */
export interface CachedStore {
  name: string
  files: number
  bytes: number
}

export interface CacheReport {
  /** Null where the page has no Cache Storage (an insecure origin, jsdom). */
  caches: CachedStore[] | null
  /** `navigator.storage.estimate()`'s usage, null where there is none. */
  usage: number | null
}

/**
 * The service worker's caches: Workbox's precache (the app shell) and `async-chunks`, the
 * runtime cache `vite.config.ts` names for the chunks too big to precache. Both hold the
 * site's own public files, never anything about the visitor, so they are reported and not
 * cleared: clearing them would only cost a re-download.
 */
export function cachePurpose(name: string): Localised | undefined {
  if (name === 'async-chunks') {
    return { en: 'code split off the first load: three.js, the word lists, ffmpeg’s loader', fr: 'le code tenu hors du premier chargement : three.js, les listes de mots, le chargeur de ffmpeg' }
  }
  if (name.startsWith('workbox-precache')) return { en: 'the app itself, so it opens offline', fr: 'l’application elle-même, pour qu’elle s’ouvre hors ligne' }
  return undefined
}

/**
 * Workbox keeps the expiry for `async-chunks` (`maxAgeSeconds`, `maxEntries`) in IndexedDB,
 * as `workbox-expiration`: the one database the site has, written by the service worker.
 */
export const WORKBOX_NOTE: Localised = {
  en: 'The service worker also notes in IndexedDB when each chunk was last used, to expire it after 30 days.',
  fr: 'Le service worker note aussi dans IndexedDB quand chaque morceau a servi, pour l’expirer au bout de 30 jours.',
}

/**
 * The ffmpeg tool's core is fetched with a plain `fetch`, which neither the precache nor
 * the runtime rule matches, so it lives in the browser's HTTP cache under the immutable
 * `/assets/` header. `{size}` is `CORE_BYTES`, filled in by the caller.
 */
export const HTTP_CACHE_NOTE: Localised = {
  en: 'ffmpeg’s {size} core, once the audio & video converter has fetched it, sits in the HTTP cache: no page can list or clear that, only your browser’s own settings.',
  fr: 'Le cœur de ffmpeg ({size}), une fois chargé par le convertisseur audio & vidéo, est dans le cache HTTP : aucune page ne peut le lister ni l’effacer, seuls les réglages du navigateur le peuvent.',
}

/**
 * The embeds are other sites in frames, with their own storage under their own origin: the
 * music section's SoundCloud players, and the rooms' YouTube and SoundCloud. The site can't
 * read that storage, so the honest thing is to say it exists.
 */
export const EMBEDS_NOTE: Localised = {
  en: 'The SoundCloud players and the rooms’ YouTube videos are frames from those services, which keep their own storage under their own names. No page can see into it, so it isn’t listed here.',
  fr: 'Les lecteurs SoundCloud et les vidéos YouTube des salons sont des cadres de ces services, qui gardent leur propre stockage sous leur propre nom. Aucune page ne peut y regarder : il n’est pas listé ici.',
}

/**
 * Each cache's files and their size, read from the cached bodies, plus the browser's
 * estimate for the origin. Sizes mean reading every cached body (most responses carry no
 * Content-Length), a megabyte or two, which is why this runs only when `du` or `/privacy`
 * asks.
 */
export async function cacheReport(): Promise<CacheReport> {
  const [stores, estimate] = await Promise.all([listCaches(), estimateUsage()])
  return { caches: stores, usage: estimate }
}

async function listCaches(): Promise<CachedStore[] | null> {
  if (typeof caches === 'undefined') return null
  try {
    const names = await caches.keys()
    return await Promise.all(
      names.map(async (name) => {
        // All at once: one `match()` and `blob()` after another took six seconds over the
        // precache on a phone profile, against a quarter of a second like this.
        const responses = await (await caches.open(name)).matchAll()
        const sizes = await Promise.all(responses.map(async (response) => (await response.blob()).size))
        return { name, files: responses.length, bytes: sizes.reduce((sum, size) => sum + size, 0) }
      }),
    )
  } catch {
    return null
  }
}

async function estimateUsage(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    return (await navigator.storage.estimate()).usage ?? null
  } catch {
    return null
  }
}

/** Long enough to read what was cleared before the page goes. */
export const RELOAD_PAUSE_MS = 1500

/**
 * Reloads after a moment, and never settles. A clear has to end in a reload: achievements,
 * the locale and the theme are read once at load, and the history is written back whole
 * after every line, so a page that carried on would put back what was just removed. Never
 * settling is the point: the shell writes the line that ran `rm` into history once the
 * command returns, and this one doesn't, so nothing gets that chance.
 */
export function reloadPage(): Promise<never> {
  return new Promise(() => {
    setTimeout(() => window.location.reload(), RELOAD_PAUSE_MS)
  })
}
