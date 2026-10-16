/**
 * What music is playing on the site, for the background to follow
 * (`docs/superpowers/specs/2026-10-15-music-reactive-field-design.md`): the `acid` synth,
 * the stems mixer and SoundCloud each attach while they sound, and `ThreeBackground` reads
 * `currentMusic()` at draw time, as it reads colours. Not reactive, so nothing re-renders
 * and nothing allocates per frame; imported only by lazy chunks, so the home page's eager
 * chunk doesn't grow.
 */

export interface MusicSource {
  id: 'acid' | 'stems' | 'soundcloud'
  /** Beats since the grid's first downbeat, fractional, by the source's own clock; null without a tempo. */
  beats: () => number | null
  bpm: number | null
  /** Four unless the source says otherwise: which beat is a bar's downbeat. */
  beatsPerBar?: number
  /** Fills a buffer the caller owns with 0–255 frequency bins; absent when the source can't be heard. */
  spectrum?: (into: Uint8Array<ArrayBuffer>) => void
  /**
   * For a source that can't be heard but whose loudness is known: the level now, 0–1, which
   * stands for the low band too. SoundCloud's, read off the track's waveform; null until the
   * waveform and the position are both in.
   */
  level?: () => number | null
}

/** Attached sources, oldest first: the last is the one the field follows. */
const attached: MusicSource[] = []

/**
 * Attaches a source and returns its detach. The source started last is the one the field
 * follows; detaching it falls back to the one before, if that is still attached.
 */
export function attachMusic(source: MusicSource): () => void {
  const at = attached.indexOf(source)
  if (at !== -1) attached.splice(at, 1)
  attached.push(source)
  let detached = false
  return () => {
    if (detached) return
    detached = true
    const index = attached.indexOf(source)
    if (index !== -1) attached.splice(index, 1)
  }
}

export function currentMusic(): MusicSource | null {
  return attached.at(-1) ?? null
}
