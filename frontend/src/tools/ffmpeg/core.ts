import { FFFSType, FFmpeg, type LogEvent, type ProgressEvent } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import workerURL from './ffmpeg.worker.js?worker&url'
import { CORE_BYTES, mountName } from './media'

/**
 * The browser half of the ffmpeg tool: fetching the core and driving the worker.
 * `media.ts` decides *what* to run; this file only runs it.
 *
 * The core is served from our own `/assets/`, not the unpkg URL the wrapper would
 * default to. The CSP in public/.htaccess allows scripts and connections from `'self'`
 * only and stays that way; and a hashed `/assets/` file is the one kind of file that
 * header marks immutable, so the 32 MB is fetched once per browser rather than once
 * per visit. It is the single-thread core: the multi-thread one wants
 * SharedArrayBuffer, hence COOP/COEP on the document, and that would break the
 * SoundCloud embed sharing this single-page document (spec §5, tier wasm).
 */

export type DownloadProgress = (received: number, total: number) => void

/**
 * Fetches the wasm once, with progress, so the worker's own fetch a moment later hits
 * the HTTP cache. `FFmpeg.load()` reports nothing, and 32 MB with nothing moving reads
 * as a hang. Content-Length is the *compressed* size when Apache deflates the file
 * (or absent when it chunks), while the reader yields decoded bytes — so the known
 * decoded size is the denominator whenever a content encoding is in play.
 */
export async function warmCache(onProgress: DownloadProgress, signal?: AbortSignal): Promise<void> {
  const response = await fetch(wasmURL, { signal })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
  const declared = Number(response.headers.get('content-length'))
  const total = !response.headers.get('content-encoding') && declared > 0 ? declared : CORE_BYTES
  const reader = response.body.getReader()
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    onProgress(Math.min(received, total), total)
  }
}

/** ffmpeg ran and exited non-zero. `log` is the tail of its stderr — the reason is
 *  almost always the last line. */
export class FfmpegError extends Error {
  constructor(
    readonly code: number,
    readonly log: string[],
  ) {
    super(`ffmpeg exited with code ${code}`)
    this.name = 'FfmpegError'
  }
}

const MOUNT = '/in'
const PROBE = '/probe.json'
const LOG_TAIL = 12

export interface Engine {
  /** ffprobe's JSON for the file, for `parseProbe`. */
  probe(file: File): Promise<string>
  /** Runs ffmpeg with `args(inputPath)` writing to `output`, and returns those bytes. */
  run(
    file: File,
    args: (input: string) => string[],
    output: string,
    onTime: (micros: number) => void,
  ): Promise<Uint8Array>
  /** Kills the worker, mid-run or not. The engine is dead afterwards; make a new one. */
  terminate(): void
}

export async function createEngine(): Promise<Engine> {
  const ffmpeg = new FFmpeg()
  await ffmpeg.load({ coreURL, wasmURL, classWorkerURL: workerURL })

  /**
   * WORKERFS reads the File in place, off the disk through FileReaderSync, instead
   * of copying it into the wasm heap first. That is what lets a multi-gigabyte input
   * work at all — the heap is 32-bit — and spares every smaller file a copy too.
   * Cleanup is best-effort: after `terminate()` the worker is gone and the unmount
   * fails, and that failure must not hide the error the caller actually got.
   */
  async function withInput<T>(file: File, body: (input: string) => Promise<T>): Promise<T> {
    const name = mountName(file.name)
    await ffmpeg.createDir(MOUNT)
    await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name, data: file }] }, MOUNT)
    try {
      return await body(`${MOUNT}/${name}`)
    } finally {
      try {
        await ffmpeg.unmount(MOUNT)
        await ffmpeg.deleteDir(MOUNT)
      } catch {
        // See above.
      }
    }
  }

  /** The last few log lines, minus the `Aborted()` the core prints as its way of
   *  returning from `main()` — on success as much as on failure, so never the reason. */
  function keepTail(lines: string[], line: string) {
    if (line.startsWith('Aborted')) return
    lines.push(line)
    if (lines.length > LOG_TAIL) lines.shift()
  }

  return {
    // Two quirks of this core shape the probe. Its ffprobe reports -1 whether or not
    // it succeeded (only `-version` comes back 0), and it sends its log and its JSON
    // down the same `stdout` channel, so neither the exit code nor the stream can be
    // the verdict. The JSON goes to a file instead, and the file is the verdict: a
    // file ffprobe could not read leaves `{ }` behind, which `parseProbe` rejects.
    probe: (file) =>
      withInput(file, async (input) => {
        const log: string[] = []
        const onLog = ({ message }: LogEvent) => keepTail(log, message)
        ffmpeg.on('log', onLog)
        try {
          await ffmpeg.ffprobe([
            '-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', '-o', PROBE, input,
          ])
        } finally {
          ffmpeg.off('log', onLog)
        }
        let json: string | Uint8Array
        try {
          json = await ffmpeg.readFile(PROBE, 'utf8')
        } catch {
          throw new FfmpegError(-1, log)
        }
        await ffmpeg.deleteFile(PROBE)
        if (typeof json !== 'string') throw new FfmpegError(-1, log)
        return json
      }),

    run: (file, args, output, onTime) =>
      withInput(file, async (input) => {
        const stderr: string[] = []
        const onLog = ({ type, message }: LogEvent) => {
          if (type === 'stderr') keepTail(stderr, message)
        }
        const onProgress = ({ time }: ProgressEvent) => onTime(time)
        ffmpeg.on('log', onLog)
        ffmpeg.on('progress', onProgress)
        let code: number
        try {
          code = await ffmpeg.exec(['-hide_banner', '-nostdin', '-y', ...args(input), output])
        } finally {
          ffmpeg.off('log', onLog)
          ffmpeg.off('progress', onProgress)
        }
        if (code !== 0) throw new FfmpegError(code, stderr)
        const data = await ffmpeg.readFile(output, 'binary')
        await ffmpeg.deleteFile(output)
        if (typeof data === 'string') throw new FfmpegError(code, stderr)
        return data
      }),

    terminate: () => ffmpeg.terminate(),
  }
}
