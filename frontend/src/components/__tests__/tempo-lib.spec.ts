import { describe, expect, it } from 'vitest'
import { ANALYSIS_RATE, detectTempo, parseRange, soundcloudPath, writeTempos } from '../../../scripts/tempo-lib.mjs'

/**
 * `npm run tempos`'s detector (`scripts/tempo-lib.mjs`), on synthetic tracks of known tempo
 * and first beat: a kick on every beat, its pitch falling to 50 Hz within a few tens of
 * milliseconds as a real one's does, and, as the genre has them, a saw bass and a burst of
 * hats on every offbeat, which line a grid up as well as the kick does.
 * The page follows the widget's position against what this finds, so a hundredth of a BPM
 * and a few milliseconds are the bar.
 */

interface Synthetic {
  bpm: number
  firstBeatMs: number
  seconds?: number
  offbeat?: boolean
}

function track({ bpm, firstBeatMs, seconds = 30, offbeat = true }: Synthetic): Float32Array {
  const rate = ANALYSIS_RATE
  const out = new Float32Array(Math.round(seconds * rate))
  let seed = 1
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  const period = 60 / bpm
  const add = (start: number, sound: (x: number) => number, length: number) => {
    const from = Math.round(start * rate)
    for (let i = 0; i < length * rate && from + i < out.length; i += 1) out[from + i]! += sound(i / rate)
  }
  for (let t = firstBeatMs / 1000; t < seconds; t += period) {
    add(t, (x) => Math.sin(2 * Math.PI * (50 * x + (150 / 60) * (1 - Math.exp(-60 * x)))) * Math.exp(-x / 0.15), 0.3)
    if (offbeat) {
      add(t + period / 2, (x) => (((x * 85) % 1) * 2 - 1) * 0.5, 0.12)
      add(t + period / 2, () => noise() * 0.3, 0.03)
    }
  }
  for (let i = 0; i < out.length; i += 1) out[i]! += noise() * 0.02
  return out
}

describe('detecting a tempo', () => {
  it.each<Synthetic>([
    { bpm: 172, firstBeatMs: 500 },
    { bpm: 140, firstBeatMs: 0 },
    { bpm: 200, firstBeatMs: 1234 },
    { bpm: 165, firstBeatMs: 80, offbeat: false },
  ])('finds $bpm BPM and the first beat at $firstBeatMs ms', (synthetic) => {
    const found = detectTempo(track(synthetic))!
    expect(found.bpm).toBe(synthetic.bpm)
    expect(Math.abs(found.firstBeatMs - synthetic.firstBeatMs)).toBeLessThanOrEqual(10)
    expect(found.confidence).toBeGreaterThan(2)
  })

  it('keeps a tempo that isn’t a whole BPM, to the hundredth', () => {
    // A hundredth off drifts 19 ms over four minutes at 128.5: the bar this is held to.
    expect(Math.abs(detectTempo(track({ bpm: 128.5, firstBeatMs: 250 }))!.bpm - 128.5)).toBeLessThanOrEqual(0.015)
  })

  // The offbeat bass lines a grid up as well as the kick: it is the kick's band that
  // tells which of the two is the beat.
  it('puts the beat on the kick, not on the offbeat bass, and offers the offbeat besides', () => {
    const found = detectTempo(track({ bpm: 150, firstBeatMs: 300 }))!
    expect(Math.abs(found.firstBeatMs - 300)).toBeLessThanOrEqual(10)
    // Half a beat (200 ms at 150) after it, for a track whose bass took the beat.
    expect(Math.abs(found.offbeatMs - 500)).toBeLessThanOrEqual(10)
  })

  it('looks in one octave, so a tempo can’t read as its half or double', () => {
    // 100 BPM is out of the default range: it reads as its double, unless told where to look.
    expect(detectTempo(track({ bpm: 100, firstBeatMs: 0, offbeat: false }))!.bpm).toBe(200)
    expect(detectTempo(track({ bpm: 100, firstBeatMs: 0, offbeat: false }), [70, 140])!.bpm).toBe(100)
  })

  it('finds nothing in silence', () => {
    expect(detectTempo(new Float32Array(ANALYSIS_RATE * 5))).toBeNull()
  })
})

describe('the script’s arguments and output', () => {
  it('takes a range an octave wide at most', () => {
    expect(parseRange('110-220')).toEqual([110, 220])
    expect(parseRange('70-140')).toEqual([70, 140])
    expect(parseRange('100-300')).toBeNull()
    expect(parseRange('220-110')).toBeNull()
    expect(parseRange('fast')).toBeNull()
  })

  it('reads a track’s path on soundcloud.com, and not a set’s', () => {
    expect(soundcloudPath('https://soundcloud.com/couvbat/cultist')).toBe('/couvbat/cultist')
    expect(soundcloudPath('https://soundcloud.com/couvbat/sets/mon-bruit')).toBeNull()
    expect(soundcloudPath('https://evil.example/couvbat/cultist')).toBeNull()
  })

  const EMPTY = "import x\n\nexport const tempos: Readonly<Record<string, Tempo>> = {}\n\n/** after */\n"

  it('writes the entries into `tempos`, sorted, leaving the rest of the file alone', () => {
    const once = writeTempos(EMPTY, { '/couvbat/cultist': { bpm: 172, firstBeatMs: 23 }, '/couvbat/alien-radio': { bpm: 165.5, firstBeatMs: 0 } })
    expect(once).toBe(
      "import x\n\nexport const tempos: Readonly<Record<string, Tempo>> = {\n  '/couvbat/alien-radio': { bpm: 165.5, firstBeatMs: 0 },\n  '/couvbat/cultist': { bpm: 172, firstBeatMs: 23 },\n}\n\n/** after */\n",
    )
    // Merged with what is there: a second run updates one and keeps the other.
    const twice = writeTempos(once, { '/couvbat/cultist': { bpm: 174, firstBeatMs: 10 } })
    expect(twice).toContain("'/couvbat/cultist': { bpm: 174, firstBeatMs: 10 }")
    expect(twice).toContain("'/couvbat/alien-radio': { bpm: 165.5, firstBeatMs: 0 }")
  })

  it('keeps a Windows checkout’s line endings, and refuses a file without the declaration', () => {
    const crlf = EMPTY.replace(/\n/g, '\r\n')
    expect(writeTempos(crlf, { '/couvbat/x': { bpm: 150, firstBeatMs: 0 } })).toContain("= {\r\n  '/couvbat/x': { bpm: 150, firstBeatMs: 0 },\r\n}\r\n")
    expect(() => writeTempos('export const music = {}\n', {})).toThrow(/no `export const tempos`/)
  })
})
