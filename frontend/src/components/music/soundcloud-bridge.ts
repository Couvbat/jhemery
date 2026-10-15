import { tempos as siteTempos, type Tempo } from '@/content/music'
import { attachMusic } from '@/lib/music-signal'

/**
 * What the music section's SoundCloud frame is playing, for the field to follow
 * (`docs/superpowers/specs/2026-10-15-music-reactive-field-design.md`, *SoundCloud*). Its
 * audio plays in a cross-origin frame no analyser can reach, so it can only be followed:
 * play, pause and position, over `postMessage`.
 *
 * **The protocol is SoundCloud's `api.js`, spoken by hand**, read before this was written:
 * the parent posts `JSON.stringify({ method, value })` to the frame; `addEventListener`
 * with an event name as the value subscribes, once the widget has said `ready`; a getter
 * is its name with a null value, and its reply comes back under the same method name. It
 * is what their script sends, not a documented contract: if it changes, the bridge hears
 * nothing and the field simply doesn't react. Loading `api.js` itself would add
 * `https://w.soundcloud.com` to `script-src`, which `useMusicPlayer.ts` records the site
 * choosing not to.
 *
 * Imported when the visitor loads the player, never before: the frame waits behind a button
 * for its cookies, and the bridge waits with it. It reads play state, position and the
 * permalink, keeps none of it, and sends nothing anywhere but to the frame.
 */

export const WIDGET_ORIGIN = 'https://w.soundcloud.com'
const EVENTS = ['play', 'pause', 'finish', 'playProgress'] as const
/** A message longer than this is no widget's. */
const MAX_MESSAGE = 200_000

export interface WidgetMessage {
  method: string
  value: unknown
}

/**
 * A message from this frame's widget, or null for anything else: another origin, another
 * frame, a payload that isn't the protocol's JSON. Another origin's input, read as
 * defensively as a save link is.
 */
export function readWidgetMessage(event: { origin: string; source: unknown; data: unknown }, frame: unknown): WidgetMessage | null {
  if (event.origin !== WIDGET_ORIGIN || !frame || event.source !== frame) return null
  if (typeof event.data !== 'string' || event.data.length > MAX_MESSAGE) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(event.data)
  } catch {
    return null
  }
  const message = parsed as { method?: unknown; value?: unknown } | null
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return null
  return { method: message.method, value: message.value }
}

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

/** Where the widget said it was, and when, on the page's clock. */
export interface Anchor {
  positionMs: number
  at: number
}

/**
 * Beats into the track: the position now, from the last anchor and the time since, less
 * the first beat, at the track's tempo. Re-anchored on every `playProgress`, so it can't
 * drift. Null without a tempo for the track, when the field follows "playing" alone.
 */
export function widgetBeats(anchor: Anchor | null, now: number, tempo: Tempo | null): number | null {
  if (!anchor || !tempo) return null
  const positionMs = anchor.positionMs + Math.max(0, now - anchor.at)
  return ((positionMs - tempo.firstBeatMs) / 1000) * (tempo.bpm / 60)
}

export interface SoundCloudBridge {
  readonly playing: boolean
  dispose: () => void
}

export function createSoundCloudBridge(
  frame: HTMLIFrameElement,
  options: {
    tempos?: Readonly<Record<string, Tempo>>
    onPlaying?: (playing: boolean) => void
    now?: () => number
    target?: Window
  } = {},
): SoundCloudBridge {
  const tempos = options.tempos ?? siteTempos
  const now = options.now ?? (() => performance.now())
  const target = options.target ?? window
  let playing = false
  let anchor: Anchor | null = null
  let tempo: Tempo | null = null
  let detach: (() => void) | null = null

  const send = (method: string, value: unknown = null) => {
    frame.contentWindow?.postMessage(JSON.stringify({ method, value }), WIDGET_ORIGIN)
  }
  const subscribe = () => {
    for (const name of EVENTS) send('addEventListener', name)
    send('getCurrentSound')
  }

  const setPlaying = (next: boolean) => {
    if (next === playing) return
    playing = next
    if (next) {
      detach = attachMusic({
        id: 'soundcloud',
        beats: () => widgetBeats(anchor, now(), tempo),
        get bpm() {
          return tempo?.bpm ?? null
        },
      })
    } else {
      detach?.()
      detach = null
    }
    options.onPlaying?.(next)
  }

  const onMessage = (event: MessageEvent) => {
    const message = readWidgetMessage(event, frame.contentWindow)
    if (!message) return
    switch (message.method) {
      case 'ready':
        subscribe()
        break
      case 'play':
        setPlaying(true)
        // The sound may be another one of the playlist's by now.
        send('getCurrentSound')
        break
      case 'pause':
      case 'finish':
        setPlaying(false)
        break
      case 'playProgress': {
        const position = (message.value as { currentPosition?: unknown } | null)?.currentPosition
        if (typeof position === 'number' && Number.isFinite(position) && position >= 0) {
          anchor = { positionMs: position, at: now() }
        }
        // As `api.js` does: progress before a play event means it is playing.
        setPlaying(true)
        break
      }
      case 'getCurrentSound': {
        const path = permalinkPath((message.value as { permalink_url?: unknown } | null)?.permalink_url)
        tempo = path && Object.hasOwn(tempos, path) ? tempos[path]! : null
        break
      }
      default:
        // Anything else the widget says is not this bridge's business.
        break
    }
  }

  target.addEventListener('message', onMessage)
  // The widget may have said `ready` before this chunk arrived; it says so again after a
  // reload of the frame, which `api.js` answers by subscribing again too.
  const onLoad = () => subscribe()
  frame.addEventListener('load', onLoad)
  subscribe()

  return {
    get playing() {
      return playing
    },
    dispose() {
      target.removeEventListener('message', onMessage)
      frame.removeEventListener('load', onLoad)
      setPlaying(false)
    },
  }
}
