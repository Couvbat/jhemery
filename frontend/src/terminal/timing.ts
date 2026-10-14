/** Delay that rejects with an `AbortError` the moment the command is cancelled —
 *  every paced or animated command awaits this rather than a bare setTimeout, so
 *  Ctrl+C lands within a frame instead of at the end of the animation. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // Cancelled before the wait began, while the command was busy with something that
    // doesn't take the signal: an abort that already fired never fires again, so the
    // listener below would wait out the whole delay and the command carry on after it.
    if (signal?.aborted) return reject(abortError())
    const id = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id)
        reject(abortError())
      },
      { once: true },
    )
  })
}

/** The rejection `execute()` recognises as "cancelled" rather than "failed". */
export function abortError(): Error {
  return Object.assign(new Error('aborted'), { name: 'AbortError' })
}
