import { afterEach, describe, expect, it } from 'vitest'
import { currentMusic } from '@/lib/music-signal'
import {
  createSoundCloudBridge,
  levelAt,
  permalinkPath,
  waveformJsonUrl,
  waveformLevels,
  widgetBeats,
} from '../music/soundcloud-bridge'

/**
 * The SoundCloud bridge (`docs/superpowers/specs/2026-10-15-music-reactive-field-design.md`):
 * what the field follows of the widget's messages, which `useMusicEmbed` has already
 * checked and hands over, and the waveform it reads the track's level from, defensively,
 * since it is another origin's file.
 */

const TEMPOS = { '/couvbat/night-shift': { bpm: 165, firstBeatMs: 500 } }
const WAVE = 'https://wave.sndcdn.com/m9Fa3SkFfPMT_m.json'
const SOUND = {
  permalink_url: 'https://soundcloud.com/couvbat/night-shift',
  waveform_url: WAVE,
  duration: 10_000,
}

function setup(waveform: unknown = { width: 3, height: 140, samples: [0, 140, 70] }) {
  let clock = 1_000
  const asked: string[] = []
  const bridge = createSoundCloudBridge({
    tempos: TEMPOS,
    now: () => clock,
    load: (url) => {
      asked.push(url)
      return Promise.resolve(waveform)
    },
  })
  const say = (method: string, value?: unknown) => bridge.receive({ method, value })
  return { bridge, say, asked, tick: (ms: number) => (clock += ms) }
}

let current: ReturnType<typeof setup> | null = null
afterEach(() => {
  current?.bridge.dispose()
  current = null
})

describe('the SoundCloud bridge', () => {
  it('attaches while the widget plays, beats from the hand-entered tempo, and lets go on pause', () => {
    current = setup()
    current.say('getCurrentSound', SOUND)
    current.say('play')
    const source = currentMusic()!
    expect(source).toMatchObject({ id: 'soundcloud', bpm: 165 })
    expect(source.spectrum).toBeUndefined()
    current.say('playProgress', { currentPosition: 2_500, relativePosition: 0.1 })
    // Two seconds past the first beat at 165 BPM is 5.5 beats; the clock carries it on.
    expect(source.beats()).toBeCloseTo(5.5)
    current.tick(1_000)
    expect(source.beats()).toBeCloseTo(8.25)
    // Re-anchored on the next progress, so it can't drift.
    current.say('playProgress', { currentPosition: 3_000 })
    expect(source.beats()).toBeCloseTo(6.875)
    current.say('pause')
    expect(currentMusic()).not.toBe(source)
    expect(current.bridge.playing).toBe(false)
  })

  it('follows the track’s level off its waveform, as the position moves', async () => {
    current = setup()
    current.say('getCurrentSound', SOUND)
    current.say('play')
    current.say('playProgress', { currentPosition: 0 })
    const source = currentMusic()!
    // Asked for once, as JSON, and nothing until it is in.
    expect(current.asked).toEqual([WAVE])
    expect(source.level!()).toBeNull()
    await Promise.resolve()
    await Promise.resolve()

    expect(source.level!()).toBe(0)
    current.tick(5_000)
    // Halfway through the track is the tallest height, at full level.
    expect(source.level!()).toBeCloseTo(1)
    current.tick(2_500)
    // Three quarters: between the tallest and the middle of the track's range.
    expect(source.level!()).toBeCloseTo((1 + 0.5) / 2)
  })

  it('has no beat for a track with no tempo', () => {
    current = setup()
    current.say('getCurrentSound', { ...SOUND, permalink_url: 'https://soundcloud.com/couvbat/other' })
    current.say('play')
    current.say('playProgress', { currentPosition: 100 })
    expect(currentMusic()!.beats()).toBeNull()
    expect(currentMusic()!.bpm).toBeNull()
  })

  // Found against the real widget: a few more progress messages follow `pause`, and the
  // field kept going in silence.
  it('takes progress for the position, never for playing', () => {
    current = setup()
    current.say('playProgress', { currentPosition: 100 })
    expect(current.bridge.playing).toBe(false)
    current.say('play')
    current.say('pause')
    current.say('playProgress', { currentPosition: 140 })
    expect(current.bridge.playing).toBe(false)
    expect(currentMusic()).toBeNull()
  })

  it('takes the widget’s word on whether it is paused', () => {
    current = setup()
    current.say('isPaused', false)
    expect(current.bridge.playing).toBe(true)
    current.say('isPaused', 'no')
    expect(current.bridge.playing).toBe(true)
    current.say('isPaused', true)
    expect(current.bridge.playing).toBe(false)
  })

  it('drops a waveform that arrives after the playlist moved on', async () => {
    let release!: (value: unknown) => void
    const bridge = createSoundCloudBridge({ load: () => new Promise((resolve) => (release = resolve)) })
    bridge.receive({ method: 'getCurrentSound', value: SOUND })
    bridge.receive({ method: 'play', value: null })
    bridge.receive({ method: 'playProgress', value: { currentPosition: 5_000 } })
    bridge.receive({ method: 'getCurrentSound', value: { ...SOUND, waveform_url: null } })
    release({ samples: [140, 140] })
    await Promise.resolve()
    await Promise.resolve()
    expect(currentMusic()!.level!()).toBeNull()
    bridge.dispose()
  })

  it('ignores what isn’t the protocol, and lets go of everything when disposed', () => {
    current = setup()
    current.say('openTheVault', { anything: true })
    expect(current.bridge.playing).toBe(false)
    current.say('getCurrentSound', SOUND)
    current.say('play')
    current.say('playProgress', { currentPosition: 'soon' })
    // No anchor from a garbled position, so no beat and no level.
    expect(currentMusic()!.beats()).toBeNull()
    expect(currentMusic()!.level!()).toBeNull()
    current.bridge.dispose()
    expect(current.bridge.playing).toBe(false)
    current.say('play')
    expect(current.bridge.playing).toBe(false)
  })
})

describe('reading the widget and the waveform', () => {
  it('reads a sound’s path on soundcloud.com, and nothing else', () => {
    expect(permalinkPath('https://soundcloud.com/couvbat/night-shift/')).toBe('/couvbat/night-shift')
    expect(permalinkPath('https://evil.example/couvbat/night-shift')).toBeNull()
    expect(permalinkPath('javascript:alert(1)')).toBeNull()
    expect(permalinkPath(42)).toBeNull()
  })

  it('fetches a waveform from SoundCloud’s CDN only, as JSON', () => {
    expect(waveformJsonUrl(WAVE)).toBe(WAVE)
    expect(waveformJsonUrl('https://wave.sndcdn.com/m9Fa3SkFfPMT_m.png')).toBe(WAVE)
    expect(waveformJsonUrl('http://wave.sndcdn.com/m9Fa3SkFfPMT_m.json')).toBeNull()
    expect(waveformJsonUrl('https://wave.sndcdn.com.evil.example/m9Fa3SkFfPMT_m.json')).toBeNull()
    expect(waveformJsonUrl('https://wave.sndcdn.com/../m9Fa3SkFfPMT_m.json')).toBeNull()
    expect(waveformJsonUrl(null)).toBeNull()
  })

  it('places heights in the track’s own range, and refuses anything else', () => {
    expect(Array.from(waveformLevels({ samples: [0, 70, 140] })!)).toEqual([0, 0.5, 1])
    // A loud master: an intro at 95 and minutes within a few percent of the peak. Against
    // the peak alone they read 0.68 and 0.95; in the track's range, near 0 and 1.
    const master = waveformLevels({ samples: [...new Array(20).fill(95), ...new Array(75).fill(133), ...new Array(5).fill(140)] })!
    expect(master[0]).toBe(0)
    expect(master[50]).toBeGreaterThan(0.8)
    // A drone has no range: against its peak.
    expect(Array.from(waveformLevels({ samples: [100, 100, 100] })!)).toEqual([1, 1, 1])
    expect(waveformLevels({ samples: [] })).toBeNull()
    expect(waveformLevels({ samples: [0, 0] })).toBeNull()
    expect(waveformLevels({ samples: [1, '2'] })).toBeNull()
    expect(waveformLevels({ samples: [1, -2] })).toBeNull()
    expect(waveformLevels({ samples: new Array(10_001).fill(1) })).toBeNull()
    expect(waveformLevels('nope')).toBeNull()
  })

  it('reads the level between two heights, clamped to the track', () => {
    const levels = Float32Array.from([0, 1])
    expect(levelAt(levels, 250, 1_000)).toBeCloseTo(0.25)
    expect(levelAt(levels, -5, 1_000)).toBe(0)
    expect(levelAt(levels, 5_000, 1_000)).toBe(1)
    expect(levelAt(levels, 0, 0)).toBeNull()
    expect(levelAt(null, 0, 1_000)).toBeNull()
  })

  it('counts beats from an anchor, and none without one or a tempo', () => {
    const tempo = { bpm: 120, firstBeatMs: 0 }
    expect(widgetBeats({ positionMs: 1_000, at: 0 }, 500, tempo)).toBeCloseTo(3)
    expect(widgetBeats(null, 0, tempo)).toBeNull()
    expect(widgetBeats({ positionMs: 0, at: 0 }, 0, null)).toBeNull()
  })
})
