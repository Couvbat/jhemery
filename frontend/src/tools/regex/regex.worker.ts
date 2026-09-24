/// <reference lib="webworker" />
/**
 * One run per worker: the panel creates this, posts one job, and terminates it when
 * the answer arrives or a second has passed — whichever is first. Terminating is the
 * whole reason it exists (see `regex.ts`).
 */
import { runRegex } from './regex'

self.onmessage = (event: MessageEvent<{ pattern: string; flags: string; text: string }>) => {
  const { pattern, flags, text } = event.data
  self.postMessage(runRegex(pattern, flags, text))
}
