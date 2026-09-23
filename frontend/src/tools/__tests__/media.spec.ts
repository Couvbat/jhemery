import { statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CORE_BYTES,
  PRESETS,
  blocker,
  buildArgs,
  copyContainer,
  findPreset,
  formatTimecode,
  mountName,
  outputFor,
  outputName,
  parseProbe,
  parseTimecode,
  progressRatio,
  trimWindow,
} from '../ffmpeg/media'

const mp4Probe = JSON.stringify({
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, avg_frame_rate: '30000/1001' },
    { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 },
    { codec_type: 'data', codec_name: 'bin_data' },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '12.345000' },
})

const mp3WithCover = JSON.stringify({
  streams: [
    { codec_type: 'audio', codec_name: 'mp3', sample_rate: '44100', channels: 2, duration: '210.5' },
    { codec_type: 'video', codec_name: 'mjpeg', width: 500, height: 500, disposition: { attached_pic: 1 } },
  ],
  format: { format_name: 'mp3' },
})

describe('ffmpeg tool', () => {
  it('announces the size of the core that is actually installed', () => {
    // The number is printed on the download button. Stat the real file so a
    // dependency bump cannot leave a stale figure behind.
    // vitest runs from `frontend/`, and jsdom gives `import.meta.url` an http: scheme,
    // so the path is anchored on the working directory rather than on this file.
    const wasm = join(process.cwd(), 'node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm')
    expect(statSync(wasm).size).toBe(CORE_BYTES)
  })

  it('has one preset per id, each with a container except copy', () => {
    const ids = PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PRESETS) {
      if (preset.id === 'copy') continue
      expect(preset.ext).not.toBe('')
      expect(preset.mime).toMatch(/^(audio|video|image)\//)
    }
    expect(findPreset('mp3')?.kind).toBe('audio')
    expect(findPreset('nope')).toBeUndefined()
  })

  describe('parseProbe', () => {
    it('reads streams, duration and frame rate from ffprobe JSON', () => {
      const probe = parseProbe(mp4Probe)!
      expect(probe.duration).toBeCloseTo(12.345)
      expect(probe.format).toContain('mp4')
      expect(probe.video).toMatchObject({ codec: 'h264', width: 1920, height: 1080, fps: 29.97 })
      expect(probe.audio).toMatchObject({ codec: 'aac', sampleRate: 48000, channels: 2 })
      expect(probe.streams).toHaveLength(3)
      expect(probe.streams[2]?.kind).toBe('other')
    })

    it('does not mistake cover art for video, and falls back to stream durations', () => {
      const probe = parseProbe(mp3WithCover)!
      expect(probe.video).toBeUndefined()
      expect(probe.streams[1]?.kind).toBe('cover')
      expect(probe.duration).toBeCloseTo(210.5)
    })

    it('returns null for anything that is not ffprobe output', () => {
      expect(parseProbe('')).toBeNull()
      expect(parseProbe('not json')).toBeNull()
      expect(parseProbe('{"format":{}}')).toBeNull()
      expect(parseProbe('{"streams":[]}')?.streams).toEqual([])
    })
  })

  describe('timecodes', () => {
    it('parses seconds, m:ss and h:mm:ss with fractions', () => {
      expect(parseTimecode('90')).toBe(90)
      expect(parseTimecode(' 1:30 ')).toBe(90)
      expect(parseTimecode('01:30.5')).toBe(90.5)
      expect(parseTimecode('0:01:30.500')).toBe(90.5)
      expect(parseTimecode('1:02:03')).toBe(3723)
    })

    it('rejects what is not a timecode', () => {
      for (const bad of ['', 'abc', '1:2:3:4', '-5', '1:xx', '1.5.2']) {
        expect(parseTimecode(bad)).toBeNull()
      }
    })

    it('formats for ffmpeg and for display', () => {
      expect(formatTimecode(90.5)).toBe('00:01:30.500')
      expect(formatTimecode(3723.4, 1)).toBe('01:02:03.4')
      expect(formatTimecode(89.96, 1)).toBe('00:01:30.0')
      expect(formatTimecode(7, 0)).toBe('00:00:07')
      expect(formatTimecode(7.6, 0)).toBe('00:00:08')
    })
  })

  describe('trimWindow', () => {
    it('is the whole file when both fields are empty', () => {
      expect(trimWindow('', '', 100)).toEqual({ cut: null, error: null })
    })

    it('cuts from a start to the end, or between two points', () => {
      expect(trimWindow('10', '', 100)).toEqual({ cut: { start: 10, length: null }, error: null })
      expect(trimWindow('10', '25', 100)).toEqual({ cut: { start: 10, length: 15 }, error: null })
      expect(trimWindow('', '25', 100)).toEqual({ cut: { start: 0, length: 25 }, error: null })
    })

    it('clamps an end past the duration and works without one', () => {
      expect(trimWindow('10', '500', 100).cut).toEqual({ start: 10, length: 90 })
      expect(trimWindow('10', '500', null).cut).toEqual({ start: 10, length: 490 })
    })

    it('names the field that is wrong', () => {
      expect(trimWindow('x', '', 100).error).toBe('start')
      expect(trimWindow('150', '', 100).error).toBe('start')
      expect(trimWindow('', 'x', 100).error).toBe('end')
      expect(trimWindow('30', '20', 100).error).toBe('order')
      expect(trimWindow('30', '30', 100).error).toBe('order')
    })
  })

  describe('buildArgs', () => {
    const mp3 = findPreset('mp3')!

    it('seeks before the input and limits with -t after it', () => {
      expect(buildArgs('/in/input.mp4', mp3, { start: 10, length: 15 })).toEqual([
        '-ss', '00:00:10.000',
        '-i', '/in/input.mp4',
        '-t', '00:00:15.000',
        '-vn', '-c:a', 'libmp3lame', '-q:a', '2',
      ])
    })

    it('leaves out what is not asked for', () => {
      expect(buildArgs('/in/a.wav', mp3, null)).toEqual(['-i', '/in/a.wav', ...mp3.args])
      expect(buildArgs('/in/a.wav', mp3, { start: 0, length: 5 })).toEqual([
        '-i', '/in/a.wav', '-t', '00:00:05.000', ...mp3.args,
      ])
    })
  })

  describe('applicability', () => {
    const video = parseProbe(mp4Probe)!
    const song = parseProbe(mp3WithCover)!
    const silent = parseProbe(
      JSON.stringify({ streams: [{ codec_type: 'video', codec_name: 'vp9', width: 640, height: 360 }], format: {} }),
    )!

    it('needs an audio stream for audio presets and a video one for the rest', () => {
      expect(blocker(findPreset('mp3')!, video)).toBeNull()
      expect(blocker(findPreset('mp3')!, silent)).toBe('noAudio')
      expect(blocker(findPreset('mp4')!, song)).toBe('noVideo')
      expect(blocker(findPreset('gif')!, video)).toBeNull()
    })

    it('only copies codecs that have a plain container', () => {
      expect(blocker(findPreset('copy')!, video)).toBeNull()
      const dts = parseProbe(JSON.stringify({ streams: [{ codec_type: 'audio', codec_name: 'dts' }], format: {} }))!
      expect(blocker(findPreset('copy')!, dts)).toBe('copyUnknown')
    })

    it('knows the container for each copyable codec', () => {
      expect(copyContainer('aac')).toEqual({ ext: 'm4a', mime: 'audio/mp4' })
      expect(copyContainer('pcm_s24le')?.ext).toBe('wav')
      expect(copyContainer('vorbis')?.ext).toBe('ogg')
      expect(copyContainer('truehd')).toBeNull()
    })

    it('names the output after the preset, or the copied codec', () => {
      expect(outputFor(findPreset('ogg')!, video)).toEqual({ ext: 'ogg', mime: 'audio/ogg' })
      expect(outputFor(findPreset('copy')!, video)).toEqual({ ext: 'm4a', mime: 'audio/mp4' })
      expect(outputFor(findPreset('copy')!, song)).toEqual({ ext: 'mp3', mime: 'audio/mpeg' })
    })
  })

  describe('names', () => {
    it('swaps the extension, marks a cut, and never collides with the input', () => {
      expect(outputName('clip.mp4', 'mp3', false)).toBe('clip.mp3')
      expect(outputName('clip.mp4', 'mp3', true)).toBe('clip-cut.mp3')
      expect(outputName('song.mp3', 'mp3', false)).toBe('song-out.mp3')
      expect(outputName('noext', 'wav', false)).toBe('noext.wav')
      expect(outputName('.mp4', 'gif', false)).toBe('output.gif')
    })

    it('mounts under a plain name that keeps the extension hint', () => {
      expect(mountName('My Song (final).MP3')).toBe('input.mp3')
      expect(mountName('-rf')).toBe('input')
      expect(mountName('archive.tar.gz')).toBe('input.gz')
      expect(mountName('weird.ext-with-dash')).toBe('input')
    })
  })

  it('turns microseconds of output into a clamped ratio, or nothing', () => {
    expect(progressRatio(5_000_000, 10)).toBe(0.5)
    expect(progressRatio(15_000_000, 10)).toBe(1)
    expect(progressRatio(-1, 10)).toBe(0)
    expect(progressRatio(5_000_000, null)).toBeNull()
    expect(progressRatio(5_000_000, 0)).toBeNull()
  })
})
