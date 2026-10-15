import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentMusic } from '@/lib/music-signal'
import { createSoundCloudBridge, permalinkPath, readWidgetMessage, WIDGET_ORIGIN, widgetBeats } from '../music/soundcloud-bridge'

/**
 * The SoundCloud bridge (`docs/superpowers/specs/2026-10-15-music-reactive-field-design.md`):
 * the widget's protocol as `api.js` speaks it, read from one origin and one frame only, and
 * defensively, since it is another origin's input.
 */

const TEMPOS = { '/couvbat/night-shift': { bpm: 165, firstBeatMs: 500 } }

function setup() {
  const posted: Array<{ data: string; origin: string }> = []
  const contentWindow = { postMessage: (data: string, origin: string) => posted.push({ data, origin }) }
  const frame = Object.assign(new EventTarget(), { contentWindow }) as unknown as HTMLIFrameElement
  const target = new EventTarget() as unknown as Window
  let clock = 1_000
  const onPlaying = vi.fn()
  const bridge = createSoundCloudBridge(frame, { tempos: TEMPOS, target, onPlaying, now: () => clock })
  const say = (method: string, value?: unknown, from: { origin?: string; source?: unknown; raw?: string } = {}) =>
    target.dispatchEvent(
      Object.assign(new Event('message'), {
        origin: from.origin ?? WIDGET_ORIGIN,
        source: 'source' in from ? from.source : contentWindow,
        data: from.raw ?? JSON.stringify({ method, value }),
      }),
    )
  return { bridge, posted, say, onPlaying, tick: (ms: number) => (clock += ms), frame }
}

let current: ReturnType<typeof setup> | null = null
beforeEach(() => {
  current = null
})
afterEach(() => current?.bridge.dispose())

describe('the SoundCloud bridge', () => {
  it('subscribes as api.js does: the four events, then the current sound, again on ready', () => {
    current = setup()
    const sent = () => current!.posted.map((p) => JSON.parse(p.data) as { method: string; value: unknown })
    expect(sent()).toEqual([
      { method: 'addEventListener', value: 'play' },
      { method: 'addEventListener', value: 'pause' },
      { method: 'addEventListener', value: 'finish' },
      { method: 'addEventListener', value: 'playProgress' },
      { method: 'getCurrentSound', value: null },
    ])
    expect(current.posted.every((p) => p.origin === WIDGET_ORIGIN)).toBe(true)
    current.say('ready')
    expect(sent()).toHaveLength(10)
  })

  it('attaches while the widget plays, beats from the hand-entered tempo, and lets go on pause', () => {
    current = setup()
    current.say('getCurrentSound', { permalink_url: 'https://soundcloud.com/couvbat/night-shift' })
    current.say('play')
    expect(current.onPlaying).toHaveBeenLastCalledWith(true)
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
    expect(current.onPlaying).toHaveBeenLastCalledWith(false)
  })

  it('has no beat for a track with no tempo, and plays from progress alone', () => {
    current = setup()
    current.say('getCurrentSound', { permalink_url: 'https://soundcloud.com/couvbat/other' })
    current.say('playProgress', { currentPosition: 100 })
    expect(current.bridge.playing).toBe(true)
    expect(currentMusic()!.beats()).toBeNull()
    expect(currentMusic()!.bpm).toBeNull()
  })

  it('ignores another origin, another frame, and anything not the protocol', () => {
    current = setup()
    current.say('play', undefined, { origin: 'https://evil.example' })
    current.say('play', undefined, { source: {} })
    current.say('play', undefined, { raw: '{not json' })
    current.say('play', undefined, { raw: JSON.stringify({ value: 1 }) })
    current.say('openTheVault', { anything: true })
    current.say('playProgress', { currentPosition: 'soon' })
    expect(current.bridge.playing).toBe(true)
    // Only the last line started it, with no anchor: no beat from a garbled position.
    expect(currentMusic()!.beats()).toBeNull()
  })

  it('lets go of everything when disposed', () => {
    current = setup()
    current.say('play')
    current.bridge.dispose()
    expect(current.bridge.playing).toBe(false)
    current.say('play')
    expect(current.bridge.playing).toBe(false)
  })
})

describe('reading the widget', () => {
  it('accepts a JSON string from the widget’s origin and frame only', () => {
    const frame = {}
    const event = (data: unknown, origin = WIDGET_ORIGIN, source: unknown = frame) => ({ data, origin, source })
    expect(readWidgetMessage(event('{"method":"play"}'), frame)).toEqual({ method: 'play', value: undefined })
    expect(readWidgetMessage(event({ method: 'play' }), frame)).toBeNull()
    expect(readWidgetMessage(event('{"method":"play"}', 'http://w.soundcloud.com'), frame)).toBeNull()
    expect(readWidgetMessage(event('{"method":"play"}'), null)).toBeNull()
    expect(readWidgetMessage(event('"play"'), frame)).toBeNull()
  })

  it('reads a sound’s path on soundcloud.com, and nothing else', () => {
    expect(permalinkPath('https://soundcloud.com/couvbat/night-shift/')).toBe('/couvbat/night-shift')
    expect(permalinkPath('https://evil.example/couvbat/night-shift')).toBeNull()
    expect(permalinkPath('javascript:alert(1)')).toBeNull()
    expect(permalinkPath(42)).toBeNull()
  })

  it('counts beats from an anchor, and none without one or a tempo', () => {
    const tempo = { bpm: 120, firstBeatMs: 0 }
    expect(widgetBeats({ positionMs: 1_000, at: 0 }, 500, tempo)).toBeCloseTo(3)
    expect(widgetBeats(null, 0, tempo)).toBeNull()
    expect(widgetBeats({ positionMs: 0, at: 0 }, 0, null)).toBeNull()
  })
})
