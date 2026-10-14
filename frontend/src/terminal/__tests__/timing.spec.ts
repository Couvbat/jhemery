import { describe, expect, it } from 'vitest'
import { sleep } from '../timing'

describe('sleep', () => {
  it('rejects the moment the signal aborts', async () => {
    const controller = new AbortController()
    const waiting = sleep(60_000, controller.signal)
    controller.abort()
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  })

  // A command can be cancelled while it awaits something that doesn't take the signal; the
  // pause after it must not then wait out its whole length and let the command walk on.
  it('rejects at once when the signal aborted before it began', async () => {
    const controller = new AbortController()
    controller.abort()
    const started = Date.now()
    await expect(sleep(60_000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
