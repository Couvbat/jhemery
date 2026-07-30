import type { VimBufferState } from './types'

function currentLine(state: VimBufferState): string {
  return state.lines[state.cursor.row] ?? ''
}

/** Clamps the cursor's column to the current line's bounds. `allowEnd` permits
 *  sitting one past the last character (used when entering insert mode via
 *  `a`/`A`); normal-mode movement never allows that. */
function clampCol(state: VimBufferState, allowEnd: boolean) {
  const len = currentLine(state).length
  const max = allowEnd ? len : Math.max(0, len - 1)
  state.cursor.col = Math.min(Math.max(0, state.cursor.col), max)
}

function moveLeft(state: VimBufferState) {
  state.cursor.col = Math.max(0, state.cursor.col - 1)
}

function moveRight(state: VimBufferState) {
  state.cursor.col = Math.min(state.cursor.col + 1, Math.max(0, currentLine(state).length - 1))
}

function moveDown(state: VimBufferState) {
  state.cursor.row = Math.min(state.cursor.row + 1, state.lines.length - 1)
  clampCol(state, false)
}

function moveUp(state: VimBufferState) {
  state.cursor.row = Math.max(state.cursor.row - 1, 0)
  clampCol(state, false)
}

function handleNormalKey(key: string, state: VimBufferState): void {
  switch (key) {
    case 'h':
    case 'ArrowLeft':
      moveLeft(state)
      return
    case 'l':
    case 'ArrowRight':
      moveRight(state)
      return
    case 'j':
    case 'ArrowDown':
      moveDown(state)
      return
    case 'k':
    case 'ArrowUp':
      moveUp(state)
      return
    case '0':
      state.cursor.col = 0
      return
    case '$':
      state.cursor.col = Math.max(0, currentLine(state).length - 1)
      return
    case 'i':
      state.mode = 'insert'
      return
    case 'I':
      state.cursor.col = 0
      state.mode = 'insert'
      return
    case 'a':
      state.cursor.col = Math.min(state.cursor.col + 1, currentLine(state).length)
      state.mode = 'insert'
      return
    case 'A':
      state.cursor.col = currentLine(state).length
      state.mode = 'insert'
      return
    case 'o':
      state.lines.splice(state.cursor.row + 1, 0, '')
      state.cursor.row += 1
      state.cursor.col = 0
      state.mode = 'insert'
      state.dirty = true
      return
    case 'O':
      state.lines.splice(state.cursor.row, 0, '')
      state.cursor.col = 0
      state.mode = 'insert'
      state.dirty = true
      return
    case 'x': {
      const line = currentLine(state)
      if (line.length > 0 && state.cursor.col < line.length) {
        state.lines[state.cursor.row] =
          line.slice(0, state.cursor.col) + line.slice(state.cursor.col + 1)
        state.dirty = true
        clampCol(state, false)
      }
      return
    }
    default:
      return
  }
}

function handleInsertKey(event: KeyboardEvent, state: VimBufferState): void {
  const { key } = event

  if (key === 'Escape') {
    state.mode = 'normal'
    state.cursor.col = Math.max(0, state.cursor.col - 1)
    return
  }
  if (key === 'ArrowLeft') {
    moveLeft(state)
    return
  }
  if (key === 'ArrowRight') {
    moveRight(state)
    return
  }
  if (key === 'ArrowUp') {
    moveUp(state)
    return
  }
  if (key === 'ArrowDown') {
    moveDown(state)
    return
  }
  if (key === 'Backspace') {
    if (state.cursor.col > 0) {
      const line = currentLine(state)
      state.lines[state.cursor.row] =
        line.slice(0, state.cursor.col - 1) + line.slice(state.cursor.col)
      state.cursor.col -= 1
      state.dirty = true
    } else if (state.cursor.row > 0) {
      const line = currentLine(state)
      const prevLine = state.lines[state.cursor.row - 1] ?? ''
      state.lines.splice(state.cursor.row - 1, 2, prevLine + line)
      state.cursor.row -= 1
      state.cursor.col = prevLine.length
      state.dirty = true
    }
    return
  }
  if (key === 'Enter') {
    const line = currentLine(state)
    const before = line.slice(0, state.cursor.col)
    const after = line.slice(state.cursor.col)
    state.lines.splice(state.cursor.row, 1, before, after)
    state.cursor.row += 1
    state.cursor.col = 0
    state.dirty = true
    return
  }
  if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
    const line = currentLine(state)
    state.lines[state.cursor.row] = line.slice(0, state.cursor.col) + key + line.slice(state.cursor.col)
    state.cursor.col += 1
    state.dirty = true
  }
}

/**
 * Dispatches one keydown to the vim pane's cursor/mode/buffer state, mutating it
 * in place. Returns `false` for `:` — the caller lets that fall through to the
 * existing command-line typing mechanism unchanged — and for `Escape` in normal
 * mode, since there's nothing for it to do there (real vim's normal-mode Escape
 * is a no-op) and the caller needs it to bubble up to the "nudge toward `:q`"
 * handling instead of silently going nowhere. Escape in insert mode is still
 * fully handled here (drop back to normal mode) so it doesn't *also* trigger
 * that nudge. Every other key is considered handled, including ones this editor
 * doesn't map to anything, since real vim's normal mode silently swallows
 * unmapped keys rather than leaking them into the shell.
 */
export function handleVimKey(state: VimBufferState, event: KeyboardEvent): boolean {
  if (event.key === ':') return false
  if (state.mode === 'insert') {
    handleInsertKey(event, state)
    return true
  }
  if (event.key === 'Escape') return false
  handleNormalKey(event.key, state)
  return true
}
