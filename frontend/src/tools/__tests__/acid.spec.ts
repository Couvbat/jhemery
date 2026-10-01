import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine, MASTER_DB, MAX_RESONANCE_DB, shapeCurve, TICK_MS, voiceOf } from '../acid/engine'
import {
  BYTES,
  DEFAULT_PATTERN,
  KNOBS,
  MAX_BPM,
  MIN_BPM,
  PHRYGIAN,
  STEPS,
  VERSION,
  clonePattern,
  decode,
  encode,
  fromOffset,
  midiOf,
  offsetOf,
  pitchName,
  randomise,
  stepDuration,
  stepTimes,
  type Pattern,
} from '../acid/pattern'

const bytesOf = (code: string) =>
  Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (code.length % 4)) % 4)), (c) =>
    c.charCodeAt(0),
  )
const codeOf = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A seeded generator, so a failing randomise can be replayed. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('the pattern code', () => {
  it('round-trips', () => {
    expect(decode(encode(DEFAULT_PATTERN))).toEqual(DEFAULT_PATTERN)
    for (let seed = 1; seed <= 50; seed++) {
      const random = mulberry32(seed)
      const pattern: Pattern = {
        ...randomise(DEFAULT_PATTERN, random),
        bpm: MIN_BPM + Math.floor(random() * (MAX_BPM - MIN_BPM + 1)),
        wave: random() < 0.5 ? 'saw' : 'square',
        root: Math.floor(random() * 12),
        knobs: Object.fromEntries(KNOBS.map((knob) => [knob, Math.floor(random() * 256)])) as Pattern['knobs'],
      }
      expect(decode(encode(pattern)), `seed ${seed}`).toEqual(pattern)
    }
  })

  it('round-trips 250 bpm, and both ends of the tempo range', () => {
    for (const bpm of [MIN_BPM, 250, MAX_BPM]) {
      expect(decode(encode({ ...DEFAULT_PATTERN, bpm }))?.bpm).toBe(bpm)
    }
  })

  it('fits in 40 characters of base64url', () => {
    const code = encode(DEFAULT_PATTERN)
    expect(code.length).toBeLessThanOrEqual(40)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(bytesOf(code)).toHaveLength(BYTES)
  })

  it('leads with the version byte, and refuses a version it does not know', () => {
    const bytes = bytesOf(encode(DEFAULT_PATTERN))
    expect(bytes[0]).toBe(VERSION)
    for (const version of [0, 2, 255]) {
      bytes[0] = version
      expect(decode(codeOf(bytes)), `version ${version}`).toBeNull()
    }
  })

  it('refuses the code cut at every length, without throwing', () => {
    const code = encode(DEFAULT_PATTERN)
    for (let length = 0; length < code.length; length++) {
      expect(decode(code.slice(0, length)), `${length} characters`).toBeNull()
    }
  })

  it('refuses what is not a code at all', () => {
    for (const input of ['', '   ', '!!!', 'héllo', 'A'.repeat(65), `${encode(DEFAULT_PATTERN)}%00`, '<script>']) {
      expect(decode(input), input).toBeNull()
    }
  })

  it('forgives padding, surrounding space and bytes past the end', () => {
    const code = encode(DEFAULT_PATTERN)
    expect(decode(` ${code}== `)).toEqual(DEFAULT_PATTERN)
    expect(decode(codeOf(Uint8Array.from([...bytesOf(code), 1, 2, 3])))).toEqual(DEFAULT_PATTERN)
  })

  it('clamps every field it decodes', () => {
    const bytes = new Uint8Array(BYTES).fill(0xff)
    bytes[0] = VERSION
    const pattern = decode(codeOf(bytes))!
    expect(pattern.bpm).toBe(MAX_BPM)
    expect(pattern.root).toBe(11)
    expect(pattern.wave).toBe('square')
    expect(pattern.steps).toHaveLength(STEPS)
    for (const step of pattern.steps) {
      expect(step).toEqual({ on: true, accent: true, slide: true, octave: 1, note: 12 })
    }
    for (const knob of KNOBS) expect(pattern.knobs[knob]).toBe(255)

    const zeros = new Uint8Array(BYTES)
    zeros[0] = VERSION
    expect(decode(codeOf(zeros))).toMatchObject({ bpm: MIN_BPM, root: 0, wave: 'saw' })
  })

  it('decodes random bytes to something playable, never out of range', () => {
    const random = mulberry32(7)
    for (let i = 0; i < 200; i++) {
      const bytes = Uint8Array.from({ length: BYTES }, () => Math.floor(random() * 256))
      bytes[0] = VERSION
      const pattern = decode(codeOf(bytes))!
      expect(pattern.bpm).toBeGreaterThanOrEqual(MIN_BPM)
      expect(pattern.bpm).toBeLessThanOrEqual(MAX_BPM)
      for (const step of pattern.steps) {
        expect(step.note).toBeGreaterThanOrEqual(0)
        expect(step.note).toBeLessThanOrEqual(12)
        expect([-1, 0, 1]).toContain(step.octave)
      }
    }
  })

  it('clamps on the way out too, so a bad pattern cannot write a bad code', () => {
    const wild = clonePattern(DEFAULT_PATTERN)
    wild.bpm = 9000
    wild.root = -4
    wild.knobs.cutoff = 1e6
    wild.steps[0]!.note = 40
    expect(decode(encode(wild))).toMatchObject({ bpm: MAX_BPM, root: 0, knobs: { cutoff: 255 } })
    expect(decode(encode(wild))!.steps[0]!.note).toBe(12)
  })
})

describe('randomise', () => {
  it('stays in phrygian', () => {
    for (let seed = 1; seed <= 100; seed++) {
      for (const step of randomise(DEFAULT_PATTERN, mulberry32(seed)).steps) {
        expect(PHRYGIAN as readonly number[]).toContain(step.note)
      }
    }
  })

  it('keeps the sound and always plays the downbeat', () => {
    const base = { ...clonePattern(DEFAULT_PATTERN), bpm: 210, wave: 'square' as const, root: 4 }
    const next = randomise(base, mulberry32(3))
    expect(next).toMatchObject({ bpm: 210, wave: 'square', root: 4, knobs: base.knobs })
    expect(next.steps[0]!.on).toBe(true)
    expect(next.steps).not.toEqual(base.steps)
  })
})

describe('stepTimes', () => {
  it('counts sixteenth notes', () => {
    expect(stepDuration(120)).toBe(0.125)
    expect(stepDuration(250)).toBeCloseTo(0.06)
  })

  it('books every step that starts before the horizon, wrapping at sixteen', () => {
    const { steps, next } = stepTimes({ step: 14, time: 1 }, 120, 1.3)
    expect(steps).toEqual([
      { step: 14, time: 1 },
      { step: 15, time: 1.125 },
      { step: 0, time: 1.25 },
    ])
    expect(next).toEqual({ step: 1, time: 1.375 })
  })

  it('books nothing when the next step is past the horizon', () => {
    expect(stepTimes({ step: 3, time: 2 }, 120, 1.9)).toEqual({ steps: [], next: { step: 3, time: 2 } })
  })
})

describe('pitches', () => {
  it('names a step in scientific pitch, from the root', () => {
    const inA = { ...DEFAULT_PATTERN, root: 9 }
    expect(pitchName(midiOf(inA, { on: true, accent: false, slide: false, octave: 0, note: 0 }))).toBe('A2')
    expect(pitchName(midiOf(inA, { on: true, accent: false, slide: false, octave: 0, note: 3 }))).toBe('C3')
    expect(pitchName(midiOf(inA, { on: true, accent: false, slide: false, octave: -1, note: 1 }))).toBe('A#1')
  })

  it('turns a semitone offset into an octave and a note, and back', () => {
    for (let offset = -12; offset <= 24; offset++) {
      const { octave, note } = fromOffset(offset)
      expect(offsetOf({ on: true, accent: false, slide: false, octave, note })).toBe(offset)
    }
    expect(fromOffset(99)).toEqual({ octave: 1, note: 12 })
    expect(fromOffset(-99)).toEqual({ octave: -1, note: 0 })
  })
})

describe('the voice', () => {
  it('caps the resonance short of self-oscillation', () => {
    expect(voiceOf({ ...DEFAULT_PATTERN.knobs, resonance: 255 }).resonance).toBe(MAX_RESONANCE_DB)
    expect(voiceOf({ ...DEFAULT_PATTERN.knobs, resonance: 9999 }).resonance).toBe(MAX_RESONANCE_DB)
    expect(MAX_RESONANCE_DB).toBeLessThanOrEqual(18)
  })

  it('shapes with a tanh that stays inside ±1', () => {
    const curve = shapeCurve(10, 257)
    expect(curve[0]).toBeCloseTo(-1)
    expect(curve[128]).toBeCloseTo(0)
    expect(curve[256]).toBeCloseTo(1)
    expect(Math.max(...curve.map(Math.abs))).toBeLessThanOrEqual(1.000001)
  })
})

// ── the engine, against a context that records instead of sounding ──────────────────

interface FakeParam {
  value: number
  events: { method: string; args: number[] }[]
  setValueAtTime: (value: number, time: number) => void
  setTargetAtTime: (value: number, time: number, constant: number) => void
  cancelScheduledValues: (time: number) => void
}

function param(value = 0): FakeParam {
  const events: FakeParam['events'] = []
  const record = (method: string) => (...args: number[]) => void events.push({ method, args })
  return {
    value,
    events,
    setValueAtTime: record('setValueAtTime'),
    setTargetAtTime: record('setTargetAtTime'),
    cancelScheduledValues: record('cancelScheduledValues'),
  }
}

class FakeNode {
  connections: unknown[] = []
  constructor(readonly kind: string) {}
  connect(target: unknown) {
    this.connections.push(target)
    return target
  }
  disconnect() {}
}

class FakeContext {
  currentTime = 0
  state: AudioContextState = 'running'
  destination = new FakeNode('destination')
  nodes: (FakeNode & Record<string, unknown>)[] = []
  resume = vi.fn(async () => void (this.state = 'running'))
  suspend = vi.fn(async () => void (this.state = 'suspended'))
  close = vi.fn(async () => void (this.state = 'closed'))

  private make<T extends Record<string, unknown>>(kind: string, extra: T) {
    const node = Object.assign(new FakeNode(kind), extra)
    this.nodes.push(node)
    return node
  }
  createOscillator() {
    return this.make('oscillator', { type: 'sawtooth', frequency: param(440), start: vi.fn(), stop: vi.fn(), onended: null })
  }
  createBiquadFilter() {
    return this.make('filter', { type: 'lowpass', frequency: param(350), Q: param(1) })
  }
  createWaveShaper() {
    return this.make('shaper', { curve: null, oversample: 'none' })
  }
  createGain() {
    return this.make('gain', { gain: param(1) })
  }
  createDynamicsCompressor() {
    return this.make('compressor', {
      threshold: param(-24),
      knee: param(30),
      ratio: param(12),
      attack: param(0.003),
      release: param(0.25),
    })
  }
}

describe('the engine', () => {
  let context: FakeContext
  const engineOn = (pattern: Pattern = DEFAULT_PATTERN, onStop = vi.fn()) =>
    createEngine(context as unknown as AudioContext, () => pattern, { onStop })
  const node = (kind: string, index = 0) => context.nodes.filter((n) => n.kind === kind)[index]!
  const gate = () => (node('gain', 0).gain as FakeParam).events
  /** Moves the audio clock and the timers together, a tick at a time, as a browser does. */
  const advance = (seconds: number) => {
    for (let left = seconds; left > 1e-9; left -= TICK_MS / 1000) {
      context.currentTime += Math.min(left, TICK_MS / 1000)
      vi.advanceTimersByTime(TICK_MS)
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    context = new FakeContext()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('wires oscillator → filter → shaper → amp → master → limiter → speakers', () => {
    engineOn()
    const order = ['oscillator', 'filter', 'shaper', 'gain', 'gain', 'compressor']
    expect(context.nodes.map((n) => n.kind)).toEqual(order)
    context.nodes.forEach((n, i) => expect(n.connections).toEqual([context.nodes[i + 1] ?? context.destination]))
    expect((node('gain', 1).gain as FakeParam).value).toBeCloseTo(10 ** (MASTER_DB / 20))
    expect(node('compressor').ratio).toMatchObject({ value: 20 })
    expect(node('filter').type).toBe('lowpass')
  })

  it('makes no sound until started, and books against the audio clock once it is', () => {
    const engine = engineOn()
    expect(gate()).toEqual([])
    engine.start()
    const attacks = gate().filter((e) => e.method === 'setTargetAtTime' && e.args[0]! > 0)
    expect(attacks.length).toBeGreaterThan(0)
    expect(attacks[0]!.args[1]).toBeCloseTo(0.05)
    engine.stop()
  })

  it('never books a resonance above the cap', () => {
    const loud = { ...clonePattern(DEFAULT_PATTERN), knobs: { ...DEFAULT_PATTERN.knobs, resonance: 255 } }
    const engine = engineOn(loud)
    engine.start()
    advance(0.5)
    const q = (node('filter').Q as FakeParam).events.map((e) => e.args[0]!)
    expect(q.length).toBeGreaterThan(0)
    expect(Math.max(...q)).toBeLessThanOrEqual(MAX_RESONANCE_DB)
    engine.stop()
  })

  it('closes the gate on a rest, even after a slide promised to hold it', () => {
    const pattern = clonePattern(DEFAULT_PATTERN)
    pattern.steps[0] = { on: true, accent: false, slide: true, octave: 0, note: 0 }
    pattern.steps[1] = { on: true, accent: false, slide: false, octave: 0, note: 0 }
    const engine = engineOn(pattern)
    engine.start()
    // Step 1 is switched off after step 0's slide was booked against it.
    pattern.steps[1] = { ...pattern.steps[1]!, on: false }
    advance(0.2)
    const step1 = 0.05 + stepDuration(pattern.bpm)
    expect(gate()).toContainEqual({ method: 'setTargetAtTime', args: [0, step1, expect.any(Number)] })
    engine.stop()
  })

  it('stops, fades and suspends when the tab goes to the background', () => {
    const onStop = vi.fn()
    const engine = engineOn(DEFAULT_PATTERN, onStop)
    engine.start()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(engine.playing).toBe(false)
    expect(onStop).toHaveBeenCalledWith('hidden')
    expect(gate().at(-1)).toEqual({ method: 'setTargetAtTime', args: [0, context.currentTime, expect.any(Number)] })

    // And nothing more is booked once stopped.
    const booked = gate().length
    vi.advanceTimersByTime(1000)
    expect(gate()).toHaveLength(booked)
    expect(context.suspend).toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  })

  it('lets one sequencer sound at a time', () => {
    const first = vi.fn()
    const a = engineOn(DEFAULT_PATTERN, first)
    const b = engineOn()
    a.start()
    b.start()
    expect(a.playing).toBe(false)
    expect(first).toHaveBeenCalledWith('replaced')
    expect(b.playing).toBe(true)
    b.stop()
  })

  it('reports the step sounding now, and −1 when stopped', () => {
    const engine = engineOn({ ...DEFAULT_PATTERN, bpm: 120 })
    expect(engine.position()).toBe(-1)
    engine.start()
    expect(engine.position()).toBe(-1)
    advance(0.05 + 0.125 + 0.01)
    expect(engine.position()).toBe(1)
    engine.stop()
    expect(engine.position()).toBe(-1)
  })

  it('lets go of the oscillator after the release when disposed', () => {
    const engine = engineOn()
    engine.start()
    engine.dispose()
    expect(engine.playing).toBe(false)
    expect(node('oscillator').stop).toHaveBeenCalledWith(expect.any(Number))
    engine.start()
    expect(engine.playing).toBe(false)
  })
})
