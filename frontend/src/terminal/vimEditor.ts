import type { VimBufferState, VimCursor } from './types'

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock'])

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

/** Vim's `^`: the first non-blank, or the last character of a line that is all
 *  blanks. */
function firstNonBlank(state: VimBufferState) {
  const line = currentLine(state)
  const col = line.search(/\S/)
  state.cursor.col = col === -1 ? Math.max(0, line.length - 1) : col
}

/** Linewise delete of rows `from`..`to`, for `dd`, `dj` and `dk`. A buffer is
 *  never zero lines, so deleting all of them leaves one empty line, as in vim.
 *  The cursor goes to the first non-blank of whichever line takes the range's
 *  place — vim's 'startofline' default, not neovim's. */
function deleteLines(state: VimBufferState, from: number, to: number) {
  if (to - from + 1 === state.lines.length) {
    if (state.lines.length === 1 && state.lines[0] === '') return
    state.lines.splice(0, state.lines.length, '')
  } else {
    state.lines.splice(from, to - from + 1)
  }
  state.cursor.row = Math.min(from, state.lines.length - 1)
  state.dirty = true
  firstNonBlank(state)
}

/** Deletes columns `from` up to, not including, `to` on the cursor's line and
 *  leaves the cursor at `from`: every charwise delete that stays on one line.
 *  An empty span changes nothing, so it doesn't dirty the buffer either. */
function deleteSpan(state: VimBufferState, from: number, to: number) {
  if (to <= from) return
  const line = currentLine(state)
  state.lines[state.cursor.row] = line.slice(0, from) + line.slice(to)
  state.cursor.col = from
  state.dirty = true
  clampCol(state, false)
}

/** Vim's character classes for `w` and `e`: blanks, word characters, and
 *  everything else. Its default 'iskeyword' takes Latin-1's accented letters,
 *  and vim classes any other Unicode letter as a word character too, hence
 *  `\p{L}`. */
function charClass(char: string): 0 | 1 | 2 {
  if (/\s/.test(char)) return 0
  return /[\p{L}\p{N}_]/u.test(char) ? 2 : 1
}

/** The class at `p`, where a line's end counts as a blank: that is how `e`
 *  sees the break between two lines. */
function classAt(state: VimBufferState, p: VimCursor) {
  const line = state.lines[p.row] ?? ''
  return p.col < line.length ? charClass(line.charAt(p.col)) : 0
}

/** Vim's `inc()`: one character on, stopping on a line's end before the next
 *  line's first character. False at the end of the buffer. */
function step(state: VimBufferState, p: VimCursor): boolean {
  if (p.col < (state.lines[p.row] ?? '').length) p.col += 1
  else if (p.row < state.lines.length - 1) {
    p.row += 1
    p.col = 0
  } else return false
  return true
}

/** Where `e` lands from the cursor, following vim's `end_word()`: the end of
 *  the word under the cursor, or from the end of one (or a blank) the end of
 *  the next, across lines if need be. With only blanks left it stops on the
 *  buffer's last character. Null when there is nowhere to go at all. */
function wordEnd(state: VimBufferState): VimCursor | null {
  const p = { ...state.cursor }
  const startClass = classAt(state, p)
  if (!step(state, p)) return null
  if (startClass === 0 || classAt(state, p) !== startClass) {
    while (classAt(state, p) === 0) {
      if (!step(state, p)) {
        if (p.col > 0) p.col -= 1
        return p
      }
    }
  }
  const wordClass = classAt(state, p)
  while (classAt(state, p) === wordClass) step(state, p)
  // One past the word, and always still on its line: a line's end is a blank.
  p.col -= 1
  return p
}

/** `de`: a charwise delete from the cursor through `end`, inclusive, and the
 *  only one that can span lines. Vim turns such a delete linewise when it
 *  starts within the indent and leaves nothing but blanks on its last line. */
function deleteThrough(state: VimBufferState, end: VimCursor) {
  const { row, col } = state.cursor
  const line = currentLine(state)
  const rest = (state.lines[end.row] ?? '').slice(end.col + 1)
  if (end.row > row && rest.trim() === '' && col <= line.length - line.trimStart().length) {
    deleteLines(state, row, end.row)
    return
  }
  state.lines.splice(row, end.row - row + 1, line.slice(0, col) + rest)
  state.dirty = true
  clampCol(state, false)
}

/** `dw`: the rest of the word under the cursor and the blanks after it. Under
 *  an operator `w` stops at the end of the line instead of moving on to the next
 *  line's first word, so the last word of a line never takes the line break
 *  with it. The one way across a line is from an empty line: `w` lands in
 *  column 0 of the next, an exclusive motion ending in column 0 turns linewise,
 *  and the empty line itself is what gets deleted. */
function deleteWord(state: VimBufferState) {
  const line = currentLine(state)
  const { row, col } = state.cursor
  if (line === '') {
    if (row < state.lines.length - 1) deleteLines(state, row, row)
    return
  }

  const startClass = charClass(line.charAt(col))
  let end = col + 1
  if (startClass !== 0) {
    while (end < line.length && charClass(line.charAt(end)) === startClass) end += 1
  }
  while (end < line.length && charClass(line.charAt(end)) === 0) end += 1

  deleteSpan(state, col, end)
}

/** Completes a pending `d` with the key that followed it. A key that isn't one
 *  of these motions cancels the operator and is itself dropped, as in vim; so
 *  does a motion that can't move (`j` on the last line, `k` on the first, `h`
 *  and `0` in column 0). */
function applyDelete(key: string, state: VimBufferState) {
  const { row, col } = state.cursor
  switch (key) {
    case 'd':
      deleteLines(state, row, row)
      return
    case 'j':
    case 'ArrowDown':
      if (row < state.lines.length - 1) deleteLines(state, row, row + 1)
      return
    case 'k':
    case 'ArrowUp':
      if (row > 0) deleteLines(state, row - 1, row)
      return
    case 'h':
    case 'ArrowLeft':
      deleteSpan(state, Math.max(0, col - 1), col)
      return
    // `l` can't move off the last character, but under an operator vim lets it
    // take that character anyway.
    case 'l':
    case 'ArrowRight':
      deleteSpan(state, col, Math.min(col + 1, currentLine(state).length))
      return
    case '0':
      deleteSpan(state, 0, col)
      return
    // `$` is inclusive: the character under the cursor goes too.
    case '$':
      deleteSpan(state, col, currentLine(state).length)
      return
    case 'w':
      deleteWord(state)
      return
    case 'e': {
      const end = wordEnd(state)
      if (end) deleteThrough(state, end)
      return
    }
  }
}

function handleNormalKey(key: string, state: VimBufferState): void {
  if (state.pending === 'd') {
    state.pending = null
    applyDelete(key, state)
    return
  }

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
    // Vim defines `x` as `dl`.
    case 'x':
      applyDelete('l', state)
      return
    case 'd':
      state.pending = 'd'
      return
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
 * in place. Returns `false` only for `:` — the caller lets that fall through to
 * the existing command-line typing mechanism unchanged. Every other key is
 * considered handled, including ones this editor doesn't map to anything, since
 * real vim's normal mode silently swallows unmapped keys rather than leaking them
 * into the shell. That includes Escape in normal mode: it used to bubble up to
 * the overlay's close path, which submitted `:q!` — so the key every vim user
 * mashes to make sure they're in normal mode quit the editor, threw the edits
 * away and handed out the `:q!` achievement for it. In real vim it does nothing.
 */
export function handleVimKey(state: VimBufferState, event: KeyboardEvent): boolean {
  // A modifier pressed on its own is a keydown of its own in the browser, but
  // never a key to vim. `$` is Shift+4 on QWERTY, and that Shift must not
  // cancel the `d` waiting for it.
  if (MODIFIER_KEYS.has(event.key)) return true
  if (event.key === ':') {
    state.pending = null
    return false
  }
  if (state.mode === 'insert') {
    handleInsertKey(event, state)
    return true
  }
  handleNormalKey(event.key, state)
  return true
}
