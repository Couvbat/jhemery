import { tempos as siteTempos, type Tempo } from '@/content/tempos'
import { attachMusic } from '@/lib/music-signal'
import type { WidgetMessage } from '@/composables/useMusicPlayer'

/**
 * What the music section's SoundCloud frame is playing, for the field to follow
 * (`docs/superpowers/specs/2026-10-15-music-reactive-field-design.md`, *SoundCloud*). Its
 * audio plays in a cross-origin frame no analyser can reach, so it is followed instead:
 * play, pause and position from the widget, and how loud the track is at that position
 * from its waveform.
 *
 * **It speaks to no one.** `useMusicEmbed` holds the frame's one conversation, over the
 * `postMessage` protocol of SoundCloud's `api.js` spoken by hand, and hands this bridge each
 * message it has checked (`listen`). It subscribes the widget to `playProgress` and asks for
 * `getCurrentSound` on this bridge's behalf, so the widget is subscribed once, not once per
 * reader.
 *
 * **The waveform** is the file the player draws its own bars from: `waveform_url` in the
 * sound `getCurrentSound` returns, 1 800 heights over the track on SoundCloud's CDN,
 * served to any origin. Fetched only once the visitor has loaded the player, which already
 * talks to SoundCloud, with no cookie and no referrer; read for its numbers, kept for the
 * session in memory and nowhere else. It gives the level, a hundred-odd milliseconds a
 * sample: enough for the field to calm in a breakdown and lift in a drop, too coarse for a
 * beat, which comes from the track's entry in `content/tempos.ts`, detected from its audio
 * by `npm run tempos`.
 *
 * Imported when the visitor loads the player, never before: the frame waits behind a button
 * for its cookies, and the bridge waits with it.
 */

/** The waveform's file on SoundCloud's CDN: `_m.json`, or the `_m.png` older sounds name. */
const WAVEFORM = /^https:\/\/wave\.sndcdn\.com\/([A-Za-z0-9]{1,64})_m\.(?:json|png)$/
/** More heights than this is no waveform of SoundCloud's, which draws 1 800. */
const MAX_SAMPLES = 10_000

/** A sound's path on soundcloud.com, `/couvbat/track`, which `tempos` is keyed by. */
export function permalinkPath(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !/(^|\.)soundcloud\.com$/.test(parsed.hostname)) return null
    return parsed.pathname.replace(/\/+$/, '') || null
  } catch {
    return null
  }
}

/** The JSON form of a sound's `waveform_url`, or null for anything not on SoundCloud's CDN. */
export function waveformJsonUrl(url: unknown): string | null {
  const match = typeof url === 'string' ? WAVEFORM.exec(url) : null
  return match ? `https://wave.sndcdn.com/${match[1]}_m.json` : null
}

/**
 * The waveform's heights as levels, 0–1, or null if it isn't one. Each is placed in the
 * track's own range, from its quietest tenth to its loudest twentieth: a loud master sits
 * within a few percent of its peak for whole minutes, so against the peak alone (squared,
 * as this first did) an intro read 0.45 and a drop 0.9, and the field barely told them
 * apart. In its own range a breakdown reads near 0 and a drop near 1.
 */
export function waveformLevels(data: unknown): Float32Array | null {
  const samples = (data as { samples?: unknown } | null)?.samples
  if (!Array.isArray(samples) || !samples.length || samples.length > MAX_SAMPLES) return null
  for (const sample of samples) {
    if (typeof sample !== 'number' || !Number.isFinite(sample) || sample < 0) return null
  }
  const sorted = Float32Array.from(samples as number[]).sort()
  const top = sorted.at(-1)!
  if (!top) return null
  const low = sorted[Math.floor(sorted.length * 0.1)]!
  const high = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
  // A waveform with no range to speak of (a drone): against its peak, as a level.
  if (high - low < top * 0.05) return Float32Array.from(samples as number[], (sample) => sample / top)
  return Float32Array.from(samples as number[], (sample) => Math.min(1, Math.max(0, (sample - low) / (high - low))))
}

/** The level at `positionMs` into a track `durationMs` long, between the two nearest heights. */
export function levelAt(levels: Float32Array | null, positionMs: number, durationMs: number): number | null {
  if (!levels?.length || !(durationMs > 0) || !Number.isFinite(positionMs)) return null
  const at = Math.min(Math.max(positionMs / durationMs, 0), 1) * (levels.length - 1)
  const i = Math.floor(at)
  const next = levels[Math.min(i + 1, levels.length - 1)]!
  return levels[i]! + (next - levels[i]!) * (at - i)
}

/** Where the widget said it was, and when, on the page's clock. */
export interface Anchor {
  positionMs: number
  at: number
}

/** The position now, from the last anchor and the time since; null without one. */
export function positionAt(anchor: Anchor | null, now: number): number | null {
  return anchor ? anchor.positionMs + Math.max(0, now - anchor.at) : null
}

/**
 * Beats into the track: the position now less the first beat, at the track's tempo.
 * Re-anchored on every `playProgress`, so it can't drift. Null without a tempo for the
 * track, when the field follows its level alone.
 */
export function widgetBeats(anchor: Anchor | null, now: number, tempo: Tempo | null): number | null {
  const position = positionAt(anchor, now)
  if (position === null || !tempo) return null
  return ((position - tempo.firstBeatMs) / 1000) * (tempo.bpm / 60)
}

/** Fetches a waveform's JSON, or null on any failure: the field then follows "playing" alone. */
async function fetchWaveform(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

/** Each sound's levels, once per session: a playlist comes back round to the same tracks. */
const loaded = new Map<string, Promise<Float32Array | null>>()

export interface SoundCloudBridge {
  readonly playing: boolean
  /** One message of the widget's, already checked by `readWidgetMessage`. */
  receive: (message: WidgetMessage) => void
  dispose: () => void
}

export function createSoundCloudBridge(
  options: {
    /** `content/tempos.ts`'s unless a spec gives its own. */
    tempos?: Readonly<Record<string, Tempo>>
    now?: () => number
    /** The waveform's JSON, parsed; injected by the specs. */
    load?: (url: string) => Promise<unknown>
  } = {},
): SoundCloudBridge {
  const tempos = options.tempos ?? siteTempos
  const now = options.now ?? (() => performance.now())
  const load = options.load ?? fetchWaveform
  // The specs' loader is theirs alone: the session's cache is the real one's.
  const cache = options.load ? new Map<string, Promise<Float32Array | null>>() : loaded
  let playing = false
  let disposed = false
  let anchor: Anchor | null = null
  let tempo: Tempo | null = null
  let sound: string | null = null
  let levels: Float32Array | null = null
  let durationMs = 0
  let detach: (() => void) | null = null

  const setPlaying = (next: boolean) => {
    if (disposed || next === playing) return
    playing = next
    if (next) {
      detach = attachMusic({
        id: 'soundcloud',
        beats: () => widgetBeats(anchor, now(), tempo),
        level: () => {
          const position = positionAt(anchor, now())
          return position === null ? null : levelAt(levels, position, durationMs)
        },
        get bpm() {
          return tempo?.bpm ?? null
        },
      })
    } else {
      detach?.()
      detach = null
    }
  }

  const onSound = (value: unknown) => {
    const current = value as { permalink_url?: unknown; waveform_url?: unknown; duration?: unknown } | null
    const path = permalinkPath(current?.permalink_url)
    tempo = path && Object.hasOwn(tempos, path) ? tempos[path]! : null
    const url = waveformJsonUrl(current?.waveform_url)
    const duration = current?.duration
    durationMs = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0
    if (url === sound) return
    sound = url
    levels = null
    if (!url) return
    let pending = cache.get(url)
    if (!pending) {
      pending = load(url).then(waveformLevels, () => null)
      cache.set(url, pending)
    }
    void pending.then((read) => {
      // Another sound by now, or none: this one's waveform is no longer the field's.
      if (sound === url && !disposed) levels = read
    })
  }

  return {
    get playing() {
      return playing
    },
    receive(message) {
      switch (message.method) {
        case 'play':
          setPlaying(true)
          break
        case 'pause':
        case 'finish':
          setPlaying(false)
          break
        case 'isPaused':
          if (typeof message.value === 'boolean') setPlaying(!message.value)
          break
        case 'playProgress': {
          // The position only, never whether it plays: the real widget sends a few more
          // after `pause`, and taking them for playing kept the field going in silence. A
          // listener that came in late is told by `isPaused`, which `listen` asks.
          const position = (message.value as { currentPosition?: unknown } | null)?.currentPosition
          if (typeof position === 'number' && Number.isFinite(position) && position >= 0) {
            anchor = { positionMs: position, at: now() }
          }
          break
        }
        case 'getCurrentSound':
          onSound(message.value)
          break
        default:
          // Anything else the widget says is not this bridge's business.
          break
      }
    },
    dispose() {
      setPlaying(false)
      disposed = true
    },
  }
}
