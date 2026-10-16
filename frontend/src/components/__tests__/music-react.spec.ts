import { afterEach, describe, expect, it } from 'vitest'
import { tempos } from '@/content/music'
import { attachMusic, currentMusic, type MusicSource } from '@/lib/music-signal'
import {
  CALM_MAX_SPEED,
  createMusicReact,
  levelOf,
  listeningTo,
  lowOf,
  MAX_BREATH,
  MAX_OPACITY,
  MAX_PULSE,
  MAX_SPEED,
  PLAYING_SPEED,
  reactToMusic,
  REFERENCE_MS,
  RIPPLE_EVERY_MS,
  SURGE_EVERY_MS,
  type MusicInput,
} from '../music-react'

/**
 * The field listens (`docs/superpowers/specs/2026-10-15-music-reactive-field-design.md`):
 * the signal the sources attach to, and the pure reaction the background multiplies in,
 * each row of its table against its bound, and the rule that beats never touch light.
 */

const source = (id: MusicSource['id'], bpm: number | null = 120): MusicSource => ({ id, bpm, beats: () => null })

describe('the music signal', () => {
  const detaches: Array<() => void> = []
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach()
  })

  it('follows the source started last, and falls back to the one before', () => {
    const acid = source('acid')
    const stems = source('stems')
    detaches.push(attachMusic(acid))
    const detachStems = attachMusic(stems)
    detaches.push(detachStems)
    expect(currentMusic()).toBe(stems)
    detachStems()
    expect(currentMusic()).toBe(acid)
    // Twice is harmless.
    detachStems()
    expect(currentMusic()).toBe(acid)
  })

  it('moves a source attached again to the front, and has none when all are gone', () => {
    const acid = source('acid')
    const cloud = source('soundcloud')
    const detachAcid = attachMusic(acid)
    const detachCloud = attachMusic(cloud)
    detaches.push(attachMusic(acid))
    expect(currentMusic()).toBe(acid)
    detachAcid()
    detachCloud()
    expect(currentMusic()).toBeNull()
  })
})

/** Runs the reaction for `seconds` at `fps`, feeding `input(t)`; returns what each frame gave. */
function run(
  seconds: number,
  fps: number,
  input: (t: number) => MusicInput | null,
  motion: 'full' | 'calm' | 'paused' = 'full',
) {
  const state = createMusicReact()
  const f = 1000 / fps / REFERENCE_MS
  const frames: Array<{ t: number; speed: number; scale: number; opacity: number; ripple: boolean; surge: boolean }> = []
  for (let t = 0; t <= seconds * 1000; t += 1000 / fps) {
    const out = reactToMusic(state, input(t), t, f, motion)
    frames.push({ t, ...out })
  }
  return frames
}

const loud = (beats: (t: number) => number | null = () => null) => (t: number): MusicInput => ({
  level: 1,
  low: 1,
  beats: beats(t),
  beatsPerBar: 4,
})
/** A 200 BPM beat train: 3.33 beats a second, the rate the flash rule is about. */
const at200 = (t: number) => (t / 1000) * (200 / 60)

describe('how the field reacts', () => {
  it('drifts up to ×2.2 at full level, and back to ×1 without music', () => {
    const frames = run(3, 60, loud())
    expect(frames.at(-1)!.speed).toBeCloseTo(MAX_SPEED, 2)
    expect(Math.max(...frames.map((frame) => frame.speed))).toBeLessThanOrEqual(MAX_SPEED + 1e-9)
    const after = run(4, 60, (t) => (t < 1500 ? loud()(t) : null))
    expect(after.at(-1)!.speed).toBeCloseTo(1, 1)
  })

  it('lifts a source that can’t be heard to ×1.2 instead of the level', () => {
    const frames = run(3, 60, () => ({ level: null, low: null, beats: null, beatsPerBar: 4 }))
    expect(frames.at(-1)!.speed).toBeCloseTo(PLAYING_SPEED, 2)
  })

  it('breathes with the low band and pulses on each beat, within +15 % and +4 %', () => {
    const frames = run(4, 60, loud(at200))
    const scales = frames.map((frame) => frame.scale)
    expect(Math.max(...scales)).toBeLessThanOrEqual(1 + MAX_BREATH + MAX_PULSE + 1e-9)
    expect(Math.max(...scales)).toBeGreaterThan(1 + MAX_BREATH)
    const breathOnly = run(4, 60, loud())
    expect(breathOnly.at(-1)!.scale).toBeCloseTo(1 + MAX_BREATH, 2)
  })

  it('ripples on a bar’s downbeat, at most once every 1.5 s', () => {
    const frames = run(10, 60, loud(at200))
    const ripples = frames.filter((frame) => frame.ripple).map((frame) => frame.t)
    // 200 BPM in four is a bar every 1.2 s: the floor holds it to one per 1.5 s.
    expect(ripples.length).toBeGreaterThan(3)
    for (let i = 1; i < ripples.length; i += 1) expect(ripples[i]! - ripples[i - 1]!).toBeGreaterThanOrEqual(RIPPLE_EVERY_MS)
  })

  it('moves the same at 30 and 60 frames a second', () => {
    const at60 = run(2, 60, loud())
    const at30 = run(2, 30, loud())
    expect(at30.at(-1)!.speed).toBeCloseTo(at60.at(-1)!.speed, 2)
    expect(at30.at(-1)!.scale).toBeCloseTo(at60.at(-1)!.scale, 2)
  })

  // WCAG 2.3.1: no more than three flashes a second. Beats move geometry, never light.
  it('never moves opacity by more than 0.1 within any 333 ms, under a 200 BPM beat and a square-wave level', () => {
    const square = (t: number): MusicInput => ({
      level: Math.floor(t / 150) % 2 ? 1 : 0,
      low: Math.floor(t / 150) % 2 ? 1 : 0,
      beats: at200(t),
      beatsPerBar: 4,
    })
    const frames = run(10, 60, square)
    for (let i = 0; i < frames.length; i += 1) {
      for (let j = i + 1; j < frames.length && frames[j]!.t - frames[i]!.t <= 333; j += 1) {
        expect(Math.abs(frames[j]!.opacity - frames[i]!.opacity)).toBeLessThanOrEqual(0.1)
      }
    }
    expect(Math.max(...frames.map((frame) => frame.opacity))).toBeLessThanOrEqual(1 + MAX_OPACITY + 1e-9)
    // And the beat never reaches it: the same level with and without beats, the same light.
    const without = run(10, 60, (t) => ({ ...square(t), beats: null }))
    frames.forEach((frame, i) => expect(frame.opacity).toBe(without[i]!.opacity))
  })

  it('gives calm the level on the speed alone: no breath, no pulse, no ripple, no light', () => {
    const frames = run(6, 60, loud(at200), 'calm')
    expect(frames.every((frame) => frame.scale === 1 && frame.opacity === 1 && !frame.ripple && !frame.surge)).toBe(true)
    // The spec's first ceiling, kept for calm when full motion went past it.
    expect(frames.at(-1)!.speed).toBeCloseTo(CALM_MAX_SPEED, 2)
  })

  // The owner's call (#160): a drop landing is seen, as `wall`'s ripple at full strength.
  describe('a surge', () => {
    const level = (at: (t: number) => number) => (t: number): MusicInput => ({ level: at(t), low: at(t), beats: null, beatsPerBar: 4 })

    it('fires once when the level leaps from a breakdown into a drop, not while it stays there', () => {
      const frames = run(20, 60, level((t) => (t < 6_000 ? 0.1 : 0.95)))
      const surges = frames.filter((frame) => frame.surge).map((frame) => frame.t)
      expect(surges).toHaveLength(1)
      expect(surges[0]!).toBeGreaterThan(6_000)
      expect(surges[0]!).toBeLessThan(6_600)
    })

    it('takes no gentle rise for one, and no source that can’t be heard', () => {
      expect(run(30, 60, level((t) => Math.min(0.9, t / 30_000))).some((frame) => frame.surge)).toBe(false)
      expect(run(10, 60, () => ({ level: null, low: null, beats: null, beatsPerBar: 4 })).some((frame) => frame.surge)).toBe(false)
    })

    it('fires at most once every three seconds, however the level jumps', () => {
      const frames = run(40, 60, level((t) => (Math.floor(t / 2_000) % 2 ? 1 : 0)))
      const surges = frames.filter((frame) => frame.surge).map((frame) => frame.t)
      expect(surges.length).toBeGreaterThan(1)
      for (let i = 1; i < surges.length; i += 1) expect(surges[i]! - surges[i - 1]!).toBeGreaterThanOrEqual(SURGE_EVERY_MS)
    })
  })

  it('does nothing at paused', () => {
    const frames = run(2, 60, loud(at200), 'paused')
    expect(frames.every((frame) => frame.speed === 1 && frame.scale === 1 && frame.opacity === 1 && !frame.ripple && !frame.surge)).toBe(true)
  })
})

describe('reading a spectrum, and saying what is followed', () => {
  it('takes the RMS and the low band, in place', () => {
    expect(levelOf(Uint8Array.from([255, 255, 255, 255]))).toBe(1)
    expect(levelOf(new Uint8Array(4))).toBe(0)
    expect(lowOf(Uint8Array.from([255, 255, 0, 0, 0]), 2)).toBe(1)
    expect(lowOf(new Uint8Array(0))).toBe(0)
  })

  it('names the source and its tempo for x-ray’s canvas tag', () => {
    expect(listeningTo(source('acid', 138), 'en')).toBe('listening to acid, 138 BPM')
    expect(listeningTo(source('soundcloud', null), 'fr')).toBe('à l’écoute de soundcloud')
    expect(listeningTo(null, 'en')).toBe('')
  })
})

describe('the tempos entered by hand', () => {
  it.each(Object.entries(tempos))('%s has a positive tempo and a first beat at or after the start', (_path, tempo) => {
    expect(tempo.bpm).toBeGreaterThan(0)
    expect(tempo.firstBeatMs).toBeGreaterThanOrEqual(0)
  })

  it('keys them by a path on soundcloud.com', () => {
    for (const path of Object.keys(tempos)) expect(path).toMatch(/^\/[^/]+\/[^/]+/)
  })
})
