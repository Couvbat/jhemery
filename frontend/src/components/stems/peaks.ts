import type { Locale } from '@/content/types'
import type { StemTrack } from '@/content/stems'

/**
 * The mixer's picture of a track before any audio loads
 * (`docs/superpowers/specs/2026-10-15-stems-vol2-design.md` §2–3): the waveform lanes from
 * `public/stems/<id>/peaks.json`, and the arithmetic of the playhead and the transport.
 * Pure, so the specs read it without a canvas or Web Audio.
 */

export interface Peaks {
  points: number
  /** Per stem id, one byte per bucket, already normalised across the track. */
  stems: Record<string, Uint8Array>
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/**
 * A `peaks.json` for this track, or null for one that isn't: a version this code doesn't
 * know, a stem missing, or a lane of the wrong length. A missing picture is a lane left
 * blank, never a broken mixer.
 */
export function decodePeaks(value: unknown, track: { stems: ReadonlyArray<{ id: string }> }): Peaks | null {
  const file = value as { v?: unknown; points?: unknown; stems?: Record<string, unknown> } | null
  if (!file || file.v !== 1 || typeof file.points !== 'number' || !Number.isInteger(file.points) || file.points < 1) return null
  if (!file.stems || typeof file.stems !== 'object') return null
  const stems: Record<string, Uint8Array> = {}
  for (const stem of track.stems) {
    const encoded = file.stems[stem.id]
    if (typeof encoded !== 'string') return null
    let bytes: Uint8Array
    try {
      bytes = fromBase64(encoded)
    } catch {
      return null
    }
    if (bytes.length !== file.points) return null
    stems[stem.id] = bytes
  }
  return { points: file.points, stems }
}

/**
 * One bar per pixel column across a lane `width` wide: the loudest bucket that column
 * covers, as a height in pixels, centred on the lane's middle by the caller.
 */
export function laneBars(lane: Uint8Array, width: number, height: number): number[] {
  const columns = Math.max(0, Math.floor(width))
  const bars: number[] = []
  for (let x = 0; x < columns; x += 1) {
    const from = Math.floor((x * lane.length) / columns)
    const to = Math.max(from + 1, Math.floor(((x + 1) * lane.length) / columns))
    let peak = 0
    for (let i = from; i < to && i < lane.length; i += 1) peak = Math.max(peak, lane[i]!)
    // Never quite flat, so a silent stretch still reads as part of the lane.
    bars.push(Math.max(1, (peak / 255) * height))
  }
  return bars
}

/** Where a click or a drag at `clientX` lands in a lane, as a fraction of the excerpt. */
export function seekFraction(clientX: number, rect: { left: number; width: number }): number {
  if (rect.width <= 0) return 0
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

/** The transport's step: one bar when the track has a tempo, one second when it hasn't. */
export function transportStep(track: Pick<StemTrack, 'bpm' | 'beatsPerBar'>): number {
  return track.bpm ? ((track.beatsPerBar ?? 4) * 60) / track.bpm : 1
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** What the transport says to a screen reader: `0:12 of 0:32`. */
export function positionText(seconds: number, length: number, locale: Locale): string {
  return `${clock(seconds)} ${locale === 'fr' ? 'sur' : 'of'} ${clock(length)}`
}

/** The mixer's header: `Night Shift · 165 BPM · F minor · FL Studio`. */
export function linerLine(track: Pick<StemTrack, 'title' | 'bpm' | 'key' | 'daw'>): string {
  return [track.title, ...(track.bpm ? [`${track.bpm} BPM`] : []), ...(track.key ? [track.key] : []), ...(track.daw ? [track.daw] : [])].join(' · ')
}

/** A stem's chain, as its disclosure reads it: `Serum 2 → OTT → Valhalla Room`. */
export function chainLine(chain: readonly string[]): string {
  return chain.join(' → ')
}

/**
 * How often the playhead moves: it is information, not decoration, but it moves, so it
 * follows the motion level. Null is every frame.
 */
export function playheadInterval(motion: 'full' | 'calm' | 'paused'): number | null {
  return motion === 'full' ? null : motion === 'calm' ? 100 : 1_000
}
