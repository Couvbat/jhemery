import type { Localised } from './types'

/**
 * Tracks of Jules's, split into stems a visitor can remix in the music section (roadmap
 * §J, *Stems*). The mixer (`components/stems/`) shows only while this list has a track, so
 * it ships empty and nothing appears until there are stems to put in it. Imported as
 * `@/content/stems` rather than through the barrel, and kept to data: the music section
 * reads it on the home page, and everything the mixer computes from it is in the mixer's
 * own chunk.
 *
 * `npm run stems -- <folder>` (`scripts/stems.mjs`) makes a track from a folder of DAW
 * exports: it cuts and encodes the stems, writes the waveforms' `peaks.json` beside them,
 * and prints the entry to paste here.
 *
 * Each stem is a file under `public/stems/<track id>/`, all of one track the same length,
 * and the excerpt is what loops: a mixer holds every stem decoded at once, so a whole
 * track would cost a phone hundreds of megabytes (see `DECODED_BYTES_PER_SECOND`). AAC
 * (`.m4a`) or MP3, which every browser's `decodeAudioData` reads; Opus is smaller, but
 * older Safari can't decode it.
 */
export interface Stem {
  /** Lower-case words. A mix code doesn't name it: it counts on the order below. */
  id: string
  name: Localised
  /** Its path under `public/stems/`: `night-shift/drums.m4a`. */
  file: string
  /** The file's size in bytes, which the load button announces. A spec holds it to the file. */
  bytes: number
  /** Its plugins, in order: `['Serum 2', 'OTT', 'Valhalla Room']`. Facts, so plain strings. */
  chain?: string[]
}

export interface StemTrack {
  /** Lower-case words: the folder under `public/stems/`, and the head of a mix code. */
  id: string
  title: string
  /** The excerpt's length in seconds, which is also exactly what loops. */
  seconds: number
  /**
   * The liner notes, all facts (plain strings) and all optional, so a track costs the home
   * page bytes only for what it fills in. The transport steps a bar at a time with `bpm`.
   */
  bpm?: number
  /** Four unless said otherwise. */
  beatsPerBar?: number
  key?: string
  daw?: string
  /** An ISO date. */
  released?: string
  note?: Localised
  /** The whole track, where it is published. */
  url?: string
  stems: Stem[]
}

export const stemTracks: readonly StemTrack[] = []

/** What a mix code has room for, and more than a mixer row per stem fits on a phone. */
export const MAX_STEMS = 8

/** Decoded audio is a 32-bit float per sample per channel: at 48 kHz in stereo, 384 kB a second, for each stem. */
export const DECODED_BYTES_PER_SECOND = 48_000 * 2 * 4

/** What a track may cost once decoded, all its stems together: about what a phone tab can spare. */
export const MAX_DECODED_BYTES = 160 * 1024 * 1024
