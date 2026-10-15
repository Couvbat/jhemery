import { readonly, ref } from 'vue'

/**
 * A mix the terminal's `stems <id>` asks the music section's mixer to open: a mix code with
 * a default mix, which the mixer reads exactly as it reads a `?mix=` link, so a track
 * picked from the terminal and one picked from a link take the same path. Here rather than
 * in the mixer, whose chunk the terminal must not pull in.
 */
const requested = ref<string | null>(null)

export function requestStemsMix(code: string): void {
  requested.value = code
}

export function useStemsRequest() {
  return {
    requested: readonly(requested),
    /** The mixer took it: a later `stems` with the same id still counts as a new request. */
    take: () => {
      requested.value = null
    },
  }
}
