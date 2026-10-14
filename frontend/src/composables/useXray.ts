import { computed, ref } from 'vue'

/**
 * Whether x-ray mode is on: `App.vue` mounts `XrayLayer` while it is, and the `xray`
 * command flips it. Nothing else lives here, so the eager chunk carries a boolean and
 * the layer, the map of words and the measuring all wait in the layer's own chunk.
 * Not saved: a reload forgets it, which is part of why `xray` writes nothing.
 */
const on = ref(false)

/** Toggles, or forces a state. Returns the state it leaves. */
export function setXray(enabled = !on.value): boolean {
  on.value = enabled
  return enabled
}

export function useXray() {
  return { xrayOn: computed(() => on.value), setXray }
}
