/**
 * An acid pattern, and the code that carries it in a link. The link is the save file:
 * nothing is stored anywhere else, so whatever arrives in `?p=` or after `acid` is
 * someone else's bytes, and `decode` treats them that way — it clamps every field
 * rather than trusting the encoder that wrote them, and refuses a version it doesn't
 * know rather than guessing at its layout.
 *
 * The code is 27 bytes, written as base64url (36 characters):
 *
 * | byte  | holds |
 * |-------|-------|
 * | 0     | the version, 1 |
 * | 1–18  | 16 steps × 9 bits, most significant first: on, accent, slide, octave (2), note (4) |
 * | 19    | the tempo, `bpm − 60` |
 * | 20    | the wave in bit 7, the root in bits 0–3 |
 * | 21–26 | the six knobs, a byte each |
 */

export const VERSION = 1
export const STEPS = 16
export const BYTES = 27
export const MIN_BPM = 60
/** 300 bpm reaches hardcore and gabber (180–250) with room above. */
export const MAX_BPM = 300
/** Semitones above the root a step may sit: the 303's keyboard, C to the next C. */
export const MAX_NOTE = 12

export type Wave = 'saw' | 'square'
export type Octave = -1 | 0 | 1

export interface Step {
  on: boolean
  accent: boolean
  slide: boolean
  octave: Octave
  /** Semitones above the root, 0–12. */
  note: number
}

export const KNOBS = ['cutoff', 'resonance', 'envMod', 'decay', 'accent', 'drive'] as const
export type Knob = (typeof KNOBS)[number]

export interface Pattern {
  steps: Step[]
  bpm: number
  wave: Wave
  /** Pitch class of the root, 0 = C … 11 = B. */
  root: number
  /** Each 0–255; what a byte means in hertz or decibels is the engine's business. */
  knobs: Record<Knob, number>
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Semitones of the phrygian mode, plus the octave: the flat second is the acid sound. */
export const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10, 12] as const

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? Math.round(value) : min))

const step = (note: number, octave: Octave = 0, flags = ''): Step => ({
  on: true,
  accent: flags.includes('a'),
  slide: flags.includes('s'),
  octave,
  note,
})
const rest: Step = { on: false, accent: false, slide: false, octave: 0, note: 0 }

/** What the tool opens on and what a bare `acid` plays: a line in A phrygian. */
export const DEFAULT_PATTERN: Pattern = {
  steps: [
    step(0, 0, 'a'), step(0, 1), step(0, 0, 's'), step(3),
    step(0, 0, 'a'), rest, step(10, -1, 's'), step(0),
    step(0, 0, 'a'), step(7), step(5, 0, 's'), step(3),
    step(1, 0, 'a'), rest, step(0, 1, 'as'), step(0),
  ],
  bpm: 135,
  wave: 'saw',
  root: 9,
  knobs: { cutoff: 70, resonance: 200, envMod: 160, decay: 110, accent: 180, drive: 70 },
}

export function clonePattern(pattern: Pattern): Pattern {
  return { ...pattern, steps: pattern.steps.map((s) => ({ ...s })), knobs: { ...pattern.knobs } }
}

// base64url, unpadded. Hand-rolled over btoa/atob rather than borrowed from the encode
// tool, which is about UTF-8 text and would turn these bytes into characters first.
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}

export function encode(pattern: Pattern): string {
  const bytes = new Uint8Array(BYTES)
  bytes[0] = VERSION

  let bit = 8
  const write = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i--, bit++) {
      if ((value >> i) & 1) bytes[bit >> 3]! |= 0x80 >> (bit & 7)
    }
  }
  for (let i = 0; i < STEPS; i++) {
    const s = pattern.steps[i] ?? rest
    write(s.on ? 1 : 0, 1)
    write(s.accent ? 1 : 0, 1)
    write(s.slide ? 1 : 0, 1)
    write(clamp(s.octave, -1, 1) + 1, 2)
    write(clamp(s.note, 0, MAX_NOTE), 4)
  }

  bytes[19] = clamp(pattern.bpm, MIN_BPM, MAX_BPM) - MIN_BPM
  bytes[20] = (pattern.wave === 'square' ? 0x80 : 0) | clamp(pattern.root, 0, 11)
  KNOBS.forEach((knob, i) => (bytes[21 + i] = clamp(pattern.knobs[knob], 0, 255)))
  return toBase64Url(bytes)
}

/** Longer than any code this version writes, so a pasted paragraph is refused before
 *  it is decoded rather than after. */
const MAX_CODE = 64

/**
 * The pattern a code holds, or `null` when it isn't one: wrong alphabet, too long, too
 * short, or a version this build doesn't know. Every field that survives is clamped to
 * what the engine can play, so no code, however it was made, reaches it out of range.
 */
export function decode(code: string): Pattern | null {
  const text = code.trim().replace(/=+$/, '')
  if (text.length > MAX_CODE || !/^[A-Za-z0-9_-]*$/.test(text)) return null
  const bytes = fromBase64Url(text)
  if (!bytes || bytes.length < BYTES || bytes[0] !== VERSION) return null

  let bit = 8
  const read = (width: number) => {
    let value = 0
    for (let i = 0; i < width; i++, bit++) value = (value << 1) | ((bytes[bit >> 3]! >> (7 - (bit & 7))) & 1)
    return value
  }
  const steps = Array.from({ length: STEPS }, (): Step => ({
    on: read(1) === 1,
    accent: read(1) === 1,
    slide: read(1) === 1,
    // Two bits hold four values and only three are octaves; the fourth reads as up.
    octave: (Math.min(read(2), 2) - 1) as Octave,
    note: Math.min(read(4), MAX_NOTE),
  }))

  return {
    steps,
    bpm: Math.min(MIN_BPM + bytes[19]!, MAX_BPM),
    wave: bytes[20]! & 0x80 ? 'square' : 'saw',
    root: Math.min(bytes[20]! & 0x0f, 11),
    knobs: Object.fromEntries(KNOBS.map((knob, i) => [knob, bytes[21 + i]!])) as Record<Knob, number>,
  }
}

/**
 * New steps in phrygian over `base`'s sound: the tempo, wave, root and knobs stay as the
 * visitor set them, since those are the part a randomise shouldn't throw away. The
 * first step always plays, so the loop has a downbeat to hang off.
 */
export function randomise(base: Pattern, random: () => number = Math.random): Pattern {
  const steps = Array.from({ length: STEPS }, (_, i): Step => {
    const octaveRoll = random()
    return {
      on: i === 0 || random() < 0.75,
      accent: random() < 0.25,
      slide: random() < 0.2,
      octave: octaveRoll < 0.15 ? -1 : octaveRoll > 0.85 ? 1 : 0,
      note: PHRYGIAN[Math.min(PHRYGIAN.length - 1, Math.floor(random() * PHRYGIAN.length))]!,
    }
  })
  return { ...clonePattern(base), steps }
}

/** Sixteenth notes: four steps to the beat. */
export function stepDuration(bpm: number): number {
  return 15 / clamp(bpm, MIN_BPM, MAX_BPM)
}

export interface StepTime {
  /** 0–15. */
  step: number
  /** Seconds, on the audio clock. */
  time: number
}

/**
 * One scheduler tick: every step that starts before `until`, counting on from `from`,
 * and where the count picks up next time. The tempo is read per tick rather than fixed
 * at the start, so dragging it moves the next step instead of rewriting the past.
 */
export function stepTimes(from: StepTime, bpm: number, until: number): { steps: StepTime[]; next: StepTime } {
  const duration = stepDuration(bpm)
  const steps: StepTime[] = []
  let { step: index, time } = from
  while (time < until) {
    steps.push({ step: index, time })
    index = (index + 1) % STEPS
    time += duration
  }
  return { steps, next: { step: index, time } }
}

/** The root sits in the octave from C2 (MIDI 36, 65 Hz), so a step spans C1 to B4. */
const BASE_MIDI = 36

/** A step's pitch as a MIDI note number. */
export function midiOf(pattern: Pattern, s: Step): number {
  return BASE_MIDI + pattern.root + s.note + 12 * s.octave
}

/** `A2`, `C#3`: scientific pitch, as the grid and the shell print a step. */
export function pitchName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
}

/** A step's distance from the root in semitones, octave included: −12 to 24. */
export function offsetOf(s: Step): number {
  return s.note + 12 * s.octave
}

/** The octave and note that sit `offset` semitones from the root. The top of the range
 *  is the one place a note past 11 is written, since there is no octave above it. */
export function fromOffset(offset: number): Pick<Step, 'octave' | 'note'> {
  const clamped = clamp(offset, -12, 24)
  if (clamped >= 12) return { octave: 1, note: clamped - 12 }
  if (clamped >= 0) return { octave: 0, note: clamped }
  return { octave: -1, note: clamped + 12 }
}
