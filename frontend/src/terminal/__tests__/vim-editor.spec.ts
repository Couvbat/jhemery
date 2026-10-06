import { describe, expect, it } from 'vitest'
import { handleVimKey } from '../vimEditor'
import type { VimBufferState } from '../types'

function buffer(lines: string[], row = 0, col = 0): VimBufferState {
  return {
    name: 'about.txt',
    lines,
    cursor: { row, col },
    mode: 'normal',
    dirty: false,
    statusMessage: null,
    pending: null,
  }
}

function press(state: VimBufferState, ...keys: string[]) {
  for (const key of keys) handleVimKey(state, new KeyboardEvent('keydown', { key }))
  return state
}

describe('dd', () => {
  it('deletes the line under the cursor', () => {
    const state = press(buffer(['one', 'two', 'three'], 1, 2), 'd', 'd')
    expect(state.lines).toEqual(['one', 'three'])
    expect(state.dirty).toBe(true)
  })

  // Vim's default 'startofline': the cursor does not keep its column.
  it('lands on the first non-blank of the line that took its place', () => {
    const state = press(buffer(['one', 'two', '   indented'], 1, 2), 'd', 'd')
    expect(state.cursor).toEqual({ row: 1, col: 3 })
  })

  it('moves up to the new last line after deleting the last one', () => {
    const state = press(buffer(['  one', 'two'], 1, 1), 'd', 'd')
    expect(state.lines).toEqual(['  one'])
    expect(state.cursor).toEqual({ row: 0, col: 2 })
  })

  it('leaves one empty line rather than no lines at all', () => {
    const state = press(buffer(['only'], 0, 3), 'd', 'd')
    expect(state.lines).toEqual([''])
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(state.dirty).toBe(true)
  })

  it('changes nothing, so dirties nothing, on a buffer that is one empty line', () => {
    const state = press(buffer(['']), 'd', 'd')
    expect(state.lines).toEqual([''])
    expect(state.dirty).toBe(false)
  })

  it('waits after a single `d`, deleting nothing yet', () => {
    const state = press(buffer(['one', 'two']), 'd')
    expect(state.lines).toEqual(['one', 'two'])
    expect(state.pending).toBe('d')
  })

  it('is cancelled by a key that is not a second `d`, which is not run either', () => {
    const state = press(buffer(['one', 'two']), 'd', 'x')
    expect(state.lines).toEqual(['one', 'two'])
    expect(state.pending).toBeNull()
    // and the `d` that follows starts afresh instead of completing the old one
    press(state, 'd')
    expect(state.lines).toEqual(['one', 'two'])
  })

  it('is cancelled by Escape', () => {
    const state = press(buffer(['one', 'two']), 'd', 'Escape', 'd')
    expect(state.lines).toEqual(['one', 'two'])
  })

  // `:` goes to the shell input, not the editor; a `d` left waiting behind it
  // would fire on the next `d` after a refused `:q`.
  it('is cancelled by opening the command line', () => {
    const state = buffer(['one', 'two'])
    press(state, 'd')
    expect(handleVimKey(state, new KeyboardEvent('keydown', { key: ':' }))).toBe(false)
    expect(state.pending).toBeNull()
  })
})

describe('dj', () => {
  it('deletes the line under the cursor and the one below', () => {
    const state = press(buffer(['one', 'two', 'three', '  four'], 1, 1), 'd', 'j')
    expect(state.lines).toEqual(['one', '  four'])
    expect(state.cursor).toEqual({ row: 1, col: 2 })
    expect(state.dirty).toBe(true)
  })

  it('does nothing on the last line, where `j` cannot move', () => {
    const state = press(buffer(['one', 'two'], 1), 'd', 'j')
    expect(state.lines).toEqual(['one', 'two'])
    expect(state.dirty).toBe(false)
    expect(state.pending).toBeNull()
  })

  it('leaves one empty line when it takes the whole buffer', () => {
    expect(press(buffer(['one', 'two']), 'd', 'j').lines).toEqual([''])
  })

  it('takes the down arrow too, which is `j` everywhere else in this editor', () => {
    expect(press(buffer(['one', 'two', 'three']), 'd', 'ArrowDown').lines).toEqual(['three'])
  })
})

describe('dk', () => {
  it('deletes the line under the cursor and the one above', () => {
    const state = press(buffer(['one', 'two', 'three', '  four'], 2, 1), 'd', 'k')
    expect(state.lines).toEqual(['one', '  four'])
    expect(state.cursor).toEqual({ row: 1, col: 2 })
  })

  it('moves up to the new last line after taking the last two', () => {
    const state = press(buffer(['one', 'two', 'three'], 2), 'd', 'k')
    expect(state.lines).toEqual(['one'])
    expect(state.cursor.row).toBe(0)
  })

  it('does nothing on the first line, where `k` cannot move', () => {
    const state = press(buffer(['one', 'two']), 'd', 'k')
    expect(state.lines).toEqual(['one', 'two'])
    expect(state.dirty).toBe(false)
  })

  it('takes the up arrow too', () => {
    expect(press(buffer(['one', 'two', 'three'], 1), 'd', 'ArrowUp').lines).toEqual(['three'])
  })
})

describe('d$', () => {
  it('deletes from the cursor to the end of the line, and steps back onto what is left', () => {
    const state = press(buffer(['hello world'], 0, 5), 'd', '$')
    expect(state.lines).toEqual(['hello'])
    expect(state.cursor).toEqual({ row: 0, col: 4 })
    expect(state.dirty).toBe(true)
  })

  it('empties the line from column 0', () => {
    const state = press(buffer(['hello', 'world']), 'd', '$')
    expect(state.lines).toEqual(['', 'world'])
    expect(state.cursor.col).toBe(0)
  })

  it('changes nothing on an empty line', () => {
    const state = press(buffer(['', 'world']), 'd', '$')
    expect(state.lines).toEqual(['', 'world'])
    expect(state.dirty).toBe(false)
  })

  // `$` is Shift+4 on a QWERTY board, so the browser sends a Shift keydown
  // between the two. Vim never sees that key; it must not cancel the `d`.
  it('survives the Shift that comes before `$`', () => {
    expect(press(buffer(['hello world'], 0, 5), 'd', 'Shift', '$').lines).toEqual(['hello'])
  })
})

describe('dw', () => {
  it('deletes the word and the blanks after it', () => {
    const state = press(buffer(['foo bar baz']), 'd', 'w')
    expect(state.lines).toEqual(['bar baz'])
    expect(state.cursor).toEqual({ row: 0, col: 0 })
    expect(state.dirty).toBe(true)
  })

  it('deletes only the rest of the word from inside it', () => {
    expect(press(buffer(['foo bar'], 0, 1), 'd', 'w').lines).toEqual(['fbar'])
  })

  it('treats a run of punctuation as a word of its own', () => {
    expect(press(buffer(['foo.bar']), 'd', 'w').lines).toEqual(['.bar'])
    expect(press(buffer(['foo..bar'], 0, 3), 'd', 'w').lines).toEqual(['foobar'])
  })

  // The site's copy is French: `déjà` has to be one word, not three.
  it('counts accented letters as word characters', () => {
    expect(press(buffer(['déjà vu']), 'd', 'w').lines).toEqual(['vu'])
  })

  // Vim's special case: `w` under an operator stops at the end of the line
  // rather than reaching the next line's first word.
  it('stops at the end of the line on the last word, instead of joining the next', () => {
    const state = press(buffer(['foo bar', 'baz'], 0, 4), 'd', 'w')
    expect(state.lines).toEqual(['foo ', 'baz'])
    expect(state.cursor).toEqual({ row: 0, col: 3 })
  })

  it('deletes trailing blanks up to the end of the line', () => {
    expect(press(buffer(['foo   ', 'bar'], 0, 3), 'd', 'w').lines).toEqual(['foo', 'bar'])
  })

  // From an empty line `w` lands in column 0 of the next, and an exclusive
  // motion ending in column 0 turns linewise: the empty line itself goes.
  it('deletes an empty line', () => {
    const state = press(buffer(['one', '', '  two'], 1), 'd', 'w')
    expect(state.lines).toEqual(['one', '  two'])
    expect(state.cursor).toEqual({ row: 1, col: 2 })
  })

  it('does nothing on an empty last line, where `w` has nowhere to go', () => {
    const state = press(buffer(['one', ''], 1), 'd', 'w')
    expect(state.lines).toEqual(['one', ''])
    expect(state.dirty).toBe(false)
  })
})
