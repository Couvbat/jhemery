import { watch } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The animations only run when motion is allowed. Only that one check is
// overridden — `top` reads `useCrt().overdrive` for real to decide whether the
// shader shows up as a process.
vi.mock('@/composables/useCrt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useCrt')>()),
  prefersReducedMotion: () => false,
}))

import { TRAIN } from '@/terminal/ascii'
import { useTerminal } from '../useTerminal'

const { buffer, clearBuffer, run } = useTerminal()
const TRAIN_ROWS = TRAIN.split('\n')
/** The art is indented in source, so the top row is matched by its own content
 *  rather than by a leading edge. One match per locomotive in the buffer. */
const TOP_ROW = TRAIN_ROWS[0]!.trim()

function locomotiveCount() {
  return buffer.value.filter((l) => l.pre && l.text.trim() === TOP_ROW).length
}

function trainRows() {
  return buffer.value.filter((l) => l.pre).map((l) => l.text)
}

describe('ctx.frame()', () => {
  beforeEach(() => {
    clearBuffer()
    vi.useFakeTimers()
  })

  it('redraws `sl` in place instead of stacking one train per step', async () => {
    const done = run('sl')
    await vi.runAllTimersAsync()
    await done

    // The regression: every animation step used to append a fresh copy, so the
    // buffer ended up holding a column of stacked locomotives.
    expect(locomotiveCount()).toBe(1)
  })

  it('leaves the train at its final position, at the art’s own indent', async () => {
    const done = run('sl')
    await vi.runAllTimersAsync()
    await done

    expect(trainRows()).toEqual(TRAIN_ROWS)
  })

  it('keeps output printed after the animation below the frame', async () => {
    const done = run('sl')
    await vi.runAllTimersAsync()
    await done

    const last = buffer.value.at(-1)
    expect(last?.pre).not.toBe(true)
    expect(locomotiveCount()).toBe(1)
  })

  it('does not eat lines printed before the frame opened', async () => {
    await run('fortune')
    const before = [...buffer.value]

    const done = run('sl')
    await vi.runAllTimersAsync()
    await done

    // Redrawing walks backwards from the end of the buffer, so an off-by-one in
    // the frame height would silently swallow whatever came before it.
    expect(buffer.value.slice(0, before.length)).toEqual(before)
  })
})

const TABLE_HEADER = 'PID    %CPU  %MEM  STAT  COMMAND'

function processTableCount() {
  return buffer.value.filter((l) => l.text === TABLE_HEADER).length
}

describe('top', () => {
  beforeEach(() => {
    clearBuffer()
    vi.useFakeTimers()
  })

  it('redraws one process table rather than stacking six', async () => {
    const done = run('top')
    await vi.runAllTimersAsync()
    await done

    expect(processTableCount()).toBe(1)
  })

  it('leaves the scrollback alone', async () => {
    await run('fortune')
    const before = [...buffer.value]

    const done = run('top')
    await vi.runAllTimersAsync()
    await done

    // It used to `clear()` between frames, so anything the visitor had run
    // before `top` was gone by the time it finished.
    expect(buffer.value.slice(0, before.length)).toEqual(before)
  })

  it('keeps the process rows in a stable order across frames', async () => {
    const seen: string[][] = []
    // Every redraw is a whole new buffer, so watching `buffer` catches each frame.
    const stop = watch(
      () => buffer.value,
      (lines) => {
        const start = lines.findIndex((l) => l.text === TABLE_HEADER)
        if (start === -1) return
        // Process rows only — the lines appended once the frame closes are not
        // part of the table and would otherwise show up as a phantom reorder.
        const pids = lines
          .slice(start + 1)
          .filter((l) => l.pre && /^\d/.test(l.text))
          .map((l) => l.text.slice(0, 7).trim())
        seen.push(pids)
      },
    )

    const done = run('top')
    await vi.runAllTimersAsync()
    await done
    stop()

    // Reshuffling per frame was cover for the full repaint; in place it just
    // teleports rows around. The jittered %CPU is what makes it look live now.
    expect(seen.length).toBeGreaterThan(1)
    for (const frame of seen) expect(frame).toEqual(seen[0])
  })
})
