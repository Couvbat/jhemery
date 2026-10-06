import type { VimBufferState, VimChange, VimCursor, VimSnapshot } from './types'

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock'])

/** Vim's own ceiling on a count, so a long run of digits can't overflow. */
const MAX_COUNT = 999_999_999

function lineAt(state: VimBufferState, row: number): string {
  return state.lines[row] ?? ''
}

function currentLine(state: VimBufferState): string {
  return lineAt(state, state.cursor.row)
}

/** Clamps the cursor's column to the current line's bounds. `allowEnd` permits
 *  sitting one past the last character (used when entering insert mode via
 *  `a`/`A`); normal-mode movement never allows that. */
function clampCol(state: VimBufferState, allowEnd: boolean) {
  const len = currentLine(state).length
  const max = allowEnd ? len : Math.max(0, len - 1)
  state.cursor.col = Math.min(Math.max(0, state.cursor.col), max)
}

function moveLeft(state: VimBufferState, count = 1) {
  state.cursor.col = Math.max(0, state.cursor.col - count)
}

function moveRight(state: VimBufferState, count = 1) {
  state.cursor.col = Math.min(state.cursor.col + count, Math.max(0, currentLine(state).length - 1))
}

function moveDown(state: VimBufferState, count = 1) {
  state.cursor.row = Math.min(state.cursor.row + count, state.lines.length - 1)
  clampCol(state, false)
}

function moveUp(state: VimBufferState, count = 1) {
  state.cursor.row = Math.max(state.cursor.row - count, 0)
  clampCol(state, false)
}

const ARROW_MOVES: Record<string, (state: VimBufferState) => void> = {
  ArrowLeft: moveLeft,
  ArrowRight: moveRight,
  ArrowUp: moveUp,
  ArrowDown: moveDown,
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
 *  line's first character. Returns what vim's does: 0 within a line, 2 onto
 *  its end, 1 onto the next line, and -1 at the end of the buffer. */
function step(state: VimBufferState, p: VimCursor): -1 | 0 | 1 | 2 {
  const length = lineAt(state, p.row).length
  if (p.col < length) {
    p.col += 1
    return p.col < length ? 0 : 2
  }
  if (p.row < state.lines.length - 1) {
    p.row += 1
    p.col = 0
    return 1
  }
  return -1
}

/** Where `w` lands under an operator, after vim's `fwd_word()`: past the word
 *  under the cursor and the blanks after it, `count` times, an empty line
 *  counting as a word. Only the last of them stops at the end of its line
 *  rather than going on to the next line's first word, which is why `dw` on a
 *  line's last word never takes the line break with it but `d2w` can. */
function wordForward(state: VimBufferState, count: number): VimCursor {
  const p = { ...state.cursor }
  for (let left = count; left > 0; left -= 1) {
    const last = left === 1
    const startClass = classAt(state, p)
    const onLastRow = p.row === state.lines.length - 1
    let moved = step(state, p)
    // The last `w` stops on a line's end; from the buffer's, none can go on.
    if (moved === -1 || (moved > 0 && (onLastRow || last))) return p
    if (startClass !== 0) {
      while (classAt(state, p) === startClass) {
        moved = step(state, p)
        if (moved === -1 || (moved > 0 && last)) return p
      }
    }
    while (classAt(state, p) === 0 && !(p.col === 0 && lineAt(state, p.row) === '')) {
      moved = step(state, p)
      if (moved === -1 || (moved > 0 && last)) return p
    }
  }
  return p
}

/** Where `e` lands, after vim's `end_word()`: the end of the word under the
 *  cursor, or from the end of one (or a blank) the end of the next, across
 *  lines if need be, `count` times. With only blanks left it stops on the
 *  buffer's last character. Null when there is nowhere to go at all. */
function wordEnd(state: VimBufferState, count: number): VimCursor | null {
  const p = { ...state.cursor }
  for (let done = 0; done < count; done += 1) {
    const startClass = classAt(state, p)
    if (step(state, p) === -1) return done === 0 ? null : p
    if (startClass === 0 || classAt(state, p) !== startClass) {
      while (classAt(state, p) === 0) {
        if (step(state, p) === -1) {
          if (p.col > 0) p.col -= 1
          return p
        }
      }
    }
    const wordClass = classAt(state, p)
    while (classAt(state, p) === wordClass) step(state, p)
    // One past the word, and always still on its line: a line's end is a blank.
    p.col -= 1
  }
  return p
}

/** A charwise delete from the cursor to `end`, finished the way vim's operator
 *  code finishes one, which is where its two linewise surprises live. An
 *  exclusive motion ending in column 0 of a later line ends instead at the end
 *  of the line before, and turns linewise if it started within the indent:
 *  that is how `dw` deletes an empty line. And a delete over several lines
 *  that starts within the indent and leaves only blanks after it takes those
 *  lines whole: `d2$` from column 0. */
function deleteCharwise(state: VimBufferState, end: VimCursor, inclusive: boolean) {
  const { row, col } = state.cursor
  const line = currentLine(state)
  const inIndent = col <= (/^[ \t]*/.exec(line)?.[0].length ?? 0)
  let lastRow = end.row
  let stop = inclusive ? end.col + 1 : end.col
  if (!inclusive && end.col === 0 && end.row > row) {
    if (inIndent) {
      deleteLines(state, row, end.row - 1)
      return
    }
    lastRow -= 1
    stop = lineAt(state, lastRow).length
  }

  const rest = lineAt(state, lastRow).slice(stop)
  if (lastRow > row && inIndent && /^[ \t]*$/.test(rest)) {
    deleteLines(state, row, lastRow)
    return
  }
  const joined = line.slice(0, col) + rest
  if (lastRow === row && joined === line) return
  state.lines.splice(row, lastRow - row + 1, joined)
  state.dirty = true
  clampCol(state, false)
}

/** Completes a pending `d` with the motion that followed it, `count` times. A
 *  key that isn't one of these motions cancels the operator and is itself
 *  dropped, as in vim; so does a motion that can't move (`j` on the last line,
 *  `k` on the first, `h` and `0` in column 0). */
function applyDelete(key: string, state: VimBufferState, count: number) {
  const { row, col } = state.cursor
  const lastRow = state.lines.length - 1
  switch (key) {
    // `Ndd` first moves down N - 1 lines, and vim's `cursor_down()` refuses to
    // from the last line: `2dd` there deletes nothing where `dd` would.
    case 'd':
      if (count > 1 && row === lastRow) return
      deleteLines(state, row, Math.min(row + count - 1, lastRow))
      return
    case 'j':
    case 'ArrowDown':
      if (row < lastRow) deleteLines(state, row, Math.min(row + count, lastRow))
      return
    case 'k':
    case 'ArrowUp':
      if (row > 0) deleteLines(state, Math.max(row - count, 0), row)
      return
    case 'h':
    case 'ArrowLeft':
      deleteSpan(state, Math.max(0, col - count), col)
      return
    // `l` can't move off the last character, but under an operator vim lets it
    // take that character anyway.
    case 'l':
    case 'ArrowRight':
      deleteSpan(state, col, Math.min(col + count, currentLine(state).length))
      return
    case '0':
      deleteSpan(state, 0, col)
      return
    // `$` is inclusive, so the character under the cursor goes too, and `N$`
    // ends N - 1 lines down, refused from the last line like `Ndd`.
    case '$': {
      if (count > 1 && row === lastRow) return
      const endRow = Math.min(row + count - 1, lastRow)
      deleteCharwise(state, { row: endRow, col: Math.max(0, lineAt(state, endRow).length - 1) }, true)
      return
    }
    case 'w':
      deleteCharwise(state, wordForward(state, count), false)
      return
    case 'e': {
      const end = wordEnd(state, count)
      if (end) deleteCharwise(state, end, true)
      return
    }
  }
}

function snapshot(state: VimBufferState): VimSnapshot {
  return { lines: [...state.lines], cursor: { ...state.cursor } }
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i])
}

/** Records the change that turned `before` into the buffer as it is now, if it
 *  changed at all: a motion, or a `d` whose motion couldn't move, is no change
 *  for `u` to take back. */
function record(state: VimBufferState, before: VimSnapshot) {
  if (sameLines(before.lines, state.lines)) return
  state.lastSeq += 1
  state.changes.push({ ...before, seq: state.lastSeq, time: Date.now() })
}

/** The lines two versions of the buffer don't share: where they start, and how
 *  many each version has there. */
function changedRegion(from: string[], to: string[]) {
  let top = 0
  while (top < from.length && top < to.length && from[top] === to[top]) top += 1
  let tail = 0
  while (
    tail < from.length - top &&
    tail < to.length - top &&
    from[from.length - 1 - tail] === to[to.length - 1 - tail]
  ) {
    tail += 1
  }
  return { top, removed: from.length - top - tail, added: to.length - top - tail }
}

/** Vim's `u_undo_end()` message: what the undo did to the line count, or how
 *  many lines it changed in place, then which change it went back before and
 *  when that was made. */
function undoMessage(removed: number, added: number, change: VimChange): string {
  const fewer = removed - added
  const what =
    fewer === -1
      ? '1 more line'
      : fewer < 0
        ? `${-fewer} more lines`
        : fewer === 1
          ? '1 line less'
          : fewer > 1
            ? `${fewer} fewer lines`
            : `${added} ${added === 1 ? 'change' : 'changes'}`
  const seconds = Math.floor((Date.now() - change.time) / 1000)
  const when =
    seconds < 100
      ? `${seconds} ${seconds === 1 ? 'second' : 'seconds'} ago`
      : new Date(change.time).toTimeString().slice(0, 8)
  return `${what}; before #${change.seq}  ${when}`
}

/** `u`: takes back the last `count` changes. The cursor goes where vim's
 *  `u_undoredo()` puts it: on the first changed line — or the line above when
 *  that is where the change was made from, as with `o` — at its old column if
 *  that is the line it was on, at the first non-blank if not. Back at the file
 *  as it was opened, the buffer is unmodified again, so `:q` lets go. */
function undo(state: VimBufferState, count: number) {
  if (state.changes.length === 0) {
    state.statusMessage = 'Already at oldest change'
    return
  }
  const undone = state.changes.splice(Math.max(0, state.changes.length - count))
  const oldest = undone[0]!
  const { top, removed, added } = changedRegion(state.lines, oldest.lines)
  state.lines = [...oldest.lines]

  const saved = oldest.cursor
  let row = top
  if (saved.row + 1 === row && row > 0) row -= 1
  if (row > state.lines.length - 1) {
    state.cursor.row = state.lines.length - 1
    state.cursor.col = 0
  } else if (row === saved.row) {
    state.cursor.row = row
    state.cursor.col = saved.col
    clampCol(state, false)
  } else {
    state.cursor.row = row
    firstNonBlank(state)
  }

  state.dirty = state.changes.length > 0
  state.statusMessage = undoMessage(removed, added, oldest)
}

function handleNormalKey(key: string, state: VimBufferState): void {
  // A count is digits, and `0` only continues one: on its own it is a motion.
  if (/^[1-9]$/.test(key) || (key === '0' && /\d$/.test(state.pending))) {
    state.pending += key
    return
  }

  const [, countBefore = '', operator = '', countAfter = ''] = /^(\d*)(d?)(\d*)$/.exec(state.pending) ?? []
  state.pending = ''
  // A count on each side of the operator multiplies, as in vim: `2d3w` is `d6w`.
  const count = Math.min(Number(countBefore || 1) * Number(countAfter || 1), MAX_COUNT)
  if (!operator && key === 'd') {
    state.pending = `${countBefore}d`
    return
  }
  if (!operator && key === 'u') {
    undo(state, count)
    return
  }

  const before = snapshot(state)
  if (operator) applyDelete(key, state, count)
  else runCommand(key, state, count)
  if (state.mode === 'normal') {
    record(state, before)
    return
  }
  // The command opened an insert session, recorded as one change when it ends.
  // Vim keeps the cursor from a change's first edit: `o` and `O` make theirs
  // before they move it, `i`, `a`, `I` and `A` not until a character is typed,
  // wherever they have put it by then.
  state.insertFrom = sameLines(before.lines, state.lines) ? snapshot(state) : before
}

function runCommand(key: string, state: VimBufferState, count: number): void {
  switch (key) {
    case 'h':
    case 'ArrowLeft':
      moveLeft(state, count)
      return
    case 'l':
    case 'ArrowRight':
      moveRight(state, count)
      return
    case 'j':
    case 'ArrowDown':
      moveDown(state, count)
      return
    case 'k':
    case 'ArrowUp':
      moveUp(state, count)
      return
    case '0':
      state.cursor.col = 0
      return
    case '$': {
      const lastRow = state.lines.length - 1
      if (count > 1 && state.cursor.row === lastRow) return
      state.cursor.row = Math.min(state.cursor.row + count - 1, lastRow)
      state.cursor.col = Math.max(0, currentLine(state).length - 1)
      return
    }
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
      applyDelete('l', state, count)
      return
    default:
      return
  }
}

function handleInsertKey(event: KeyboardEvent, state: VimBufferState): void {
  const { key } = event

  if (key === 'Escape') {
    if (state.insertFrom) record(state, state.insertFrom)
    state.insertFrom = null
    state.mode = 'normal'
    state.cursor.col = Math.max(0, state.cursor.col - 1)
    return
  }

  const move = ARROW_MOVES[key]
  if (move) {
    // An arrow in insert mode ends one change and starts another, as in vim:
    // `u` then takes back only what was typed since the cursor last moved.
    if (state.insertFrom) record(state, state.insertFrom)
    move(state)
    state.insertFrom = snapshot(state)
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
 * in place. Returns `false` only for `:` in normal mode — the caller lets that
 * fall through to the existing command-line typing mechanism unchanged. In
 * insert mode `:` is a character like any other. Every other key is
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
  if (state.mode === 'insert') {
    handleInsertKey(event, state)
    return true
  }
  if (event.key === ':') {
    state.pending = ''
    return false
  }
  handleNormalKey(event.key, state)
  return true
}
