/**
 * `npm run tempos -- <audio file | SoundCloud track or set URL>... [--write]`: each track's
 * tempo and first beat, detected from its audio (`tempo-lib.mjs`), for `content/music.ts`'s
 * `tempos`, which the background beats with while SoundCloud plays the track.
 *
 *   npm run tempos -- https://soundcloud.com/couvbat/sets/mon-bruit --write
 *   npm run tempos -- ~/exports/cultist.wav --path /couvbat/cultist --write
 *
 * A dev-time script, as `npm run stems` is: it calls the system's `ffmpeg` to decode, and
 * for a SoundCloud URL `yt-dlp` to fetch the audio, into a temporary folder it removes
 * after. Meant for the site owner's own tracks. Without `--write` it only prints; with it,
 * the entries are merged into `src/content/music.ts`, keyed by each track's path on
 * soundcloud.com, which a local file needs given with `--path`.
 *
 * `--range 110-220` is the octave the tempo is looked for in (the default): a track at 100
 * would read as 200, so give it `--range 70-140`.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { ANALYSIS_RATE, DEFAULT_RANGE, detectTempo, parseRange, soundcloudPath, writeTempos } from './tempo-lib.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const MUSIC = join(root, 'src/content/music.ts')
/** Below this the beat barely stands out from its offbeat: worth a listen before trusting. */
const WEAK = 2

function fail(message) {
  console.error(`tempos: ${message}`)
  process.exit(1)
}

function run(command, args) {
  try {
    return execFileSync(command, args, { maxBuffer: 1 << 30 })
  } catch (error) {
    if (error.code === 'ENOENT') {
      fail(command === 'yt-dlp' ? 'a SoundCloud URL needs yt-dlp; give the audio file instead' : `${command} isn't installed`)
    }
    throw error
  }
}

function parseArgs(argv) {
  const sources = []
  let write = false
  let path = null
  let range = DEFAULT_RANGE
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--write') write = true
    else if (arg === '--path') path = argv[(i += 1)] ?? fail('--path needs a value, such as /couvbat/cultist')
    else if (arg === '--range') range = parseRange(argv[(i += 1)]) ?? fail('--range is two tempos an octave apart at most, such as 110-220')
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`)
    else sources.push(arg)
  }
  if (!sources.length) fail('give an audio file or a SoundCloud track or set URL')
  if (path && sources.length > 1) fail('--path names one file; give one file with it')
  if (path && !/^\/[^/]+\/[^/]+$/.test(path)) {
    // Git Bash on Windows turns `/couvbat/cultist` into `C:/Program Files/Git/couvbat/cultist`.
    const msys = /^[A-Za-z]:\//.test(path) ? ' (Git Bash rewrote it: prefix the command with MSYS_NO_PATHCONV=1)' : ''
    fail(`--path is a track's path on soundcloud.com, such as /couvbat/cultist, not ${path}${msys}`)
  }
  return { sources, write, path, range }
}

/** The audio of a SoundCloud URL, one file per track, with each track's page URL. */
function fetchSoundCloud(url, folder) {
  const out = run('yt-dlp', [
    '-f',
    'bestaudio',
    '--no-simulate',
    '--no-warnings',
    '--print',
    'after_move:%(webpage_url)s\t%(filepath)s',
    '-o',
    join(folder, '%(id)s.%(ext)s'),
    url,
  ]).toString()
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [page, file] = line.split('\t')
      return { label: page, file, path: soundcloudPath(page) }
    })
}

/** Mono samples at the analysis rate, decoded by ffmpeg whatever the format. */
function decode(file) {
  const bytes = run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(ANALYSIS_RATE), '-f', 'f32le', 'pipe:1'])
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}

const { sources, write, path, range } = parseArgs(process.argv.slice(2))
const folder = mkdtempSync(join(tmpdir(), 'tempos-'))
const found = {}
try {
  const tracks = sources.flatMap((source) =>
    /^https?:\/\//.test(source) ? fetchSoundCloud(source, folder) : [{ label: source, file: source, path: path ?? null }],
  )
  for (const track of tracks) {
    const samples = decode(track.file)
    const tempo = detectTempo(samples, range)
    const name = track.path ?? track.label
    if (!tempo) {
      console.log(`${name}: no beat found`)
      continue
    }
    const weak = tempo.confidence < WEAK ? `  (weak beat: listen before trusting it)` : ''
    console.log(`${name}: ${tempo.bpm} BPM, first beat at ${tempo.firstBeatMs} ms, beat ${tempo.confidence}× its offbeat${weak}`)
    console.log(`  if the pulses land between the kicks, use firstBeatMs: ${tempo.offbeatMs}`)
    if (track.path) found[track.path] = { bpm: tempo.bpm, firstBeatMs: tempo.firstBeatMs }
    else if (write) console.log(`  not written: give its path on soundcloud.com with --path`)
  }
} finally {
  rmSync(folder, { recursive: true, force: true })
}

if (write && Object.keys(found).length) {
  writeFileSync(MUSIC, writeTempos(readFileSync(MUSIC, 'utf8'), found))
  console.log(`\nwrote ${Object.keys(found).length} to src/content/music.ts`)
} else if (Object.keys(found).length) {
  console.log(`\n${writeTempos('export const tempos: Readonly<Record<string, Tempo>> = {}\n', found)}add --write to put them in src/content/music.ts`)
}
