/**
 * Opening and closing the acid sequencer's `AudioContext`, kept apart from the engine
 * because of when each has to run.
 *
 * A context may only start inside the visitor's own gesture, and Safari reads that
 * strictly: `resume()` has to be called from the click's or the keystroke's call
 * stack, not from a continuation after an `await`. The shell imports the engine
 * lazily, and by the time that import resolves the keystroke is over, so the context
 * is opened here, from a module small enough to import eagerly, before the first
 * `await` of whatever the gesture ran. The engine then takes the context it is handed
 * and never creates one. That keeps the browser's autoplay rule as a second wall behind
 * `isLinkable`, which refuses `?run=acid`: a context opened without a gesture stays
 * suspended, and the engine has no way to make another.
 */
export function openAudioContext(): AudioContext | null {
  const Context =
    globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  try {
    const context = new Context()
    void context.resume().catch(() => {})
    return context
  } catch {
    return null
  }
}

/** Long enough for the engine's release (a 10 ms time constant) to reach silence, so
 *  closing the context doesn't cut a note off with a click. */
const FADE_MS = 80

export function closeAfterFade(context: AudioContext): void {
  window.setTimeout(() => void context.close().catch(() => {}), FADE_MS)
}
