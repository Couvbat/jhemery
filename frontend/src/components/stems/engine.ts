import { cutoffHz, gains, type Mix } from './mix'

/**
 * The stems mixer's audio: one looping buffer source per stem, each through its own fader,
 * all into one low-pass, a limiter and the speakers. Every source starts at the same
 * `when` and offset, so the stems stay sample-locked however long they loop, which separate
 * `<audio>` elements can't promise.
 *
 * There is no master cut, unlike `acid`'s: the stems of a mastered track sum back to the
 * master, so with every fader at the top the mix is the release as it was mastered, and no
 * setting gets louder than that. The limiter is there for the peaks a filter's slope can
 * add, not to tame the level.
 *
 * Nothing sounds until `play()`, which only a click calls, and a hidden tab stops it, as
 * it stops `acid`.
 */

/** The time constant every change ramps over: long enough to never click, short enough to feel immediate. */
const RAMP_TC = 0.015
/** Sources start this far ahead, so all of them are booked before the first one sounds. */
const START_AHEAD_S = 0.05

export type StopReason = 'user' | 'hidden'

export interface StemsEngine {
  play: () => void
  pause: () => void
  readonly playing: boolean
  /** Seconds into the loop, by the audio clock. */
  position: () => number
  readonly length: number
  set: (mix: Mix) => void
  /** Stops, and lets go of every node. The context is the caller's to close. */
  dispose: () => void
}

export function createStemsEngine(
  context: AudioContext,
  buffers: readonly AudioBuffer[],
  initial: Mix,
  options: { onStop?: (reason: StopReason) => void } = {},
): StemsEngine {
  // The shortest, should an encoder have padded one file: the loop has to fit every stem.
  const length = Math.min(...buffers.map((buffer) => buffer.duration))
  const faders = buffers.map(() => context.createGain())
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  // Butterworth: no resonant peak, so sweeping it never boosts anything.
  filter.Q.value = Math.SQRT1_2
  // Fades the whole mix in and out on play and pause, which would otherwise click.
  const transport = context.createGain()
  transport.gain.value = 0
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -1
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.002
  limiter.release.value = 0.1
  faders.forEach((fader) => fader.connect(filter))
  filter.connect(transport).connect(limiter).connect(context.destination)

  let sources: AudioBufferSourceNode[] = []
  /** The audio-clock time the loop's start sounded, or would have. */
  let startedAt = 0
  /** Where a paused loop picks up. */
  let offset = 0
  let playing = false
  let disposed = false
  let suspendTimer: number | undefined

  function apply(mix: Mix, at = context.currentTime) {
    gains(mix).forEach((gain, i) => faders[i]?.gain.setTargetAtTime(gain, at, RAMP_TC))
    filter.frequency.setTargetAtTime(cutoffHz(mix.cutoff), at, RAMP_TC)
  }
  // Straight to the first mix, rather than ramping up from silence when play is pressed.
  gains(initial).forEach((gain, i) => {
    if (faders[i]) faders[i].gain.value = gain
  })
  filter.frequency.value = cutoffHz(initial.cutoff)

  const position = () => (playing ? (((context.currentTime - startedAt) % length) + length) % length : offset)

  const onVisibility = () => {
    if (document.hidden) halt('hidden')
  }

  function halt(reason: StopReason, notify = true) {
    if (!playing) return
    offset = position()
    playing = false
    document.removeEventListener('visibilitychange', onVisibility)
    const now = context.currentTime
    transport.gain.cancelScheduledValues(now)
    transport.gain.setTargetAtTime(0, now, RAMP_TC)
    // Stopped once the fade has died away.
    for (const source of sources) source.stop(now + RAMP_TC * 6)
    sources = []
    window.clearTimeout(suspendTimer)
    suspendTimer = window.setTimeout(() => {
      if (!playing && context.state === 'running') void context.suspend().catch(() => {})
    }, 200)
    if (notify) options.onStop?.(reason)
  }

  return {
    play() {
      if (playing || disposed) return
      // Loaded after the visitor switched tabs: no `visibilitychange` is coming to stop it.
      if (document.hidden) {
        options.onStop?.('hidden')
        return
      }
      window.clearTimeout(suspendTimer)
      void context.resume().catch(() => {})
      const when = context.currentTime + START_AHEAD_S
      sources = buffers.map((buffer, i) => {
        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.loopEnd = length
        source.connect(faders[i]!)
        source.start(when, offset)
        return source
      })
      startedAt = when - offset
      transport.gain.cancelScheduledValues(when)
      transport.gain.setValueAtTime(0, when)
      transport.gain.setTargetAtTime(1, when, RAMP_TC)
      playing = true
      document.addEventListener('visibilitychange', onVisibility)
    },
    pause: () => halt('user'),
    get playing() {
      return playing
    },
    position,
    length,
    set: (mix) => apply(mix),
    dispose() {
      if (disposed) return
      halt('user', false)
      disposed = true
      window.clearTimeout(suspendTimer)
      for (const node of [...faders, filter, transport, limiter]) node.disconnect()
    },
  }
}
