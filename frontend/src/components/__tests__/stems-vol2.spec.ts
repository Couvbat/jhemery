import { describe, expect, it } from 'vitest'
import {
  barsIn,
  bucketPeaks,
  normalisePeaks,
  parseTime,
  peaksFile,
  probeProblems,
  trackLiteral,
  wholeBarWarning,
} from '../../../scripts/stems-lib.mjs'
import {
  chainLine,
  decodePeaks,
  laneBars,
  linerLine,
  playheadInterval,
  positionText,
  seekFraction,
  transportStep,
} from '../stems/peaks'

/**
 * Stems, vol. 2 (`docs/superpowers/specs/2026-10-15-stems-vol2-design.md`): the prep
 * script's pure parts, and the mixer's waveforms, transport and liner notes. The `ffmpeg`
 * calls aren't unit-tested; the engine's seek is in `stems.spec.ts`.
 */

const TRACK = { stems: [{ id: 'kick' }, { id: 'pad' }] }

describe('the prep script', () => {
  it('reads a start time the way a DAW writes one', () => {
    expect(parseTime('1:04.000')).toBe(64)
    expect(parseTime('0:02.5')).toBe(2.5)
    expect(parseTime(12)).toBe(12)
    expect(() => parseTime('one minute')).toThrow()
  })

  it('counts bars, and warns when the loop isn’t a whole number of them', () => {
    expect(barsIn(32, 165)).toBeCloseTo(22)
    expect(wholeBarWarning(32, 165)).toBeNull()
    expect(wholeBarWarning(8, 120)).toBeNull()
    expect(wholeBarWarning(9, 120)).toMatch(/^9 s is 4\.50 bars at 120 BPM: .* 5 bars is 10\.000 s\.$/)
    // Three to the bar when the json says so.
    expect(wholeBarWarning(6, 120, 3)).toBeNull()
    expect(wholeBarWarning(30, undefined)).toBeNull()
  })

  it('refuses stems that don’t fit together, naming each', () => {
    const probe = (file: string, sampleRate = 44_100, duration = 120) => ({ file, sampleRate, duration })
    expect(probeProblems([probe('kick.wav'), probe('pad.wav')], { maxStems: 8, start: 64, seconds: 32 })).toEqual([])
    const problems = probeProblems([probe('kick.wav', 48_000), probe('pad.wav', 44_100, 119.5)], { maxStems: 8, start: 100, seconds: 32 })
    expect(problems.map(([where]) => where)).toEqual(['kick.wav', 'pad.wav', 'kick.wav', 'pad.wav', 'excerpt'])
    expect(probeProblems(Array.from({ length: 9 }, (_, i) => probe(`s${i}.wav`)), { maxStems: 8 })).toEqual([
      ['stems', '9 found, at most 8 fit a mix code'],
    ])
  })

  it('buckets each stem’s peaks, then normalises across the track with a square root', () => {
    const loud = Float32Array.from([0.1, -1, 0.5, 0.2])
    const quiet = Float32Array.from([0.25, 0, 0, -0.04])
    expect([...bucketPeaks(loud, 2)]).toEqual([1, 0.5])
    const bytes = normalisePeaks({ kick: bucketPeaks(loud, 2), pad: bucketPeaks(quiet, 2) })
    // Per track: the kick's peak is 255; the pad's quarter is the root of a quarter, half.
    expect([...bytes.kick!]).toEqual([255, 180])
    expect([...bytes.pad!]).toEqual([128, 51])
    const file = peaksFile(bytes, 2)
    expect(file).toEqual({ v: 1, points: 2, stems: { kick: expect.any(String), pad: expect.any(String) } })
  })

  it('prints the literal to paste, bytes filled in, only the fields given', () => {
    const literal = trackLiteral(
      {
        id: 'night-shift',
        title: "Night's Shift",
        seconds: 32,
        bpm: 165,
        key: 'F minor',
        stems: [{ file: 'Kick.wav', id: 'kick', name: { en: 'Kick', fr: 'Kick' }, chain: ['DR910', 'Valhalla Room'] }],
      },
      { 'night-shift/kick.m4a': 412_345 },
    )
    expect(literal).toContain("title: 'Night\\'s Shift',")
    expect(literal).toContain('bpm: 165,')
    expect(literal).not.toContain('daw:')
    expect(literal).toContain(
      "{ id: 'kick', name: { en: 'Kick', fr: 'Kick' }, file: 'night-shift/kick.m4a', bytes: 412345, chain: ['DR910', 'Valhalla Room'] },",
    )
  })
})

describe('the waveform lanes', () => {
  const encode = (values: number[]) => btoa(String.fromCharCode(...values))

  it('reads a peaks file with one lane per stem, of the declared length', () => {
    const peaks = decodePeaks({ v: 1, points: 3, stems: { kick: encode([0, 128, 255]), pad: encode([1, 2, 3]) } }, TRACK)!
    expect(peaks.points).toBe(3)
    expect([...peaks.stems.kick!]).toEqual([0, 128, 255])
  })

  it('leaves a lane blank rather than draw a file it can’t trust', () => {
    const good = { v: 1, points: 3, stems: { kick: encode([0, 1, 2]), pad: encode([1, 2, 3]) } }
    expect(decodePeaks({ ...good, v: 2 }, TRACK)).toBeNull()
    expect(decodePeaks({ ...good, stems: { kick: good.stems.kick } }, TRACK)).toBeNull()
    expect(decodePeaks({ ...good, points: 4 }, TRACK)).toBeNull()
    expect(decodePeaks({ ...good, stems: { ...good.stems, pad: '%%%' } }, TRACK)).toBeNull()
    expect(decodePeaks(null, TRACK)).toBeNull()
  })

  it('draws a column per pixel from the loudest bucket it covers, never quite flat', () => {
    const lane = Uint8Array.from([0, 255, 51, 102])
    expect(laneBars(lane, 2, 10)).toEqual([10, 4])
    expect(laneBars(lane, 4, 10)).toEqual([1, 10, 2, 4])
    // Wider than the data: each bucket spans several columns.
    expect(laneBars(Uint8Array.from([255, 0]), 4, 10)).toEqual([10, 10, 1, 1])
  })

  it('seeks to where a lane is clicked, clamped to it', () => {
    const lane = { left: 100, width: 200 }
    expect(seekFraction(200, lane)).toBe(0.5)
    expect(seekFraction(50, lane)).toBe(0)
    expect(seekFraction(400, lane)).toBe(1)
  })
})

describe('the transport and the liner notes', () => {
  it('steps a bar with a tempo, a second without', () => {
    expect(transportStep({ bpm: 120 })).toBe(2)
    expect(transportStep({ bpm: 120, beatsPerBar: 3 })).toBe(1.5)
    expect(transportStep({})).toBe(1)
  })

  it('says where the playhead is, in both languages', () => {
    expect(positionText(12.7, 32, 'en')).toBe('0:12 of 0:32')
    expect(positionText(75, 90, 'fr')).toBe('1:15 sur 1:30')
  })

  it('moves the playhead with the motion level: every frame, ten a second, once a second', () => {
    expect(playheadInterval('full')).toBeNull()
    expect(playheadInterval('calm')).toBe(100)
    expect(playheadInterval('paused')).toBe(1_000)
  })

  it('heads the mixer with what is known of the track, and reads a chain as a chain', () => {
    expect(linerLine({ title: 'Night Shift', bpm: 165, key: 'F minor', daw: 'FL Studio' })).toBe('Night Shift · 165 BPM · F minor · FL Studio')
    expect(linerLine({ title: 'Dawn' })).toBe('Dawn')
    expect(chainLine(['Serum 2', 'OTT', 'Valhalla Room'])).toBe('Serum 2 → OTT → Valhalla Room')
  })
})
