import { abortError } from '../timing'
import type { CommandContext } from '../types'
import type { Dir } from './2048'

/** Arrows and `wasd`. Anything else is not a move. */
export function toDirection(key: string): Dir | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
      return 'up'
    case 'ArrowDown':
    case 's':
      return 'down'
    case 'ArrowLeft':
    case 'a':
      return 'left'
    case 'ArrowRight':
    case 'd':
      return 'right'
    default:
      return null
  }
}

export interface KeyStream {
  /** Resolves with the next key, or immediately with one pressed while nobody was
   *  waiting. Rejects with an `AbortError` when the command is cancelled. */
  next: (signal?: AbortSignal) => Promise<string>
  release: () => void
}

/**
 * A pull-based reader over the push-based `ctx.capture`, for the turn-based game.
 * It buffers, so keys pressed between two `next()` calls are queued rather than
 * dropped — which is the whole reason the context primitive is push-based.
 */
export function keyStream(capture: CommandContext['capture']): KeyStream {
  const queued: string[] = []
  let waiting: ((key: string) => void) | null = null

  const release = capture((key) => {
    if (waiting) {
      const resolve = waiting
      waiting = null
      resolve(key)
    } else {
      queued.push(key)
    }
  })

  return {
    next(signal) {
      const buffered = queued.shift()
      if (buffered !== undefined) return Promise.resolve(buffered)
      if (signal?.aborted) return Promise.reject(abortError())

      return new Promise<string>((resolve, reject) => {
        const onAbort = () => {
          waiting = null
          reject(abortError())
        }
        waiting = (key) => {
          signal?.removeEventListener('abort', onAbort)
          resolve(key)
        }
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    },
    release,
  }
}
