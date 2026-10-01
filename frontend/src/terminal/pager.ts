import { pre } from './format'
import type { CommandContext, OutputLine } from './types'

/**
 * `less`, for `man`: a page at a time through `ctx.frame`, the keyboard held with
 * `ctx.capture`. The keys are a pure state machine (`pagerKey`), as `vimEditor.ts` is for
 * vim, so they are tested without a shell.
 *
 * j/↓/Enter and k/↑ move a line, space/f and b a page, g and G to either end; `/` reads a
 * search, Enter runs it, `n` and `N` go to the next and previous match; `q` quits and leaves
 * nothing behind, as `less` gives the screen back. A page that fits is just printed, as
 * `less -F` does: nobody should have to press q to leave three lines. Not a tty (the left
 * of a `|`), it hands back the whole page, so `man ls | grep -i all` works.
 */

export const PAGE_ROWS = 20

export interface PagerState {
  lines: OutputLine[]
  top: number
  /** The line the last search landed on, so `n` moves on from it even when the page can't scroll further. */
  match: number
  /** Non-null while `/` is reading a search. */
  typing: string | null
  query: string
  /** Shown on the status line until the next key: "Pattern not found". */
  message: string | null
}

export function openPager(lines: OutputLine[]): PagerState {
  return { lines, top: 0, match: -1, typing: null, query: '', message: null }
}

const lastTop = (state: PagerState) => Math.max(0, state.lines.length - PAGE_ROWS)
const clampTop = (state: PagerState, top: number) => Math.min(lastTop(state), Math.max(0, top))

/** The line after (or before) `from` that contains the query, or -1. */
function find(state: PagerState, from: number, step: 1 | -1): number {
  const query = state.query.toLowerCase()
  if (!query) return -1
  for (let i = from; i >= 0 && i < state.lines.length; i += step) {
    if (state.lines[i]!.text.toLowerCase().includes(query)) return i
  }
  return -1
}

function jump(state: PagerState, step: 1 | -1): void {
  const from = state.match < 0 ? (step === 1 ? state.top : state.top - 1) : state.match + step
  const at = find(state, from, step)
  if (at < 0) {
    state.message = 'Pattern not found'
    return
  }
  state.match = at
  state.top = clampTop(state, at)
}

/** One key: whether the pager is done, and the state changed in place otherwise. */
export function pagerKey(state: PagerState, key: string): 'quit' | 'stay' {
  state.message = null
  if (state.typing !== null) {
    if (key === 'Enter') {
      state.query = state.typing || state.query
      state.typing = null
      state.match = -1
      jump(state, 1)
    } else if (key === 'Escape') state.typing = null
    else if (key === 'Backspace') state.typing = state.typing.slice(0, -1)
    else if (key.length === 1) state.typing += key
    return 'stay'
  }
  switch (key) {
    case 'q':
    case 'Q':
    case 'Escape':
      return 'quit'
    case 'j':
    case 'ArrowDown':
    case 'Enter':
      state.top = clampTop(state, state.top + 1)
      break
    case 'k':
    case 'ArrowUp':
      state.top = clampTop(state, state.top - 1)
      break
    case ' ':
    case 'f':
    case 'PageDown':
      state.top = clampTop(state, state.top + PAGE_ROWS)
      break
    case 'b':
    case 'PageUp':
      state.top = clampTop(state, state.top - PAGE_ROWS)
      break
    case 'g':
    case 'Home':
      state.top = 0
      break
    case 'G':
    case 'End':
      state.top = lastTop(state)
      break
    case '/':
      state.typing = ''
      break
    case 'n':
      jump(state, 1)
      return 'stay'
    case 'N':
      jump(state, -1)
      return 'stay'
  }
  // Scrolling by hand forgets the match: the next `n` searches from what is on screen.
  state.match = -1
  return 'stay'
}

/** What is on screen: a page of lines and the status line under it. */
export function pagerView(state: PagerState, title: string): OutputLine[] {
  const shown = state.lines.slice(state.top, state.top + PAGE_ROWS)
  const last = Math.min(state.lines.length, state.top + PAGE_ROWS)
  const status =
    state.typing !== null
      ? `/${state.typing}`
      : (state.message ?? `Manual page ${title} line ${state.top + 1}-${last}/${state.lines.length} (press q to quit, / to search)`)
  return [...shown, pre(status, state.typing !== null ? 'default' : 'accent')]
}

/**
 * Shows `lines` a page at a time and resolves when the reader quits. Returns the lines
 * instead when there is no reader (not a tty) or when they fit on one page.
 */
export function page(ctx: CommandContext, lines: OutputLine[], title: string): Promise<OutputLine[] | void> {
  if (!ctx.tty || lines.length <= PAGE_ROWS) return Promise.resolve(lines)
  const state = openPager(lines)
  const draw = ctx.frame()
  draw(pagerView(state, title))
  return new Promise((resolve, reject) => {
    const release = ctx.capture((key) => {
      if (pagerKey(state, key) === 'quit') {
        draw([])
        release()
        resolve()
      } else draw(pagerView(state, title))
    }, { escape: true })
    ctx.signal.addEventListener(
      'abort',
      () => {
        draw([])
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      },
      { once: true },
    )
  })
}
