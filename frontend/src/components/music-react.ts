/**
 * How the wireframe field reacts to the music playing on the site
 * (`docs/superpowers/specs/2026-10-15-music-reactive-field-design.md`), as one pure function
 * like `ripple.ts`: from what the source gives this frame, the time and the motion level, to
 * a handful of numbers `ThreeBackground` multiplies in. It holds its envelopes in a few
 * preallocated numbers and allocates nothing; every envelope runs on elapsed time, so 30
 * and 60 frames a second move the same.
 *
 * **No flashing.** The music here runs at 150 to 200 BPM, three beats a second and more,
 * which is exactly where flashing becomes a seizure risk (WCAG 2.3.1). So beats move
 * geometry, never light: the scale pulse and the downbeat ripple follow the beat, and
 * opacity follows only the level, within +10 %, through a 600 ms envelope both ways, so it
 * can't swing at beat rate. Colour never follows the music at all.
 *
 * **Stronger than the spec's first bounds**, on the owner's call after trying it (#160):
 * at ×1.6 and +6 % a SoundCloud track, which has no beat without a hand-entered tempo,
 * moved the field too little to see. Geometry only; light keeps its bounds above. A surge,
 * the level leaping well over where it has settled as a drop does, sends a ripple at
 * `wall`'s full strength, at most every three seconds (a build-up's and its drop's both
 * land, and one never cuts another short), so a drop is seen to land.
 */

/** The level envelope: quick enough to feel, slow enough to never twitch. */
export const ATTACK_MS = 250
export const RELEASE_MS = 600
/** How fast the field drifts at full level, and with a source that can't be heard. */
export const MAX_SPEED = 2.2
export const PLAYING_SPEED = 1.2
/** Calm's ceiling stays the spec's: a visitor who asked for less motion gets the old bound. */
export const CALM_MAX_SPEED = 1.6
/** The low band's slow breath, and each beat's pulse, on the shapes' scale. */
export const MAX_BREATH = 0.15
export const MAX_PULSE = 0.04
/** The slow envelope a surge is measured against, and how far and how high the level must leap. */
export const SETTLE_MS = 3_000
export const SURGE_RISE = 0.35
export const SURGE_FLOOR = 0.6
export const SURGE_EVERY_MS = 3_000
/** How quickly a beat's pulse eases out. */
export const PULSE_MS = 120
/** The level's most on opacity, through its slowest envelope only. */
export const MAX_OPACITY = 0.1
/** A downbeat ripple at most this often, at a third of `wall`'s amplitude. */
export const RIPPLE_EVERY_MS = 1_500
export const RIPPLE_SHARE = 1 / 3
/** The loop's reference frame, as `ThreeBackground` measures `f` against it. */
export const REFERENCE_MS = 1000 / 60

export interface MusicReaction {
  /** On the drift, beside the weather's and the season's: ×1 to ×2.2 (×1.6 at calm). */
  speed: number
  /** On every shape's scale: the breath and the beat pulse together, at most +19 %. */
  scale: number
  /** On the shapes' opacity: 1 to 1.1, from the level alone. */
  opacity: number
  /** A downbeat ripple starts this frame, at a third of `wall`'s strength. */
  ripple: boolean
  /** A surge starts this frame: a ripple at `wall`'s full strength. */
  surge: boolean
}

/** What the background read from the current source this frame. */
export interface MusicInput {
  /** RMS of the spectrum, 0–1; null when the source can't be heard (SoundCloud). */
  level: number | null
  /** The low band (the kick and the bass), 0–1; null when it can't be heard. */
  low: number | null
  /** Beats since the first downbeat; null without a tempo. */
  beats: number | null
  beatsPerBar: number
}

export interface MusicReactState {
  level: number
  low: number
  /** The slow envelope opacity follows: the release's time both ways. */
  glow: number
  /** Where the level has settled, over `SETTLE_MS`: what a surge leaps from. */
  settled: number
  pulse: number
  /** The beat last seen, floored, or null. */
  beat: number | null
  lastRipple: number
  lastSurge: number
  out: MusicReaction
}

export function createMusicReact(): MusicReactState {
  return {
    level: 0,
    low: 0,
    glow: 0,
    settled: 0,
    pulse: 0,
    beat: null,
    lastRipple: -Infinity,
    lastSurge: -Infinity,
    out: { speed: 1, scale: 1, opacity: 1, ripple: false, surge: false },
  }
}

/** One step of a one-pole envelope over `dt` ms, rising with `attack` and falling with `release`. */
function follow(current: number, target: number, dt: number, attack: number, release: number): number {
  const tc = target > current ? attack : release
  return current + (target - current) * (1 - Math.exp(-dt / tc))
}

/**
 * Moves the reaction on by one frame `f` reference frames long and returns it (the same
 * object every time). `input` null is no music. At *calm* only the level reaches the speed;
 * at *paused* nothing moves at all, and the background isn't loaded then anyway.
 */
export function reactToMusic(
  state: MusicReactState,
  input: MusicInput | null,
  now: number,
  f: number,
  motion: 'full' | 'calm' | 'paused',
): MusicReaction {
  const out = state.out
  const dt = f * REFERENCE_MS
  out.ripple = out.surge = false
  if (motion === 'paused') {
    state.level = state.low = state.glow = state.settled = state.pulse = 0
    state.beat = null
    out.speed = out.scale = out.opacity = 1
    return out
  }

  // A source that can't be heard (nor read off a waveform) lifts the field to ×1.2.
  const heard = input?.level ?? (input ? (PLAYING_SPEED - 1) / (MAX_SPEED - 1) : 0)
  state.level = follow(state.level, heard, dt, ATTACK_MS, RELEASE_MS)

  if (motion === 'calm') {
    // Calm is for a visitor who wants the page to move less, and a beat is movement.
    out.speed = 1 + (CALM_MAX_SPEED - 1) * state.level
    state.low = state.pulse = state.glow = 0
    state.settled = state.level
    state.beat = null
    out.scale = out.opacity = 1
    return out
  }
  out.speed = 1 + (MAX_SPEED - 1) * state.level

  // A drop lands: the level well over where it had settled. Read only off a real level,
  // never the constant lift, and measured before the slow envelope catches up.
  if (
    input?.level != null &&
    state.level >= SURGE_FLOOR &&
    state.level - state.settled >= SURGE_RISE &&
    now - state.lastSurge >= SURGE_EVERY_MS
  ) {
    out.surge = true
    state.lastSurge = now
  }
  state.settled = follow(state.settled, state.level, dt, SETTLE_MS, SETTLE_MS)

  state.low = follow(state.low, input?.low ?? 0, dt, ATTACK_MS, RELEASE_MS)
  state.glow = follow(state.glow, input?.level ?? 0, dt, RELEASE_MS, RELEASE_MS)
  state.pulse *= Math.exp(-dt / PULSE_MS)

  const beats = input?.beats
  if (beats === null || beats === undefined || !Number.isFinite(beats)) {
    state.beat = null
  } else {
    const beat = Math.floor(beats)
    if (state.beat !== null && beat !== state.beat) {
      state.pulse = 1
      const bar = input!.beatsPerBar > 0 ? input!.beatsPerBar : 4
      if (((beat % bar) + bar) % bar === 0 && now - state.lastRipple >= RIPPLE_EVERY_MS) {
        out.ripple = true
        state.lastRipple = now
      }
    }
    state.beat = beat
  }

  out.scale = 1 + MAX_BREATH * state.low + MAX_PULSE * state.pulse
  out.opacity = 1 + MAX_OPACITY * state.glow
  return out
}

/** The spectrum's RMS, 0–1, read in place. */
export function levelOf(bins: Uint8Array): number {
  if (!bins.length) return 0
  let sum = 0
  for (let i = 0; i < bins.length; i += 1) sum += (bins[i]! / 255) ** 2
  return Math.sqrt(sum / bins.length)
}

/**
 * The low band, 0–1: the first few bins, under about 500 Hz at 48 kHz and a 256-point
 * FFT, where the kick and the bass are.
 */
export function lowOf(bins: Uint8Array, count = 3): number {
  const n = Math.min(count, bins.length)
  if (!n) return 0
  let sum = 0
  for (let i = 0; i < n; i += 1) sum += bins[i]!
  return sum / (n * 255)
}

/** What x-ray's canvas tag says the field is following: `listening to acid, 138 BPM`. */
export function listeningTo(source: { id: string; bpm: number | null } | null, locale: 'en' | 'fr'): string {
  if (!source) return ''
  const tempo = source.bpm ? `, ${Math.round(source.bpm)} BPM` : ''
  return `${locale === 'fr' ? 'à l’écoute de' : 'listening to'} ${source.id}${tempo}`
}
