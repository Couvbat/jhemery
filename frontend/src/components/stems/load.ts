import { DECODED_BYTES_PER_SECOND, type StemTrack } from '@/content/stems'

/**
 * Fetches a track's stems and decodes them, counting the bytes as they arrive so the
 * button can say how far along it is. All at once: they are a handful of files from this
 * site's own host. Nothing is fetched until the visitor asks: a track is megabytes, and
 * most visitors to the music section only listen.
 */

/** What the load button announces. */
export function downloadBytes(track: Pick<StemTrack, 'stems'>): number {
  return track.stems.reduce((sum, stem) => sum + stem.bytes, 0)
}

/** What the track costs held decoded, all its stems together. */
export function decodedBytes(track: Pick<StemTrack, 'seconds' | 'stems'>): number {
  return track.seconds * DECODED_BYTES_PER_SECOND * track.stems.length
}

async function fetchCounting(url: string, onBytes: (bytes: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal })
  if (!response.ok || !response.body) throw new Error(`${url}: ${response.status}`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
    onBytes(value.length)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out.buffer
}

export async function loadStems(
  context: BaseAudioContext,
  track: StemTrack,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<AudioBuffer[]> {
  const total = downloadBytes(track) || 1
  let loaded = 0
  return Promise.all(
    track.stems.map(async (stem) => {
      const data = await fetchCounting(
        `/stems/${stem.file}`,
        (bytes) => {
          loaded += bytes
          onProgress(Math.min(1, loaded / total))
        },
        signal,
      )
      return context.decodeAudioData(data)
    }),
  )
}
