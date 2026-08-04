import { computed, ref } from 'vue'

/** Raised by `reboot`, cleared by `BootSequence` once the replay has finished —
 *  same flag-and-acknowledge shape as `useMatrix`, so the command stays a
 *  one-liner and the animation keeps owning its own lifecycle. */
const active = ref(false)

export function triggerBoot() {
  active.value = true
}

export function ackBoot() {
  active.value = false
}

export function useBoot() {
  return { bootActive: computed(() => active.value), triggerBoot, ackBoot }
}
