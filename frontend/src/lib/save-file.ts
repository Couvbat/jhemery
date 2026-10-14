import { fromBase64Url, toBase64Url } from './base64url'
import { SAVE_MARKER } from './save-link'
import { byteLength, entryFor, storedItems, writeItems, type StorageGroup, type StoredItem } from './storage-keys'

/**
 * A save file: what the site keeps in one browser, carried to another without an account
 * (roadmap §J, *Save file*). `/privacy` writes the visitor's chosen groups into a code, and
 * offers it as a link and a QR of the link. The code rides in the fragment
 * (`/privacy#save=…`), which a browser never sends, so the server and its logs never see
 * it. Opening the link fills the restore box and shows what it would write, and nothing is
 * written until the visitor says so.
 *
 * A code is `base64url(version · format · payload)`. The payload is one JSON object of
 * key to value, deflated where the browser can (`CompressionStream`) and stored as it is
 * otherwise, which the format byte says.
 *
 * A code is input from anyone who sends a link, so reading one trusts nothing in it: only
 * keys on `STORAGE_KEYS` that live in `localStorage` and aren't secret are taken, only string
 * values, and only up to the sizes below. Every owner already reads its key defensively,
 * since a visitor can type anything into devtools, so a strange value reads as empty rather
 * than breaking the page.
 */

export const SAVE_VERSION = 1

const RAW = 0
const DEFLATED = 1

/** What a save can carry. Never the secrets: a password or a room's host token would let whoever holds the link act as the visitor. */
export const PORTABLE_GROUPS = ['settings', 'progress', 'scores', 'shell'] as const satisfies readonly StorageGroup[]
export type PortableGroup = (typeof PORTABLE_GROUPS)[number]

/** The biggest value the site writes is the history, at a few kB; this is far past it. */
export const MAX_VALUE_BYTES = 64 * 1024
/** The whole save, unpacked, so a small deflated code can't unpack into megabytes. */
export const MAX_SAVE_BYTES = 256 * 1024

export interface SavedItem {
  key: string
  value: string
}

/** Whether a key may travel in a save: on the list, in `localStorage`, and not a secret. */
export function isPortable(key: string): boolean {
  const entry = entryFor(key, 'local')
  return !!entry && !entry.secret && (PORTABLE_GROUPS as readonly string[]).includes(entry.group)
}

/** What is stored now in `groups`, as a save would carry it. */
export function portableItems(groups: readonly PortableGroup[], items: readonly StoredItem[] = storedItems()): StoredItem[] {
  return items.filter((item) => item.area === 'local' && !!item.entry && isPortable(item.key) && (groups as readonly string[]).includes(item.entry.group))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes))
      controller.close()
    },
  })
  const reader = source.pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    // Stopped as soon as it is too big, rather than unpacked whole first.
    if (total > limit) {
      await reader.cancel()
      throw new RangeError('too large')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const canDeflate = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function'

export async function encodeSave(items: readonly SavedItem[]): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(Object.fromEntries(items.map((item) => [item.key, item.value]))))
  const deflate = canDeflate()
  const payload = deflate ? await pipe(json, new CompressionStream('deflate-raw')) : json
  const bytes = new Uint8Array(payload.length + 2)
  bytes[0] = SAVE_VERSION
  bytes[1] = deflate ? DEFLATED : RAW
  bytes.set(payload, 2)
  return toBase64Url(bytes)
}

export type SaveRead =
  | { ok: true; items: SavedItem[]; dropped: string[] }
  | { ok: false; reason: 'malformed' | 'version' | 'unsupported' | 'too-large' }

/** A code, or a link holding one, read back; `dropped` names the keys it carried that a save may not. */
export async function decodeSave(input: string): Promise<SaveRead> {
  const bytes = fromBase64Url(codeFrom(input))
  if (!bytes || bytes.length < 2) return { ok: false, reason: 'malformed' }
  if (bytes[0] !== SAVE_VERSION) return { ok: false, reason: 'version' }

  let json: Uint8Array
  if (bytes[1] === RAW) {
    json = bytes.subarray(2)
    if (json.length > MAX_SAVE_BYTES) return { ok: false, reason: 'too-large' }
  } else if (bytes[1] === DEFLATED) {
    if (!canDeflate()) return { ok: false, reason: 'unsupported' }
    try {
      json = await pipe(bytes.subarray(2), new DecompressionStream('deflate-raw'), MAX_SAVE_BYTES)
    } catch (error) {
      return { ok: false, reason: error instanceof RangeError ? 'too-large' : 'malformed' }
    }
  } else return { ok: false, reason: 'malformed' }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'malformed' }

  const items: SavedItem[] = []
  const dropped: string[] = []
  for (const [key, value] of Object.entries(parsed)) {
    if (isPortable(key) && typeof value === 'string' && byteLength(value) <= MAX_VALUE_BYTES) items.push({ key, value })
    else dropped.push(key)
  }
  return { ok: true, items, dropped }
}

/** The code out of whatever was pasted: the bare code, or a link with `#save=` in it. */
export function codeFrom(input: string): string {
  const trimmed = input.trim()
  const marker = trimmed.indexOf(SAVE_MARKER)
  return marker === -1 ? trimmed : trimmed.slice(marker + SAVE_MARKER.length)
}

export function saveLink(origin: string, code: string): string {
  return `${origin}/privacy${SAVE_MARKER}${code}`
}

/** Writes each item through the storage list, and returns the keys that took. */
export function writeSave(items: readonly SavedItem[]): string[] {
  return writeItems(items.filter((item) => isPortable(item.key)))
}
