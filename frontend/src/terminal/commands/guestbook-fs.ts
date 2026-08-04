import type { GuestbookEntry } from '@/lib/api'

/**
 * Maps the "filenames" shown by `guestbook` back to the entries they represent, so
 * `cat` and `sudo rm` can resolve a name typed by the visitor. Populated whenever
 * the `guestbook` command fetches the list — there is no other source of truth
 * on the client, entries are never persisted locally.
 */
const cache = new Map<string, GuestbookEntry>()

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'anon'
  )
}

export function filenameFor(entry: GuestbookEntry): string {
  return `${slugify(entry.name)}-${entry.id.slice(0, 6)}.txt`
}

export function cacheGuestbookEntries(entries: GuestbookEntry[]): void {
  cache.clear()
  for (const entry of entries) {
    cache.set(filenameFor(entry), entry)
  }
}

/** Whatever the last `guestbook` run cached — empty until then. */
export function guestbookFilenames(): string[] {
  return [...cache.keys()]
}

/** Accepts either a bare filename or one prefixed with `guestbook/`. */
export function resolveGuestbookFile(name: string): GuestbookEntry | undefined {
  const bare = name.replace(/^guestbook\//, '')
  return cache.get(bare)
}

export function forgetGuestbookFile(name: string): void {
  cache.delete(name.replace(/^guestbook\//, ''))
}
