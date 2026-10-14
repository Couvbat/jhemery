import { computed, ref } from 'vue'

/** Raised by `reboot`, cleared by `BootSequence` once the replay has finished —
 *  same flag-and-acknowledge shape as `useMatrix`, so the command stays a
 *  one-liner and the animation keeps owning its own lifecycle. */
const active = ref(false)
/** Whether the sequence is on screen, the first visit's play included, which `active` never
 *  sees. What has to stand aside while it plays (the x-ray layer's Esc) reads this. */
const playing = ref(false)

/** Set by `BootSequence` as it shows and ends the sequence; nothing else writes it. */
export function setBootPlaying(value: boolean) {
  playing.value = value
}

export function triggerBoot() {
  active.value = true
}

export function ackBoot() {
  active.value = false
}

export function useBoot() {
  return {
    bootActive: computed(() => active.value),
    bootPlaying: computed(() => playing.value),
    triggerBoot,
    ackBoot,
  }
}
