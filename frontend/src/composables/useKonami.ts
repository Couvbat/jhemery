import { onMounted, onUnmounted } from 'vue'

const SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
]

/** Fires `onComplete` when the Konami code is entered anywhere on the page. */
export function useKonami(onComplete: () => void) {
  let progress = 0

  function onKeydown(event: KeyboardEvent) {
    const expected = SEQUENCE[progress]
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

    if (key === expected) {
      progress += 1
      if (progress === SEQUENCE.length) {
        progress = 0
        onComplete()
      }
      return
    }

    // A wrong key restarts — but if it matches the first step, count it as step one.
    progress = key === SEQUENCE[0] ? 1 : 0
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}
