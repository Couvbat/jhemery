import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { soundcloudEmbedSrc } from '@/content'
import { embedColour, useTheme } from './useTheme'

/**
 * Lets the terminal's `play` command start the SoundCloud embed in the music section.
 * Bumping the nonce remounts the iframe with `auto_play=true`, the only way to start it
 * from outside.
 */
const nonce = ref(0)

/**
 * Whether the visitor asked for the player. SoundCloud's frame sets its own cookies, so it
 * waits behind a button until then (see `MusicSection`); `play` is asking too. Module-level,
 * so a visit asks once, not once per mount of the section.
 */
const requested = ref(false)

export function requestPlayback() {
  nonce.value += 1
}

export function loadPlayer() {
  requested.value = true
}

export function useMusicPlayer() {
  return {
    autoplayNonce: computed(() => nonce.value),
    playerLoaded: computed(() => requested.value || nonce.value > 0),
    requestPlayback,
    loadPlayer,
  }
}

/** Where the widget lives: the only origin its messages are read from or posted to. */
export const SOUNDCLOUD_ORIGIN = 'https://w.soundcloud.com'

/**
 * What the music section's frame is subscribed to. `play`, `pause` and `finish` are the
 * repaint's; `playProgress` is the field's (`components/music/soundcloud-bridge.ts`), which
 * follows the position, and asks for the sound with `getCurrentSound`. One conversation for
 * both, so the widget is subscribed once.
 */
export const WIDGET_EVENTS = ['play', 'pause', 'finish', 'playProgress'] as const

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
  if (event.origin !== SOUNDCLOUD_ORIGIN || !frame || event.source !== frame) return null
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

/**
 * How long a stopped player has to start again before it counts as stopped: between two
 * tracks of the playlist the widget says `finish`, then `play` for the next one, and a
 * repaint in that gap would cut the next track off.
 */
export const STOP_GRACE_MS = 1_500

const HANDSHAKE_MS = 500
const HANDSHAKE_TRIES = 20

/**
 * The music section's frame: its `src`, and `load` for the button. Here rather than in
 * `MusicSection` so a spec can press the button, since the unit suite compiles no `.vue`.
 *
 * The player is drawn in the scheme's green. SoundCloud has no call that recolours a live
 * widget: a new colour is a new `src`, which reloads the cross-origin player and stops it.
 * So **a repaint never interrupts sound**. A scheme picked while the frame is up repaints
 * it at once unless it is playing (a paused player starts again from the top of the
 * playlist, which is what a reload costs); while it plays, the new colour waits until it
 * stops. It used to wait for good, and a scheme picked after the button pressed never
 * reached the player at all.
 *
 * Whether it is playing is the widget's own word, over the `postMessage` protocol its
 * `api.js` speaks: `{ method, value }` as JSON, `play`, `pause` and `finish` for whoever
 * subscribes, and `isPaused` answered when asked. Spoken directly, as the radio rooms' player
 * speaks it, so no SoundCloud script runs on the site; every message is checked to come
 * from this frame on SoundCloud's origin (`readWidgetMessage`). This is the frame's only
 * conversation: the field's bridge hears it through `listen` rather than subscribing the
 * widget a second time.
 *
 * Previews (`tour`'s, the 🎨 menu's) don't count: only the chosen scheme repaints the
 * player. `embedColour()` is that scheme's green, but never a forged one's, which would
 * follow the visitor to SoundCloud on every visit.
 */
export function useMusicEmbed(frame?: Ref<HTMLIFrameElement | null>) {
  const { autoplayNonce } = useMusicPlayer()
  const { chosen } = useTheme()
  const colour = ref(embedColour())
  // Only a `play` remount autoplays: a repaint of a player the visitor paused must not
  // start it again. Until the frame says otherwise, an autoplaying one is taken at its word.
  const autoplay = ref(autoplayNonce.value > 0)
  let playing = autoplay.value
  /**
   * From a stop until its grace is over, whether or not a repaint waits on it: a `finish`
   * may be the gap before the next track, and a scheme picked in it must not cut that off.
   */
  let settling = false
  /**
   * The colour a scheme picked while the player played (or settled) is to be painted in.
   * Read when it was picked, while that scheme is what is painted: by the time the player
   * stops, a preview may be showing, and the frame would keep the preview's colour.
   */
  let pending: string | null = null
  let grace: ReturnType<typeof setTimeout> | undefined

  const repaint = (autoplaying: boolean, next = embedColour()) => {
    pending = null
    settling = false
    clearTimeout(grace)
    colour.value = next
    autoplay.value = autoplaying
    playing = autoplaying
  }

  watch(autoplayNonce, () => repaint(true))

  watch(chosen, () => {
    const next = embedColour()
    // Back to the frame's own colour: nothing to repaint any more, and a reload now would
    // only cost the visitor their place.
    if (next === colour.value) pending = null
    else if (playing || settling) pending = next
    else repaint(false, next)
  })

  const post = (method: string, value?: unknown) =>
    frame?.value?.contentWindow?.postMessage(JSON.stringify({ method, value }), SOUNDCLOUD_ORIGIN)

  // Subscriptions sent before the widget listens are lost (the rooms' player found this),
  // so from each load they are sent again until the widget answers anything. The question
  // is asked with them, since a `play` remount may have started before it was subscribed
  // to. Ten seconds, then a frame that never answers is left alone.
  let heard = false
  let handshake: ReturnType<typeof setInterval> | undefined
  const subscribe = () => {
    for (const name of WIDGET_EVENTS) post('addEventListener', name)
    post('isPaused', null)
    post('getCurrentSound', null)
  }
  const listeners = new Set<(message: WidgetMessage) => void>()
  function onFrameLoad() {
    heard = false
    clearInterval(handshake)
    subscribe()
    let tries = 1
    handshake = setInterval(() => {
      if (heard || tries++ >= HANDSHAKE_TRIES) clearInterval(handshake)
      else subscribe()
    }, HANDSHAKE_MS)
  }

  function onMessage(event: MessageEvent) {
    const message = readWidgetMessage(event, frame?.value?.contentWindow)
    if (!message) return
    heard = true
    switch (message.method) {
      // Said unprompted once the widget listens, which stops the retries above before any
      // of them may have landed: subscribing now is what `api.js` does, and it is heard.
      case 'ready':
        subscribe()
        break
      // The answer to the handshake's question: a `play` remount the browser wouldn't let
      // autoplay is a stopped player, and a colour waiting on it can go in.
      case 'isPaused':
        if (message.value === true) stopped()
        else if (message.value === false) started()
        break
      case 'play':
        started()
        // The playlist may have moved on to another sound.
        post('getCurrentSound', null)
        break
      case 'pause':
      case 'finish':
        stopped()
        break
    }
    for (const listener of listeners) listener(message)
  }

  function started() {
    playing = true
    settling = false
    clearTimeout(grace)
  }

  function stopped() {
    // Only a player that was playing has a next track that may be about to start (and the
    // widget's events can arrive twice: the grace runs from the first).
    if (!playing) return
    playing = false
    settling = true
    clearTimeout(grace)
    grace = setTimeout(() => {
      settling = false
      if (pending) repaint(false, pending)
    }, STOP_GRACE_MS)
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', onMessage)
    onScopeDispose(() => {
      window.removeEventListener('message', onMessage)
      listeners.clear()
      clearTimeout(grace)
      clearInterval(handshake)
    })
  }

  return {
    src: computed(() => soundcloudEmbedSrc(colour.value, autoplay.value)),
    /** For the frame's `load` event: each `src` is a new player to subscribe to. */
    onFrameLoad,
    /**
     * Hears every message of the frame's widget after the repaint has, until the returned
     * function is called. One that arrives late asks what it missed, so it is told again.
     */
    listen(listener: (message: WidgetMessage) => void): () => void {
      listeners.add(listener)
      post('isPaused', null)
      post('getCurrentSound', null)
      return () => listeners.delete(listener)
    },
    load() {
      // The scheme may have changed since setup, and there is no frame yet to reload.
      repaint(false)
      loadPlayer()
    },
  }
}
