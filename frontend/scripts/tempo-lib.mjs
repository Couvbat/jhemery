/**
 * A track's tempo and first beat from its audio, for `content/music.ts`'s `tempos`
 * (`npm run tempos`). SoundCloud's frame can't be heard from the page and its waveform is
 * 100 ms a point, too coarse for a beat, so the beat is found here, once, from the audio
 * itself, and the page follows the widget's position against it.
 *
 * What it assumes: one tempo for the whole track, as a DAW export has. What it does:
 *
 * 1. **Onsets.** Spectral flux on a mono signal at 11 025 Hz (512-point frames every
 *    128 samples, 11.6 ms): how much louder each frequency got since the last frame,
 *    log-compressed so the hats count beside the kick, less its local mean.
 * 2. **Tempo.** The envelope's autocorrelation, read through a comb of the beat's first
 *    four multiples, over one octave (110 to 220 BPM by default). One octave so a tempo
 *    and its half or double can't both be candidates: an offbeat bass, the genre's
 *    commonest pattern, makes the half-beat nearly as strong as the beat.
 * 3. **Grid.** The beat grid that lines up best with the onsets over the whole track,
 *    tempo to a hundredth of a BPM and phase to a quarter frame: at 170 BPM a hundredth
 *    drifts 14 ms over four minutes. A whole BPM within half a percent of the best fit is
 *    taken instead, since that is what a producer sets.
 * 4. **First beat.** The grid's beat nearest the first onset, taken for a downbeat: a
 *    track rendered from its first bar starts on one. If the ripples land a beat late,
 *    `firstBeatMs` moves by one beat's length.
 *
 * Plain JavaScript and no dependency, so the script runs it as it is and the unit suite
 * drives it on synthetic tracks (`src/components/__tests__/tempo-lib.spec.ts`).
 */

import { URL } from 'node:url'

export const ANALYSIS_RATE = 11_025
const WINDOW = 512
const HOP = 128
/** Onset frames a second. */
export const FRAME_RATE = ANALYSIS_RATE / HOP
/**
 * How far after a frame's start the onset it reports falls, in seconds: a Hann window
 * weighs its middle, so a kick shows most once it reaches it. Measured against synthetic
 * kicks of known start (the spec's), not derived.
 */
const FRAME_LAG = 0.031

export const DEFAULT_RANGE = /** @type {const} */ ([110, 220])

/** An in-place radix-2 FFT. */
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k += 1) {
        const cos = Math.cos(step * k)
        const sin = Math.sin(step * k)
        const a = start + k
        const b = a + size / 2
        const tr = re[b] * cos - im[b] * sin
        const ti = re[b] * sin + im[b] * cos
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

/** The kick's band, 43 to 130 Hz: bins 2 to 6 of a 512-point frame at 11 025 Hz. */
const LOW_BINS = [2, 6]
/**
 * The kick's body, 21 to 64 Hz: bins 1 to 3, read as energy rather than as a rise. What a
 * rise sees first is an attack, and an offbeat bass's is as sharp as a kick's; what stays
 * down there for the next tens of milliseconds is the kick.
 */
const SUB_BINS = [1, 3]
/** Frames after a beat the body is read over: 12 to 70 ms. */
const BODY_FRAMES = [1, 6]

/**
 * The onset envelopes of mono samples at `ANALYSIS_RATE`, one value per frame, 0–1: over
 * the whole spectrum, and over the kick's band alone, which tells a beat from its offbeat.
 */
export function onsets(samples) {
  const frames = Math.max(0, Math.floor((samples.length - WINDOW) / HOP) + 1)
  const flux = new Float32Array(frames)
  const lowFlux = new Float32Array(frames)
  const sub = new Float32Array(frames)
  const window = Float32Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)))
  const re = new Float64Array(WINDOW)
  const im = new Float64Array(WINDOW)
  let previous = new Float32Array(WINDOW / 2)
  let current = new Float32Array(WINDOW / 2)
  const lowPrevious = new Float32Array(LOW_BINS[1] + 1)
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = frame * HOP
    for (let i = 0; i < WINDOW; i += 1) {
      re[i] = samples[offset + i] * window[i]
      im[i] = 0
    }
    fft(re, im)
    let sum = 0
    let low = 0
    for (let bin = 1; bin < WINDOW / 2; bin += 1) {
      const magnitude = Math.hypot(re[bin], im[bin])
      current[bin] = Math.log1p(100 * magnitude)
      // From silence before the first frame: a track that starts on its first kick has one.
      sum += Math.max(0, current[bin] - previous[bin])
      // The kick's band unlogged: compressed, the noise before the music rose as far as a kick.
      if (bin >= LOW_BINS[0] && bin <= LOW_BINS[1]) {
        low += Math.max(0, magnitude - lowPrevious[bin])
        lowPrevious[bin] = magnitude
      }
      if (bin >= SUB_BINS[0] && bin <= SUB_BINS[1]) sub[frame] += magnitude
    }
    flux[frame] = sum
    lowFlux[frame] = low
    ;[previous, current] = [current, previous]
  }
  return { all: detrend(flux), low: detrend(lowFlux), sub }
}

/** The mean energy in the kick's body just after each beat of a grid. */
function bodyOn(sub, bpm, phase) {
  const period = (FRAME_RATE * 60) / bpm
  let sum = 0
  let count = 0
  for (let position = phase; position + BODY_FRAMES[1] < sub.length; position += period) {
    for (let i = BODY_FRAMES[0]; i <= BODY_FRAMES[1]; i += 1) sum += at(sub, position + i)
    count += 1
  }
  return count ? sum / count : 0
}

/** The whole-spectrum envelope alone. */
export function onsetEnvelope(samples) {
  return onsets(samples).all
}

/** Less the local mean over ~0.4 s, so a loud section doesn't read as one long onset; then 0–1. */
function detrend(flux) {
  const frames = flux.length
  const half = Math.round(0.2 * FRAME_RATE)
  const out = new Float32Array(frames)
  let running = 0
  for (let i = 0; i < Math.min(frames, half); i += 1) running += flux[i]
  let max = 0
  for (let i = 0; i < frames; i += 1) {
    if (i + half < frames) running += flux[i + half]
    if (i - half - 1 >= 0) running -= flux[i - half - 1]
    const count = Math.min(frames, i + half + 1) - Math.max(0, i - half)
    out[i] = Math.max(0, flux[i] - running / count)
    if (out[i] > max) max = out[i]
  }
  if (max) for (let i = 0; i < frames; i += 1) out[i] /= max
  return out
}

/** The envelope at a fractional frame, between its two nearest. */
function at(env, position) {
  const i = Math.floor(position)
  if (i < 0 || i + 1 >= env.length) return 0
  return env[i] + (env[i + 1] - env[i]) * (position - i)
}

function autocorrelation(env, maxLag) {
  const ac = new Float64Array(maxLag + 2)
  for (let lag = 1; lag <= maxLag + 1; lag += 1) {
    let sum = 0
    for (let i = 0; i + lag < env.length; i += 1) sum += env[i] * env[i + lag]
    ac[lag] = sum / Math.max(1, env.length - lag)
  }
  return ac
}

/** The tempo the envelope's periodicity points to, within one octave, to half a BPM. */
export function roughTempo(env, [min, max] = DEFAULT_RANGE) {
  const longest = Math.ceil((FRAME_RATE * 60 * 4) / min) + 2
  const ac = autocorrelation(env, Math.min(longest, env.length - 2))
  const read = (lag) => {
    const i = Math.floor(lag)
    return i + 1 < ac.length ? ac[i] + (ac[i + 1] - ac[i]) * (lag - i) : 0
  }
  let best = { bpm: min, score: -Infinity }
  for (let bpm = min; bpm < max; bpm += 0.5) {
    const lag = (FRAME_RATE * 60) / bpm
    const score = read(lag) + read(2 * lag) / 2 + read(3 * lag) / 3 + read(4 * lag) / 4
    if (score > best.score) best = { bpm, score }
  }
  return best.bpm
}

/** How well a grid of `bpm` from `phase` (frames) lines up with the onsets: the mean onset on its beats. */
export function gridScore(env, bpm, phase) {
  const period = (FRAME_RATE * 60) / bpm
  let sum = 0
  let count = 0
  for (let position = phase; position < env.length - 1; position += period) {
    sum += at(env, position)
    count += 1
  }
  return count ? sum / count : 0
}

/** The best phase for `bpm`, at a quarter frame, with its score. */
function bestPhase(env, bpm) {
  const period = (FRAME_RATE * 60) / bpm
  let best = { phase: 0, score: -Infinity }
  for (let phase = 0; phase < period; phase += 0.25) {
    const score = gridScore(env, bpm, phase)
    if (score > best.score) best = { phase, score }
  }
  return best
}

/** The grid around a rough tempo: to a hundredth of a BPM, or the whole BPM that fits as well. */
export function fitGrid(env, rough) {
  let best = { bpm: rough, ...bestPhase(env, rough) }
  const search = (from, to, step) => {
    for (let bpm = from; bpm <= to + 1e-9; bpm += step) {
      const fit = bestPhase(env, bpm)
      if (fit.score > best.score) best = { bpm, ...fit }
    }
  }
  search(rough - 1.5, rough + 1.5, 0.05)
  const coarse = best.bpm
  search(coarse - 0.05, coarse + 0.05, 0.01)
  // Within 2 % of the best fit's score: half a BPM off (128 for 128.5) misses by a tenth of
  // a second within half a minute and scores far lower, while a hundredth's noise doesn't.
  const whole = Math.round(best.bpm)
  const wholeFit = bestPhase(env, whole)
  if (wholeFit.score >= best.score * 0.98) best = { bpm: whole, ...wholeFit }
  return { bpm: Math.round(best.bpm * 100) / 100, phase: best.phase, score: best.score }
}

/**
 * How sure the fit is: its grid's score against the same tempo's offbeat grid. A clear
 * beat scores several times its offbeat; near 1, there is no beat to speak of.
 */
function confidence(env, bpm, phase, score) {
  const period = (FRAME_RATE * 60) / bpm
  const off = gridScore(env, bpm, phase + period / 2)
  return off > 0 ? score / off : score > 0 ? Infinity : 0
}

/**
 * A track's tempo, first beat and how sure the fit is, from mono samples at
 * `ANALYSIS_RATE`; null for a track with no onsets at all.
 */
export function detectTempo(samples, range = DEFAULT_RANGE) {
  const { all: env, low, sub } = onsets(samples)
  if (!env.some((value) => value > 0)) return null
  const rough = roughTempo(env, range)
  const fit = fitGrid(env, rough)
  const { bpm, score } = fit
  const period = (FRAME_RATE * 60) / bpm
  // The grid lines up as well on an offbeat bass or hats as on the kick, so of the beat and
  // its offbeat, the one with more of the kick's body after it is the beat.
  const phase = bodyOn(sub, bpm, fit.phase + period / 2) > bodyOn(sub, bpm, fit.phase) ? fit.phase + period / 2 : fit.phase
  const other = phase === fit.phase ? fit.phase + period / 2 : fit.phase
  return {
    bpm,
    firstBeatMs: firstKick(low, bpm, phase),
    // The offbeat's, for when the pulses land between the kicks: a bass as low and as
    // long as the kick can still take the beat.
    offbeatMs: firstKick(low, bpm, other),
    confidence: Math.round(confidence(env, bpm, fit.phase, score) * 10) / 10,
  }
}

/**
 * The grid's first beat with a kick on it, in milliseconds: the first whose rise in the
 * kick's band is half the typical beat's. Read only on the grid, since between beats the
 * band's noise can rise as far before the music starts, and measured against the beats
 * rather than the loudest one, which may be the first and dwarf the rest.
 */
function firstKick(low, bpm, phase) {
  const period = (FRAME_RATE * 60) / bpm
  const lag = FRAME_LAG * FRAME_RATE
  // The earliest beat at or after the track's start, give or take a frame and a half: a
  // kick at 0 ms sits on that boundary, and rounding put it either side.
  const start = phase - Math.floor((phase + lag + 1.5) / period) * period
  const strength = (position) => {
    let most = 0
    const from = Math.max(0, Math.floor(position) - 1)
    for (let i = from; i <= Math.min(low.length - 1, Math.floor(position) + 3); i += 1) most = Math.max(most, low[i])
    return most
  }
  const beats = []
  for (let position = start; position < low.length; position += period) beats.push({ position, strength: strength(position) })
  const sorted = beats.map((beat) => beat.strength).sort((a, b) => a - b)
  const typical = sorted[Math.floor(sorted.length / 2)] ?? 0
  const first = beats.find((beat) => beat.strength >= typical / 2) ?? beats[0]
  return first ? Math.max(0, Math.round((first.position / FRAME_RATE + FRAME_LAG) * 1000)) : 0
}

/** `110-220` into a range, or null if it isn't one an octave wide or less. */
export function parseRange(value) {
  const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(String(value))
  if (!match) return null
  const [min, max] = [Number(match[1]), Number(match[2])]
  return min >= 30 && max > min && max <= 2 * min + 1e-9 && max <= 400 ? [min, max] : null
}

/** A track's path on soundcloud.com, `/couvbat/track`, from its URL; null for a set or anything else. */
export function soundcloudPath(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !/(^|\.)soundcloud\.com$/.test(parsed.hostname)) return null
    const path = parsed.pathname.replace(/\/+$/, '')
    return /^\/[^/]+\/[^/]+$/.test(path) && !path.includes('/sets') ? path : null
  } catch {
    return null
  }
}

/** Either line ending: a Windows checkout has the file in CRLF. */
const DECLARATION = /export const tempos: Readonly<Record<string, Tempo>> = \{[^]*?\r?\n?\}\r?\n/

/**
 * `content/music.ts` with `entries` merged into its `tempos`, keyed and sorted by path,
 * every other line as it was. Throws if the declaration isn't where it was left.
 */
export function writeTempos(source, entries) {
  const found = DECLARATION.exec(source)
  if (!found) throw new Error('content/music.ts: no `export const tempos` declaration to write into')
  const merged = new Map()
  for (const match of found[0].matchAll(/'([^']+)': \{ bpm: ([\d.]+), firstBeatMs: (\d+) \}/g)) {
    merged.set(match[1], { bpm: Number(match[2]), firstBeatMs: Number(match[3]) })
  }
  for (const [path, tempo] of Object.entries(entries)) merged.set(path, { bpm: tempo.bpm, firstBeatMs: tempo.firstBeatMs })
  const eol = found[0].endsWith('\r\n') ? '\r\n' : '\n'
  const lines = [...merged]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, tempo]) => `  '${path}': { bpm: ${tempo.bpm}, firstBeatMs: ${tempo.firstBeatMs} },`)
  const declaration = lines.length
    ? `export const tempos: Readonly<Record<string, Tempo>> = {${eol}${lines.join(eol)}${eol}}${eol}`
    : `export const tempos: Readonly<Record<string, Tempo>> = {}${eol}`
  return source.slice(0, found.index) + declaration + source.slice(found.index + found[0].length)
}
