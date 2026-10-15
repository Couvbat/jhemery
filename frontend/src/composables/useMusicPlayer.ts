import { computed, ref, watch } from 'vue'
import { soundcloudEmbedSrc } from '@/content'
import { embedColour } from './useTheme'

/**
 * Lets the terminal's `play` command start the SoundCloud embed in the music section.
 * Bumping the nonce remounts the iframe with `auto_play=true`, the only way to start it
 * from outside. Once loaded, the frame's play state comes back through
 * `components/music/soundcloud-bridge.ts`, which speaks the widget's `postMessage` protocol
 * by hand rather than pulling in SoundCloud's widget script; that state is `playing` below.
 */
const nonce = ref(0)
/** Whether the frame says it is playing, from the bridge: false until it says so. */
const playing = ref(false)

export function setPlayerPlaying(value: boolean) {
  playing.value = value
}

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
    playerPlaying: computed(() => playing.value),
    requestPlayback,
    loadPlayer,
  }
}

/**
 * The music section's frame: its `src`, and `load` for the button. Here rather than in
 * `MusicSection` so a spec can press the button, since the unit suite compiles no `.vue`.
 *
 * The player is drawn in the scheme's green, read each time a frame is built: during setup
 * (a player asked for earlier mounts with the section), when the button mounts it, and on
 * each `play` remount. Never on a scheme change while one is up: a new `src` reloads the
 * cross-origin player and stops whatever it was playing. `embedColour()` is the scheme's
 * green, but never a forged one's: that would follow the visitor to SoundCloud on every visit.
 */
export function useMusicEmbed() {
  const { autoplayNonce } = useMusicPlayer()
  const colour = ref(embedColour())
  watch(autoplayNonce, () => {
    colour.value = embedColour()
  })
  return {
    src: computed(() => soundcloudEmbedSrc(colour.value, autoplayNonce.value > 0)),
    load() {
      // The scheme may have changed since setup, and there is no frame yet to reload.
      colour.value = embedColour()
      loadPlayer()
    },
  }
}
