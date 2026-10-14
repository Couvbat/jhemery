import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodedBytes, downloadBytes } from '@/components/stems/load'
import { DECODED_BYTES_PER_SECOND, MAX_DECODED_BYTES, MAX_STEMS, stemTracks, type StemTrack } from '../stems'

/**
 * The stems list against the files in `public/stems/`: every stem a file that exists, the
 * size the load button announces the file's real one, and every track small enough to
 * decode on a phone. Empty today, so the shape is checked on a fixture as well.
 */

const STEMS_DIR = join(process.cwd(), 'public/stems')

const FIXTURE: StemTrack = {
  id: 'night-shift',
  title: 'Night Shift',
  seconds: 60,
  stems: ['drums', 'bass', 'acid', 'pads'].map((id) => ({ id, name: { en: id, fr: id }, file: `night-shift/${id}.m4a`, bytes: 1_000_000 })),
}

/** What is wrong with a track, as sentences; empty when nothing is. */
function problems(track: StemTrack): string[] {
  const words = /^[a-z0-9]+(-[a-z0-9]+)*$/
  const found: string[] = []
  const check = (ok: boolean, problem: string) => void (ok || found.push(problem))
  check(words.test(track.id), `id ${track.id} isn't lower-case words`)
  check(!!track.title.trim(), 'no title')
  check(track.seconds > 0, 'no length')
  check(track.stems.length >= 2 && track.stems.length <= MAX_STEMS, `${track.stems.length} stems, not 2 to ${MAX_STEMS}`)
  check(new Set(track.stems.map((s) => s.id)).size === track.stems.length, 'a stem id twice')
  check(decodedBytes(track) <= MAX_DECODED_BYTES, 'decodes to more than a phone can spare')
  check(!track.url || track.url.startsWith('https://'), 'a url that isn’t https')
  check(!track.note || !!track.note.fr, 'a note with no French')
  // In the track's own folder, and in a format every browser decodes (Safari: no Opus).
  const file = new RegExp(`^${track.id}/[a-z0-9-]+\\.(m4a|mp3)$`)
  for (const stem of track.stems) {
    check(words.test(stem.id), `stem id ${stem.id} isn't lower-case words`)
    check(!!stem.name.en && !!stem.name.fr, `${stem.id} isn't named in both languages`)
    check(file.test(stem.file), `${stem.file} isn't an m4a or mp3 in ${track.id}/`)
  }
  return found
}

describe('the stems list', () => {
  it.each(stemTracks.map((track) => [track.id, track] as const))('%s is well formed', (_id, track) => {
    expect(problems(track)).toEqual([])
  })

  it.each(stemTracks.flatMap((track) => track.stems.map((stem) => [stem.file, stem] as const)))(
    '%s is in public/stems at the size it claims',
    (file, stem) => {
      const path = join(STEMS_DIR, file)
      expect(existsSync(path), path).toBe(true)
      expect(statSync(path).size).toBe(stem.bytes)
    },
  )

  it('names each track once', () => {
    expect(new Set(stemTracks.map((track) => track.id)).size).toBe(stemTracks.length)
  })

  it('holds a fixture to the same rules, and finds what is wrong with a bad one', () => {
    expect(problems(FIXTURE)).toEqual([])
    const bad = { ...FIXTURE, id: 'Night Shift', seconds: 3600, stems: [{ ...FIXTURE.stems[0]!, file: 'elsewhere/drums.opus' }] }
    expect(problems(bad)).toHaveLength(4)
  })

  it('counts what a track costs to download and to hold decoded', () => {
    expect(downloadBytes(FIXTURE)).toBe(4_000_000)
    // A minute of four stems at 48 kHz stereo float: about 92 MB.
    expect(decodedBytes(FIXTURE)).toBe(60 * DECODED_BYTES_PER_SECOND * 4)
    expect(decodedBytes({ seconds: 600, stems: FIXTURE.stems })).toBeGreaterThan(MAX_DECODED_BYTES)
  })
})
