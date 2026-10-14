import { MAX_STEMS, type StemTrack } from '@/content/stems'
import { fromBase64Url, toBase64Url } from '@/lib/base64url'

/**
 * The state of a stems mix, the gains it comes to, and the code that carries it in a link
 * (`/?mix=<code>#music`), as plain functions so they're tested without Web Audio. The
 * engine beside this file only ever applies what these compute.
 *
 * A code is `<track id>.<base64url bytes>`: the version, the stem count, a level byte and
 * a flags byte per stem (bit 0 mute, bit 1 solo), and the filter. The track is named in
 * the clear, so a link still means something when the list is reordered, and the count is
 * checked against the track's, so a code made before a stem was added is refused rather
 * than applied to the wrong rows.
 */

export const MIX_VERSION = 1

export interface StemState {
  /** The fader, 0 to 1. */
  level: number
  muted: boolean
  solo: boolean
}

export interface Mix {
  stems: StemState[]
  /** The low-pass over the whole mix, 0 (closed) to 1 (open). */
  cutoff: number
}

/** Where a fader starts: below the top, so there is room to push one stem up. */
export const DEFAULT_LEVEL = 0.8

export function defaultMix(count: number): Mix {
  return { stems: Array.from({ length: count }, () => ({ level: DEFAULT_LEVEL, muted: false, solo: false })), cutoff: 1 }
}

/**
 * What each stem is heard at. A muted stem is silent; while any stem is soloed, so is
 * every stem that isn't, and a muted solo stays muted, as on a desk. The fader is squared:
 * a linear one does all its audible work in its bottom fifth.
 */
export function gains(mix: Mix): number[] {
  const soloing = mix.stems.some((stem) => stem.solo)
  return mix.stems.map((stem) => (stem.muted || (soloing && !stem.solo) ? 0 : stem.level ** 2))
}

const MIN_HZ = 40
const MAX_HZ = 20_000

/** The filter's position as a frequency, on the exponential scale an ear hears as even. */
export function cutoffHz(cutoff: number): number {
  return MIN_HZ * (MAX_HZ / MIN_HZ) ** Math.min(1, Math.max(0, cutoff))
}

const byte = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255)

export function encodeMix(trackId: string, mix: Mix): string {
  const bytes = new Uint8Array(3 + mix.stems.length * 2)
  bytes[0] = MIX_VERSION
  bytes[1] = mix.stems.length
  mix.stems.forEach((stem, i) => {
    bytes[2 + i * 2] = byte(stem.level)
    bytes[3 + i * 2] = (stem.muted ? 1 : 0) | (stem.solo ? 2 : 0)
  })
  bytes[bytes.length - 1] = byte(mix.cutoff)
  return `${trackId}.${toBase64Url(bytes)}`
}

/** The track and the mix a code names, or null for anything that doesn't fit one of `tracks`. */
export function decodeMix(code: string, tracks: readonly StemTrack[]): { track: StemTrack; mix: Mix } | null {
  const dot = code.lastIndexOf('.')
  if (dot <= 0) return null
  const track = tracks.find((candidate) => candidate.id === code.slice(0, dot))
  const bytes = fromBase64Url(code.slice(dot + 1))
  if (!track || !bytes || bytes[0] !== MIX_VERSION) return null
  const count = bytes[1]!
  if (count !== track.stems.length || count > MAX_STEMS || bytes.length !== 3 + count * 2) return null
  const stems = Array.from({ length: count }, (_, i) => {
    const flags = bytes[3 + i * 2]!
    return { level: bytes[2 + i * 2]! / 255, muted: (flags & 1) === 1, solo: (flags & 2) === 2 }
  })
  return { track, mix: { stems, cutoff: bytes[bytes.length - 1]! / 255 } }
}
