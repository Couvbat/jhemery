import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StemTrack } from '@/content/stems'
import { toBase64Url } from '@/lib/base64url'
import { createStemsEngine } from '../stems/engine'
import { cutoffHz, decodeMix, DEFAULT_LEVEL, defaultMix, encodeMix, gains, MIX_VERSION, type Mix } from '../stems/mix'

const stem = (id: string) => ({ id, name: { en: id, fr: id }, file: `night/${id}.m4a`, bytes: 1000 })
const TRACK: StemTrack = { id: 'night-shift', title: 'Night Shift', seconds: 30, stems: ['drums', 'bass', 'acid', 'pads'].map(stem) }
const OTHER: StemTrack = { id: 'dawn', title: 'Dawn', seconds: 20, stems: ['drums', 'keys'].map(stem) }
const TRACKS = [TRACK, OTHER]

const mixOf = (...stems: [number, boolean, boolean][]): Mix => ({
  stems: stems.map(([level, muted, solo]) => ({ level, muted, solo })),
  cutoff: 1,
})

describe('the gains a mix comes to', () => {
  it('squares the fader, so its travel is spread across what the ear hears', () => {
    expect(gains(mixOf([1, false, false], [0.5, false, false], [0, false, false]))).toEqual([1, 0.25, 0])
  })

  it('silences a muted stem, and every stem but the soloed ones', () => {
    expect(gains(mixOf([1, true, false], [1, false, false]))).toEqual([0, 1])
    expect(gains(mixOf([1, false, true], [1, false, false], [0.5, false, true]))).toEqual([1, 0, 0.25])
    // A muted solo stays muted, as on a desk.
    expect(gains(mixOf([1, true, true], [1, false, false]))).toEqual([0, 0])
  })

  it('starts every fader below the top, unmuted, with the filter open', () => {
    const mix = defaultMix(3)
    expect(mix.stems).toHaveLength(3)
    expect(mix.stems.every((s) => s.level === DEFAULT_LEVEL && !s.muted && !s.solo)).toBe(true)
    expect(mix.cutoff).toBe(1)
  })

  it('sweeps the filter exponentially from 40 Hz to 20 kHz, and clamps', () => {
    expect(cutoffHz(0)).toBeCloseTo(40)
    expect(cutoffHz(1)).toBeCloseTo(20_000)
    expect(cutoffHz(0.5)).toBeCloseTo(Math.sqrt(40 * 20_000))
    expect(cutoffHz(-1)).toBeCloseTo(40)
    expect(cutoffHz(2)).toBeCloseTo(20_000)
  })
})

describe('a mix code', () => {
  it('names its track in the clear and reads back the same mix, to a 255th', () => {
    const mix: Mix = {
      stems: [
        { level: 1, muted: false, solo: true },
        { level: 0.4, muted: true, solo: false },
        { level: 0, muted: false, solo: false },
        { level: 0.8, muted: true, solo: true },
      ],
      cutoff: 0.3,
    }
    const code = encodeMix(TRACK.id, mix)
    expect(code).toMatch(/^night-shift\.[A-Za-z0-9_-]+$/)
    const read = decodeMix(code, TRACKS)!
    expect(read.track).toBe(TRACK)
    read.mix.stems.forEach((s, i) => {
      expect(s.level).toBeCloseTo(mix.stems[i]!.level, 2)
      expect([s.muted, s.solo]).toEqual([mix.stems[i]!.muted, mix.stems[i]!.solo])
    })
    expect(read.mix.cutoff).toBeCloseTo(0.3, 2)
  })

  it('clamps a level out of range rather than writing garbage', () => {
    const read = decodeMix(encodeMix(OTHER.id, mixOf([3, false, false], [-1, false, false])), TRACKS)!
    expect(read.mix.stems.map((s) => s.level)).toEqual([1, 0])
  })

  // A link is anyone's to write, and a stale one is a stem count behind.
  it('refuses a code that doesn’t fit a track', () => {
    const good = encodeMix(TRACK.id, defaultMix(4))
    const bytes = (values: number[]) => toBase64Url(Uint8Array.from(values))
    expect(decodeMix(good.replace('night-shift', 'nowhere'), TRACKS)).toBeNull()
    expect(decodeMix(encodeMix(TRACK.id, defaultMix(3)), TRACKS)).toBeNull()
    expect(decodeMix(`night-shift.${bytes([MIX_VERSION + 1, 4, 0, 0, 0, 0, 0, 0, 0, 0, 255])}`, TRACKS)).toBeNull()
    expect(decodeMix(`night-shift.${bytes([MIX_VERSION, 4, 0, 0])}`, TRACKS)).toBeNull()
    expect(decodeMix('night-shift.!!', TRACKS)).toBeNull()
    expect(decodeMix('night-shift', TRACKS)).toBeNull()
    expect(decodeMix('', TRACKS)).toBeNull()
  })
})

// The engine against a recording stand-in for Web Audio, as `acid.spec.ts` does.
interface FakeParam {
  value: number
  events: { method: string; args: number[] }[]
  setValueAtTime: (...args: number[]) => void
  setTargetAtTime: (...args: number[]) => void
  cancelScheduledValues: (...args: number[]) => void
}

function param(value = 0): FakeParam {
  const events: FakeParam['events'] = []
  const record = (method: string) => (...args: number[]) => void events.push({ method, args })
  return { value, events, setValueAtTime: record('setValueAtTime'), setTargetAtTime: record('setTargetAtTime'), cancelScheduledValues: record('cancelScheduledValues') }
}

class FakeNode {
  connections: unknown[] = []
  disconnected = false
  constructor(readonly kind: string) {}
  connect(target: unknown) {
    this.connections.push(target)
    return target
  }
  disconnect() {
    this.disconnected = true
  }
}

class FakeContext {
  currentTime = 10
  state: AudioContextState = 'running'
  destination = new FakeNode('destination')
  nodes: (FakeNode & Record<string, unknown>)[] = []
  resume = vi.fn(async () => void (this.state = 'running'))
  suspend = vi.fn(async () => void (this.state = 'suspended'))

  private make<T extends Record<string, unknown>>(kind: string, extra: T) {
    const node = Object.assign(new FakeNode(kind), extra)
    this.nodes.push(node)
    return node
  }
  createGain() {
    return this.make('gain', { gain: param(1) })
  }
  createBiquadFilter() {
    return this.make('filter', { type: 'lowpass', frequency: param(350), Q: param(1) })
  }
  createDynamicsCompressor() {
    return this.make('compressor', { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) })
  }
  createBufferSource() {
    return this.make('source', { buffer: null, loop: false, loopStart: 0, loopEnd: 0, start: vi.fn(), stop: vi.fn() })
  }
}

describe('the engine', () => {
  let context: FakeContext
  const buffers = [{ duration: 30 }, { duration: 30.02 }, { duration: 30 }] as AudioBuffer[]
  const engineOn = (mix = defaultMix(3), onStop = vi.fn()) => createStemsEngine(context as unknown as AudioContext, buffers, mix, { onStop })
  const nodes = (kind: string) => context.nodes.filter((n) => n.kind === kind)

  beforeEach(() => {
    vi.useFakeTimers()
    context = new FakeContext()
  })
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('starts silent: nothing is booked until play', () => {
    engineOn()
    expect(nodes('source')).toHaveLength(0)
    const transport = nodes('gain')[3]!
    expect((transport.gain as FakeParam).value).toBe(0)
  })

  it('starts every stem at the same instant and offset, looping the shortest length', () => {
    const engine = engineOn()
    engine.play()
    const sources = nodes('source')
    expect(sources).toHaveLength(3)
    const starts = sources.map((s) => (s.start as ReturnType<typeof vi.fn>).mock.calls[0])
    expect(new Set(starts.map((call) => JSON.stringify(call))).size).toBe(1)
    expect(starts[0]).toEqual([10.05, 0])
    expect(sources.every((s) => s.loop === true && s.loopEnd === 30)).toBe(true)
    expect(engine.length).toBe(30)
  })

  it('picks up where it paused, by the audio clock', () => {
    const engine = engineOn()
    engine.play()
    context.currentTime = 10.05 + 12.5
    expect(engine.position()).toBeCloseTo(12.5)
    engine.pause()
    expect(engine.playing).toBe(false)
    context.currentTime = 40
    expect(engine.position()).toBeCloseTo(12.5)
    engine.play()
    expect((nodes('source')[3]!.start as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([40.05, 12.5])
    // And wraps at the loop's end.
    context.currentTime = 40.05 + 20
    expect(engine.position()).toBeCloseTo(2.5)
  })

  it('applies a mix by ramping each fader and the filter, never jumping', () => {
    const engine = engineOn()
    engine.set({ stems: [{ level: 1, muted: false, solo: false }, { level: 1, muted: true, solo: false }, { level: 0.5, muted: false, solo: false }], cutoff: 0 })
    const faders = nodes('gain').slice(0, 3)
    expect(faders.map((f) => (f.gain as FakeParam).events.at(-1)?.args[0])).toEqual([1, 0, 0.25])
    expect((nodes('filter')[0]!.frequency as FakeParam).events.at(-1)).toMatchObject({ method: 'setTargetAtTime', args: [40, 10, expect.any(Number)] })
  })

  it('stops when the tab goes to the background, and won’t start in one', () => {
    const onStop = vi.fn()
    const engine = engineOn(defaultMix(3), onStop)
    engine.play()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(engine.playing).toBe(false)
    expect(onStop).toHaveBeenCalledWith('hidden')
    engine.play()
    expect(engine.playing).toBe(false)
    expect(onStop).toHaveBeenCalledTimes(2)
  })

  // Vol. 2: the loop is the excerpt, exactly, whatever padding an encoder added.
  it('loops over exactly the track’s seconds when it gives them', () => {
    const engine = createStemsEngine(context as unknown as AudioContext, buffers, defaultMix(3), { seconds: 29.5 })
    engine.play()
    expect(engine.length).toBe(29.5)
    expect(nodes('source').every((s) => s.loopStart === 0 && s.loopEnd === 29.5)).toBe(true)
  })

  it('seeks playing by booking every stem at one instant, stopping the old ones at that same instant', () => {
    const engine = engineOn()
    engine.play()
    const before = nodes('source')
    context.currentTime = 20
    engine.seek(12)
    const after = nodes('source').slice(before.length)
    expect(after).toHaveLength(3)
    expect(new Set(after.map((s) => JSON.stringify((s.start as ReturnType<typeof vi.fn>).mock.calls[0]))).size).toBe(1)
    expect((after[0]!.start as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([20.05, 12])
    expect(before.every((s) => (s.stop as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] === 20.05)).toBe(true)
    context.currentTime = 20.05 + 3
    expect(engine.position()).toBeCloseTo(15)
  })

  it('seeks paused by moving where play will start, booking nothing', () => {
    const engine = engineOn()
    engine.seek(7)
    expect(nodes('source')).toHaveLength(0)
    expect(engine.position()).toBe(7)
    engine.play()
    expect((nodes('source')[0]!.start as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([10.05, 7])
    // Clamped inside the loop.
    engine.pause()
    engine.seek(99)
    expect(engine.position()).toBeLessThan(30)
    engine.seek(-4)
    expect(engine.position()).toBe(0)
  })

  it('suspends the context once stopped, and lets go of every node on dispose', () => {
    const engine = engineOn()
    engine.play()
    engine.pause()
    vi.advanceTimersByTime(300)
    expect(context.suspend).toHaveBeenCalled()
    engine.dispose()
    expect(context.nodes.filter((n) => n.kind !== 'source').every((n) => n.disconnected)).toBe(true)
    engine.play()
    expect(engine.playing).toBe(false)
  })
})
