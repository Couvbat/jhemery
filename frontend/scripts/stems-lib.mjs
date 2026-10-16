/**
 * The pure parts of `scripts/stems.mjs` (`docs/superpowers/specs/2026-10-15-stems-vol2-design.md`
 * §1–2): times, bars, the checks on the inputs, the peaks, and the literal it prints. Kept
 * apart from the `ffmpeg` calls so `src/components/__tests__/stems-lib.spec.ts` drives them
 * without any audio.
 */
import { Buffer } from 'node:buffer'

/** `1:04.000`, `64`, `64.5` → seconds. */
export function parseTime(value) {
  if (typeof value === 'number') return value
  const parts = String(value).trim().split(':').map(Number)
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) throw new Error(`not a time: ${value}`)
  return parts.reduce((total, n) => total * 60 + n, 0)
}

/** How many bars `seconds` holds at `bpm`, four beats to the bar unless told otherwise. */
export function barsIn(seconds, bpm, beatsPerBar = 4) {
  return (seconds * bpm) / (60 * beatsPerBar)
}

/**
 * A warning when the excerpt isn't a whole number of bars: a loop that isn't jars at the
 * seam, and that is the one musical mistake a script can catch. Null when it is whole,
 * or when there is no tempo to count with.
 */
export function wholeBarWarning(seconds, bpm, beatsPerBar = 4) {
  if (!bpm) return null
  const bars = barsIn(seconds, bpm, beatsPerBar)
  if (Math.abs(bars - Math.round(bars)) < 1e-3) return null
  const nearest = Math.max(1, Math.round(bars))
  const fits = (nearest * 60 * beatsPerBar) / bpm
  return `${seconds} s is ${bars.toFixed(2)} bars at ${bpm} BPM: the loop will jar at the seam. ${nearest} bars is ${fits.toFixed(3)} s.`
}

/**
 * What is wrong with the probed inputs, as rows of a table: one sample rate, one length to
 * the millisecond, at most `maxStems`, and an excerpt that fits inside them.
 */
export function probeProblems(probes, { maxStems, start = 0, seconds }) {
  const problems = []
  if (probes.length < 2) problems.push(['stems', `${probes.length} found, at least 2 needed`])
  if (probes.length > maxStems) problems.push(['stems', `${probes.length} found, at most ${maxStems} fit a mix code`])
  const rates = new Set(probes.map((probe) => probe.sampleRate))
  if (rates.size > 1) {
    for (const probe of probes) problems.push([probe.file, `${probe.sampleRate} Hz; the stems disagree on the sample rate`])
  }
  const lengths = new Set(probes.map((probe) => Math.round(probe.duration * 1000)))
  if (lengths.size > 1) {
    for (const probe of probes) problems.push([probe.file, `${probe.duration.toFixed(3)} s; every stem must be the same length`])
  }
  const shortest = Math.min(...probes.map((probe) => probe.duration))
  if (seconds !== undefined && start + seconds > shortest + 1e-3) {
    problems.push(['excerpt', `${start} s + ${seconds} s runs past the stems' end at ${shortest.toFixed(3)} s`])
  }
  return problems
}

/** `| file | problem |` rows, aligned, for the terminal. */
export function problemTable(problems) {
  const width = Math.max(4, ...problems.map(([where]) => String(where).length))
  return problems.map(([where, what]) => `  ${String(where).padEnd(width)}  ${what}`).join('\n')
}

/** Each bucket's absolute peak, `points` buckets across the samples. */
export function bucketPeaks(samples, points) {
  const out = new Float32Array(points)
  const size = samples.length / points
  for (let bucket = 0; bucket < points; bucket += 1) {
    const from = Math.floor(bucket * size)
    const to = Math.max(from + 1, Math.floor((bucket + 1) * size))
    let peak = 0
    for (let i = from; i < to && i < samples.length; i += 1) {
      const value = Math.abs(samples[i])
      if (value > peak) peak = value
    }
    out[bucket] = peak
  }
  return out
}

/**
 * One byte per bucket, normalised **per track, not per stem**, with a square-root curve:
 * the lanes show the balance of the mix, which is the point of a mixer, and the curve keeps
 * a quiet pad visible beside the kick.
 */
export function normalisePeaks(peaksByStem) {
  let loudest = 0
  for (const peaks of Object.values(peaksByStem)) for (const value of peaks) if (value > loudest) loudest = value
  const out = {}
  for (const [id, peaks] of Object.entries(peaksByStem)) {
    out[id] = Uint8Array.from(peaks, (value) => (loudest > 0 ? Math.round(Math.sqrt(value / loudest) * 255) : 0))
  }
  return out
}

/** `peaks.json`: `{ v: 1, points, stems: { id: base64 } }`, about 4 kB for eight stems. */
export function peaksFile(bytesByStem, points) {
  const stems = {}
  for (const [id, bytes] of Object.entries(bytesByStem)) stems[id] = Buffer.from(bytes).toString('base64')
  return { v: 1, points, stems }
}

/** A single-quoted TypeScript string, as `content/` writes them. */
const quote = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

/**
 * The `StemTrack` literal to paste into `content/stems.ts`, bytes filled in. Printed rather
 * than written: a script rewriting a content module is a write that drifts, and the
 * bytes spec catches a stale paste.
 */
export function trackLiteral(track, bytesByFile) {
  const lines = ['  {', `    id: ${quote(track.id)},`, `    title: ${quote(track.title)},`, `    seconds: ${track.seconds},`]
  if (track.bpm) lines.push(`    bpm: ${track.bpm},`)
  if (track.beatsPerBar && track.beatsPerBar !== 4) lines.push(`    beatsPerBar: ${track.beatsPerBar},`)
  if (track.key) lines.push(`    key: ${quote(track.key)},`)
  if (track.daw) lines.push(`    daw: ${quote(track.daw)},`)
  if (track.released) lines.push(`    released: ${quote(track.released)},`)
  if (track.url) lines.push(`    url: ${quote(track.url)},`)
  if (track.note) lines.push(`    note: { en: ${quote(track.note.en)}, fr: ${quote(track.note.fr)} },`)
  lines.push('    stems: [')
  for (const stem of track.stems) {
    const file = `${track.id}/${stem.id}.m4a`
    const chain = stem.chain?.length ? `, chain: [${stem.chain.map(quote).join(', ')}]` : ''
    lines.push(
      `      { id: ${quote(stem.id)}, name: { en: ${quote(stem.name.en)}, fr: ${quote(stem.name.fr)} }, file: ${quote(file)}, bytes: ${bytesByFile[file]}${chain} },`,
    )
  }
  lines.push('    ],', '  },')
  return lines.join('\n')
}
