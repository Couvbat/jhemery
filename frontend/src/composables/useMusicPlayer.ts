import { computed, ref } from 'vue'

/**
 * Lets the terminal's `play` command start the SoundCloud embed in the music section.
 * Bumping the nonce remounts the iframe with `auto_play=true`; SoundCloud offers no
 * post-load API without pulling in their widget script.
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
