import { computed, ref } from 'vue'

/**
 * Whether x-ray mode is on: `App.vue` mounts `XrayLayer` while it is, and the `xray`
 * command flips it. Nothing else lives here, so the eager chunk carries two booleans and
 * the layer, the map of words and the measuring all wait in the layer's own chunk.
 * Not saved: a reload forgets it, which is part of why `xray` writes nothing.
 */
const on = ref(false)
/**
 * Whether the layer's *this visit's path* panel is open. Closed unless asked for, by
 * `xray path` or the layer's own button, so the trace is fetched only then.
 */
const path = ref(false)

/**
 * Toggles, or forces a state. Returns the state it leaves. Turning it on opens the panel
 * only when `path` says so; turning it off closes the panel with it.
 */
export function setXray(enabled = !on.value, options: { path?: boolean } = {}): boolean {
  on.value = enabled
  path.value = enabled && (options.path ?? false)
  return enabled
}

export function setXrayPath(open: boolean): void {
  path.value = on.value && open
}

export function useXray() {
  return { xrayOn: computed(() => on.value), xrayPath: computed(() => path.value), setXray, setXrayPath }
}
