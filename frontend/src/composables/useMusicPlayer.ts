import { computed, ref } from 'vue'

/**
 * Lets the terminal's `play` command start the SoundCloud embed in the music section.
 * Bumping the nonce remounts the iframe with `auto_play=true`; SoundCloud offers no
 * post-load API without pulling in their widget script.
 */
const nonce = ref(0)

export function requestPlayback() {
  nonce.value += 1
}

export function useMusicPlayer() {
  return { autoplayNonce: computed(() => nonce.value), requestPlayback }
}
