/**
 * The pure half of the ffmpeg tool: presets, argument lists, timecodes and the
 * ffprobe reader. Nothing here touches the wasm — `core.ts` does that — so every
 * decision about *what* to run is testable in vitest, and the panel is left with
 * wiring.
 */

/**
 * Byte size of `@ffmpeg/core`'s `ffmpeg-core.wasm`, announced before the download
 * because a 32 MB core is not something a page pulls on a visitor's behalf (spec §5,
 * tier wasm). `media.spec.ts` stats the installed file against it, so a dependency
 * bump that changes the size fails a test instead of shipping a stale number.
 */
export const CORE_BYTES = 32_232_419

export type PresetId = 'mp3' | 'm4a' | 'ogg' | 'wav' | 'flac' | 'copy' | 'mp4' | 'gif'
export type Kind = 'audio' | 'video' | 'image'

export interface Preset {
  id: PresetId
  /** Output extension; ffmpeg picks the muxer from it. Empty for `copy`, which takes
   *  it from the source codec — see `outputFor`. */
  ext: string
  kind: Kind
  mime: string
  /** What the panel prints next to the name: codec and quality, in ffmpeg's words. */
  note: string
  /** Output-side arguments only. Input, trim and output path are `buildArgs`'s job. */
  args: string[]
}

export const PRESETS: Preset[] = [
  {
    id: 'mp3',
    ext: 'mp3',
    kind: 'audio',
    mime: 'audio/mpeg',
    note: 'libmp3lame, VBR ~190 kb/s',
    args: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  },
  {
    id: 'm4a',
    ext: 'm4a',
    kind: 'audio',
    mime: 'audio/mp4',
    note: 'AAC 192 kb/s',
    args: ['-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  },
  {
    id: 'ogg',
    ext: 'ogg',
    kind: 'audio',
    mime: 'audio/ogg',
    note: 'Vorbis q5 ~160 kb/s',
    // Vorbis rather than Opus: this core's libopus traps with `memory access out of
    // bounds` on the first frame (0.12.10, checked against a plain 44.1 kHz wav), and
    // a wasm trap poisons the instance for everything after it. FFmpeg's own opus
    // encoder runs but is marked experimental for a reason; Vorbis is the free codec
    // in this build that simply works.
    args: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  },
  {
    id: 'wav',
    ext: 'wav',
    kind: 'audio',
    mime: 'audio/wav',
    note: 'PCM 16-bit',
    args: ['-vn', '-c:a', 'pcm_s16le'],
  },
  {
    id: 'flac',
    ext: 'flac',
    kind: 'audio',
    mime: 'audio/flac',
    note: 'lossless',
    args: ['-vn', '-c:a', 'flac'],
  },
  {
    id: 'copy',
    ext: '',
    kind: 'audio',
    mime: '',
    note: 'audio stream as it is, no re-encoding',
    args: ['-vn', '-c:a', 'copy'],
  },
  {
    id: 'mp4',
    ext: 'mp4',
    kind: 'video',
    mime: 'video/mp4',
    note: 'H.264 CRF 23 + AAC — slow',
    // Even dimensions first: yuv420p, the one pixel format every player takes,
    // cannot describe an odd width or height and libx264 refuses rather than crops.
    args: [
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    ],
  },
  {
    id: 'gif',
    ext: 'gif',
    kind: 'image',
    mime: 'image/gif',
    note: '12 fps, 480 px wide, palette from the clip',
    // palettegen/paletteuse in one graph: a GIF quantised to ffmpeg's default
    // 256-colour palette bands badly; one built from the clip itself does not.
    args: [
      '-an',
      '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse',
    ],
  },
]

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id)
}

/** Containers that hold exactly one audio codec as a plain file, for `copy`. */
const COPY_CONTAINERS: Record<string, { ext: string; mime: string }> = {
  aac: { ext: 'm4a', mime: 'audio/mp4' },
  alac: { ext: 'm4a', mime: 'audio/mp4' },
  mp3: { ext: 'mp3', mime: 'audio/mpeg' },
  mp2: { ext: 'mp2', mime: 'audio/mpeg' },
  opus: { ext: 'opus', mime: 'audio/ogg' },
  vorbis: { ext: 'ogg', mime: 'audio/ogg' },
  flac: { ext: 'flac', mime: 'audio/flac' },
  ac3: { ext: 'ac3', mime: 'audio/ac3' },
  eac3: { ext: 'eac3', mime: 'audio/eac3' },
}

/** Where a copied audio stream can go without re-encoding, or `null` when it has no
 *  plain container here (DTS, TrueHD, the odd PCM variants). */
export function copyContainer(codec: string): { ext: string; mime: string } | null {
  if (codec.startsWith('pcm_')) return { ext: 'wav', mime: 'audio/wav' }
  return COPY_CONTAINERS[codec] ?? null
}

export interface Stream {
  kind: 'audio' | 'video' | 'cover' | 'other'
  codec: string
  width?: number
  height?: number
  fps?: number
  sampleRate?: number
  channels?: number
}

export interface Probe {
  /** Seconds, or `null` when ffprobe could not tell (a raw stream, a broken header). */
  duration: number | null
  format: string
  streams: Stream[]
  /** The first real audio and video streams — what the presets act on. */
  audio: Stream | undefined
  video: Stream | undefined
}

interface RawStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  sample_rate?: string
  channels?: number
  duration?: string
  disposition?: { attached_pic?: number }
}
interface RawProbe {
  streams?: RawStream[]
  format?: { format_name?: string; duration?: string }
}

function fraction(text: string | undefined): number | undefined {
  if (!text) return undefined
  const [num, den = '1'] = text.split('/')
  const value = Number(num) / Number(den)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : undefined
}

function seconds(text: string | undefined): number | null {
  const value = Number(text)
  return text && Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Reads `ffprobe -show_format -show_streams -print_format json`. `null` when the
 * text is not that JSON at all; a probe with no streams when ffprobe ran but saw
 * nothing it knew. Cover art in an mp3 or m4a arrives as a video stream with
 * `attached_pic`, and must not be taken for a film — the mp4 and gif presets would
 * otherwise be offered for a song.
 */
export function parseProbe(json: string): Probe | null {
  let raw: RawProbe
  try {
    raw = JSON.parse(json) as RawProbe
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.streams)) return null

  const streams: Stream[] = raw.streams.map((s) => {
    const codec = s.codec_name ?? 'unknown'
    if (s.codec_type === 'audio') {
      return {
        kind: 'audio',
        codec,
        sampleRate: s.sample_rate ? Number(s.sample_rate) : undefined,
        channels: s.channels,
      }
    }
    if (s.codec_type === 'video') {
      if (s.disposition?.attached_pic === 1) return { kind: 'cover', codec }
      return { kind: 'video', codec, width: s.width, height: s.height, fps: fraction(s.avg_frame_rate) }
    }
    return { kind: 'other', codec }
  })

  let duration = seconds(raw.format?.duration)
  if (duration === null) {
    for (const s of raw.streams) {
      const own = seconds(s.duration)
      if (own !== null && (duration === null || own > duration)) duration = own
    }
  }

  return {
    duration,
    format: raw.format?.format_name ?? '',
    streams,
    audio: streams.find((s) => s.kind === 'audio'),
    video: streams.find((s) => s.kind === 'video'),
  }
}

/** `90`, `1:30`, `01:30.5`, `0:01:30.500` → seconds. `null` when it is none of those. */
export function parseTimecode(input: string): number | null {
  const text = input.trim()
  if (!text) return null
  const parts = text.split(':')
  if (parts.length > 3) return null
  let total = 0
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null
    total = total * 60 + Number(part)
  }
  return total
}

/** Seconds → `hh:mm:ss.fff`, the form ffmpeg reads; fewer decimals for display. */
export function formatTimecode(value: number, decimals = 3): string {
  // Round to the precision first, so 89.96 at one decimal is 1:30.0, not 1:29.0
  // with a fraction that quietly rounded up to a full second.
  const scale = 10 ** decimals
  const rounded = Math.round(value * scale) / scale
  const whole = Math.floor(rounded)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const frac = decimals > 0 ? (rounded - whole).toFixed(decimals).slice(1) : ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${frac}`
}

/** A cut, in seconds from the start. `length` is `null` for "to the end". */
export interface Cut {
  start: number
  length: number | null
}

export type CutError = 'start' | 'end' | 'order'

/**
 * Validates the two trim fields against the probed duration. Both empty means the
 * whole file (`cut: null`). An end past the known duration is clamped rather than
 * refused — ffmpeg stops at the end of the input anyway, and "the whole rest of it"
 * is what someone typing a generous end meant.
 */
export function trimWindow(
  startText: string,
  endText: string,
  duration: number | null,
): { cut: Cut | null; error: CutError | null } {
  const hasStart = startText.trim() !== ''
  const hasEnd = endText.trim() !== ''
  if (!hasStart && !hasEnd) return { cut: null, error: null }

  const start = hasStart ? parseTimecode(startText) : 0
  if (start === null || (duration !== null && start >= duration)) return { cut: null, error: 'start' }

  let end = hasEnd ? parseTimecode(endText) : null
  if (hasEnd && end === null) return { cut: null, error: 'end' }
  if (end !== null && duration !== null) end = Math.min(end, duration)
  if (end !== null && end <= start) return { cut: null, error: 'order' }

  return { cut: { start, length: end === null ? null : end - start }, error: null }
}

/**
 * The argument list up to, but not including, the output path.
 *
 * `-ss` goes *before* `-i`: as an input option it seeks in the demuxer, instant on a
 * long file, where as an output option ffmpeg would decode everything up to the start
 * and throw it away. The length is `-t` rather than `-to`, because `-to` is measured
 * from the file's own zero and, after an input-side seek, that is the wrong zero.
 */
export function buildArgs(input: string, preset: Preset, cut: Cut | null): string[] {
  const args: string[] = []
  if (cut && cut.start > 0) args.push('-ss', formatTimecode(cut.start))
  args.push('-i', input)
  if (cut && cut.length !== null) args.push('-t', formatTimecode(cut.length))
  args.push(...preset.args)
  return args
}

export type Blocker = 'noAudio' | 'noVideo' | 'copyUnknown'

/** Why a preset cannot apply to this file, or `null` when it can. */
export function blocker(preset: Preset, probe: Probe): Blocker | null {
  if (preset.kind === 'audio' && !probe.audio) return 'noAudio'
  if (preset.kind !== 'audio' && !probe.video) return 'noVideo'
  if (preset.id === 'copy' && probe.audio && !copyContainer(probe.audio.codec)) return 'copyUnknown'
  return null
}

/** Extension and MIME of what the preset will produce for this file. */
export function outputFor(preset: Preset, probe: Probe): { ext: string; mime: string } {
  if (preset.id === 'copy' && probe.audio) {
    return copyContainer(probe.audio.codec) ?? { ext: 'bin', mime: 'application/octet-stream' }
  }
  return { ext: preset.ext, mime: preset.mime }
}

/** `clip.mp4` → `clip.mp3`, `clip-cut.mp3` when trimmed, and never the input's own name. */
export function outputName(inputName: string, ext: string, trimmed: boolean): string {
  const stem = inputName.replace(/\.[^.]+$/, '') || 'output'
  const name = `${stem}${trimmed ? '-cut' : ''}.${ext}`
  return name === inputName ? `${stem}-out.${ext}` : name
}

/**
 * The name the file gets inside the wasm filesystem: `input` plus the original
 * extension when it is a plain one, so the demuxer keeps its hint but a name with
 * spaces, a colon or a leading dash never reaches ffmpeg's argument parser.
 */
export function mountName(fileName: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName)
  return match ? `input.${match[1]!.toLowerCase()}` : 'input'
}

/**
 * ffmpeg.wasm reports the output timestamp in microseconds. Against the expected
 * output length that is a real ratio; the wrapper's own `progress` field is computed
 * against the whole input and so stalls well short of 1 on a trim. `null` when the
 * length is unknown — the panel shows an indeterminate bar rather than a wrong one.
 */
export function progressRatio(micros: number, expectedSeconds: number | null): number | null {
  if (expectedSeconds === null || expectedSeconds <= 0) return null
  return Math.min(1, Math.max(0, micros / 1e6 / expectedSeconds))
}
