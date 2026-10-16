/**
 * `npm run stems -- <folder>`: a folder of DAW exports and a `track.json` in, a track for
 * the music section's mixer out (`docs/superpowers/specs/2026-10-15-stems-vol2-design.md` §1).
 *
 * A dev-time script calling the system's `ffmpeg` and `ffprobe`: the site's no-runtime-
 * dependency rule is about what ships, and nothing here does. It refuses, with a table of
 * what is wrong, at the first failed check; it cuts the excerpt sample-accurately (`atrim`
 * after the input, never a keyframe seek), encodes every stem through the one encoder at
 * one setting so they stay locked to each other, writes `peaks.json`, and prints the
 * `StemTrack` literal to paste into `src/content/stems.ts`.
 *
 * Listen to the loop's seam in Chrome, Firefox and Safari before a first track ships: AAC
 * priming is trimmed differently by each, which the engine's exact loop length is there to
 * take out of the question.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  bucketPeaks,
  normalisePeaks,
  parseTime,
  peaksFile,
  probeProblems,
  problemTable,
  trackLiteral,
  wholeBarWarning,
} from './stems-lib.mjs'

/** As `src/content/stems.ts` has them. */
const MAX_STEMS = 8
const DECODED_BYTES_PER_SECOND = 48_000 * 2 * 4
const MAX_DECODED_BYTES = 160 * 1024 * 1024
/** Buckets in a lane: enough for a wide screen, about 4 kB for eight stems. */
const POINTS = 480
/** The rate the peaks are read at: only the envelope matters, not the audio. */
const PEAK_RATE = 8_000

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))

function fail(heading, problems) {
  console.error(`stems: ${heading}\n${problemTable(problems)}`)
  process.exit(1)
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { maxBuffer: 1 << 30, ...options })
  } catch (error) {
    if (error.code === 'ENOENT') fail(`${command} isn't installed`, [[command, 'install ffmpeg, which brings ffprobe']])
    throw error
  }
}

function probe(path, file) {
  const out = JSON.parse(
    run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate:format=duration', '-of', 'json', path]).toString(),
  )
  return { file, sampleRate: Number(out.streams?.[0]?.sample_rate), duration: Number(out.format?.duration) }
}

const folder = process.argv[2]
if (!folder) {
  console.error('usage: npm run stems -- <folder with the stems and a track.json>')
  process.exit(1)
}
const source = resolve(folder)
const jsonPath = join(source, 'track.json')
if (!existsSync(jsonPath)) fail('no track.json', [[jsonPath, 'missing']])
const track = JSON.parse(readFileSync(jsonPath, 'utf8'))
const start = parseTime(track.start ?? 0)

// 1. Every input probed: one rate, one length, at most MAX_STEMS, the excerpt inside them.
const missing = track.stems.filter((stem) => !existsSync(join(source, stem.file))).map((stem) => [stem.file, 'not in the folder'])
if (missing.length) fail('stems missing', missing)
const probes = track.stems.map((stem) => probe(join(source, stem.file), stem.file))
const problems = probeProblems(probes, { maxStems: MAX_STEMS, start, seconds: track.seconds })
if (problems.length) fail('the stems don’t fit together', problems)

// 2. A loop that isn't a whole number of bars jars at the seam.
const warning = wholeBarWarning(track.seconds, track.bpm, track.beatsPerBar)
if (warning) console.warn(`stems: warning: ${warning}`)

// 5, early: what the track costs decoded, before anything is encoded.
const decoded = track.seconds * DECODED_BYTES_PER_SECOND * track.stems.length
if (decoded > MAX_DECODED_BYTES) {
  fail('too big to hold decoded on a phone', [['decoded', `${Math.round(decoded / 2 ** 20)} MB, over ${MAX_DECODED_BYTES / 2 ** 20} MB: shorten the excerpt or drop a stem`]])
}

// 3 and 4. Cut sample-accurately, AAC-LC 192 kb/s, 48 kHz stereo, faststart.
const out = join(root, 'public/stems', track.id)
mkdirSync(out, { recursive: true })
const bytes = {}
const peaks = {}
for (const stem of track.stems) {
  const input = join(source, stem.file)
  const target = join(out, `${stem.id}.m4a`)
  const trim = `atrim=start=${start}:duration=${track.seconds},asetpts=PTS-STARTPTS`
  run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', trim, '-ac', '2', '-ar', '48000', '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '192k', '-movflags', '+faststart', target])
  bytes[`${track.id}/${stem.id}.m4a`] = statSync(target).size
  // 6. The envelope, from the same excerpt, as mono floats at a low rate.
  const raw = run('ffmpeg', ['-v', 'error', '-i', input, '-af', trim, '-ac', '1', '-ar', String(PEAK_RATE), '-f', 'f32le', '-'])
  peaks[stem.id] = bucketPeaks(new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4)), POINTS)
}
writeFileSync(join(out, 'peaks.json'), JSON.stringify(peaksFile(normalisePeaks(peaks), POINTS)))

// 7. Printed, not written: paste it into src/content/stems.ts.
console.log(`\n// public/stems/${track.id}/: ${track.stems.length} stems and peaks.json. Paste into stemTracks:\n`)
console.log(trackLiteral(track, bytes))
