import { midiOf, stepDuration, stepTimes, STEPS, type Knob, type Pattern, type StepTime } from './pattern'

/**
 * The acid voice: one oscillator → a resonant low-pass → a `tanh` shaper → the amp →
 * master at −12 dB → a compressor set as a limiter. Plain Web Audio nodes, and no
 * `AudioWorklet`: a worklet's module is loaded as a script, and one built at runtime
 * from a `blob:` URL is refused by the production `script-src`.
 *
 * The oscillator is started once and never stopped while the engine lives, so a slide
 * is the same oscillator gliding, as on the 303, and the amp gate is the only thing that
 * opens and closes. Steps are scheduled against `AudioContext.currentTime`, the audio
 * clock, by a timer that only decides *what* to schedule: every 25 ms it books each
 * step that starts in the next 120 ms. A late timer then costs nothing audible, and the
 * knobs still answer within a tenth of a second.
 */

export const TICK_MS = 25
export const LOOKAHEAD_S = 0.12
export const MASTER_DB = -12
/** A low-pass's `Q` is a resonance in decibels. 18 dB rings hard on every note without
 *  becoming a whistle at the cutoff, which is where a 303 knob stops being useful. */
export const MAX_RESONANCE_DB = 18

/** Of the step, how long a note's gate stays open when it doesn't slide. */
const GATE = 0.55
/** Time constants, in seconds: the attack is fast enough not to click, the release
 *  short enough that a rest is a rest. */
const ATTACK_TC = 0.002
const RELEASE_TC = 0.01
/** About 60 ms to reach the new pitch, near the 303's own slide. */
const SLIDE_TC = 0.02
const AMP = 0.45
const MAX_HZ = 18_000

const unit = (byte: number) => Math.min(1, Math.max(0, (Number.isFinite(byte) ? byte : 0) / 255))

/** What the six knob bytes mean, in the units the nodes take. */
export interface Voice {
  /** Hz. */
  cutoff: number
  /** dB. */
  resonance: number
  /** Octaves the filter envelope opens above the cutoff. */
  envMod: number
  /** Seconds: the envelope's time constant back down to the cutoff. */
  decay: number
  /** 0–1: how much louder and brighter an accented step is. */
  accent: number
  /** The shaper's slope at zero: 1 is clean, 10 is crushed. */
  drive: number
}

export function voiceOf(knobs: Record<Knob, number>): Voice {
  return {
    cutoff: 60 * 2 ** (unit(knobs.cutoff) * 7),
    resonance: unit(knobs.resonance) * MAX_RESONANCE_DB,
    envMod: unit(knobs.envMod) * 4,
    decay: 0.03 * 2 ** (unit(knobs.decay) * 4.5),
    accent: unit(knobs.accent),
    drive: 1 + unit(knobs.drive) * 9,
  }
}

/** `tanh(k·x)`, normalised so ±1 still maps to ±1: louder input saturates instead of
 *  clipping, and the filter's resonant peak is rounded off before it reaches the amp. */
export function shapeCurve(drive: number, samples = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples)
  const norm = Math.tanh(drive)
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1
    curve[i] = Math.tanh(drive * x) / norm
  }
  return curve
}

const frequencyOf = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Why playback stopped: the visitor, the tab going to the background (where timers are
 *  throttled to once a second, so the pattern would stutter), or another sequencer
 *  starting. */
export type StopReason = 'user' | 'hidden' | 'replaced'

export interface AcidEngine {
  start: () => void
  stop: () => void
  readonly playing: boolean
  /** The step sounding now, by the audio clock, or −1 when stopped. */
  position: () => number
  /** Stops, and lets go of every node. The context is the caller's to close. */
  dispose: () => void
}

/** At most one sequencer sounds at a time, whichever surface started it: the tool and
 *  the shell would otherwise play two patterns over each other. */
let sounding: { halt: (reason: StopReason) => void } | null = null

/**
 * `read` is called on every step, so the tool can hand over its reactive pattern and
 * every edit is heard on the next step booked; the shell hands over a fixed one.
 */
export function createEngine(
  context: AudioContext,
  read: () => Pattern,
  options: { onStop?: (reason: StopReason) => void } = {},
): AcidEngine {
  const oscillator = context.createOscillator()
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  const shaper = context.createWaveShaper()
  shaper.oversample = '2x'
  const amp = context.createGain()
  amp.gain.value = 0
  const master = context.createGain()
  master.gain.value = 10 ** (MASTER_DB / 20)
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.1

  const chain: AudioNode[] = [oscillator, filter, shaper, amp, master, limiter]
  chain.forEach((node, i) => node.connect(chain[i + 1] ?? context.destination))
  oscillator.start()

  let playing = false
  let disposed = false
  let timer: number | undefined
  let suspendTimer: number | undefined
  let cursor: StepTime = { step: 0, time: 0 }
  /** Whether the step last booked left its gate open for the next one to slide into. */
  let tied = false
  /** The last few steps booked, oldest first: what `position()` reads the clock against. */
  const booked: StepTime[] = []
  let drive = Number.NaN

  function book({ step, time }: StepTime, pattern: Pattern) {
    const voice = voiceOf(pattern.knobs)
    // A new curve only when the knob moved: this runs up to twenty times a second.
    if (voice.drive !== drive) {
      drive = voice.drive
      shaper.curve = shapeCurve(drive)
    }
    oscillator.type = pattern.wave === 'square' ? 'square' : 'sawtooth'
    filter.Q.setValueAtTime(voice.resonance, time)
    booked.push({ step, time })
    if (booked.length > 8) booked.shift()

    const current = pattern.steps[step]
    if (!current?.on) {
      // A rest closes the gate whatever the step before it promised. Its slide was booked
      // against a next step that may have been switched off since, and must not hold.
      amp.gain.setTargetAtTime(0, time, RELEASE_TC)
      tied = false
      return
    }

    const hz = frequencyOf(midiOf(pattern, current))
    if (tied) {
      // Slid into: the pitch glides and neither envelope retriggers, which is the slide.
      oscillator.frequency.setTargetAtTime(hz, time, SLIDE_TC)
    } else {
      const accent = current.accent ? voice.accent : 0
      oscillator.frequency.setValueAtTime(hz, time)
      amp.gain.cancelScheduledValues(time)
      amp.gain.setTargetAtTime(AMP * (1 + accent), time, ATTACK_TC)
      filter.frequency.cancelScheduledValues(time)
      filter.frequency.setTargetAtTime(Math.min(voice.cutoff * 2 ** (voice.envMod * (1 + accent)), MAX_HZ), time, ATTACK_TC)
      filter.frequency.setTargetAtTime(voice.cutoff, time + 0.005, voice.decay * (1 - accent / 2))
    }

    tied = current.slide && Boolean(pattern.steps[(step + 1) % STEPS]?.on)
    if (!tied) amp.gain.setTargetAtTime(0, time + stepDuration(pattern.bpm) * GATE, RELEASE_TC)
  }

  function tick() {
    const pattern = read()
    const now = context.currentTime
    // A timer that stalled for longer than the lookahead leaves the cursor in the past.
    // Pick up from now rather than booking every missed step at once.
    if (cursor.time < now) cursor = { step: cursor.step, time: now + 0.01 }
    const { steps, next } = stepTimes(cursor, pattern.bpm, now + LOOKAHEAD_S)
    for (const step of steps) book(step, pattern)
    cursor = next
  }

  const onVisibility = () => {
    if (document.hidden) halt('hidden')
  }

  function halt(reason: StopReason, notify = true) {
    if (!playing) return
    playing = false
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
    if (sounding?.halt === halt) sounding = null

    const now = context.currentTime
    amp.gain.cancelScheduledValues(now)
    amp.gain.setTargetAtTime(0, now, RELEASE_TC)
    filter.frequency.cancelScheduledValues(now)
    oscillator.frequency.cancelScheduledValues(now)
    booked.length = 0
    tied = false
    // Suspended once the release has died away, so a stopped sequencer holds no audio
    // thread and the tab stops reporting sound.
    window.clearTimeout(suspendTimer)
    suspendTimer = window.setTimeout(() => {
      if (!playing && context.state === 'running') void context.suspend().catch(() => {})
    }, 150)
    if (notify) options.onStop?.(reason)
  }

  const engine: AcidEngine = {
    start() {
      if (playing || disposed) return
      // Already in the background (the shell's chunks loaded after the visitor switched
      // tabs): no `visibilitychange` is coming to stop it, so it never starts.
      if (document.hidden) {
        options.onStop?.('hidden')
        return
      }
      if (sounding) sounding.halt('replaced')
      sounding = { halt }
      window.clearTimeout(suspendTimer)
      // A no-op when the caller's gesture already started it; when the engine stopped
      // it, this is the play button's own click resuming it.
      void context.resume().catch(() => {})
      cursor = { step: 0, time: context.currentTime + 0.05 }
      tied = false
      playing = true
      document.addEventListener('visibilitychange', onVisibility)
      tick()
      timer = window.setInterval(tick, TICK_MS)
    },
    stop: () => halt('user'),
    get playing() {
      return playing
    },
    position() {
      if (!playing) return -1
      const now = context.currentTime
      let at = -1
      for (const mark of booked) if (mark.time <= now) at = mark.step
      return at
    },
    dispose() {
      if (disposed) return
      halt('user', false)
      disposed = true
      window.clearTimeout(suspendTimer)
      // Stopped after the release rather than now, which would cut the note with a click.
      oscillator.stop(context.currentTime + 0.06)
      oscillator.onended = () => chain.forEach((node) => node.disconnect())
    },
  }
  return engine
}
