import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    pending: '',
    changes: [],
    lastSeq: 0,
    insertFrom: null,
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
    expect(state.pending).toBe('')
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
    expect(state.pending).toBe('')
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
    expect(state.pending).toBe('')
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

describe('dh', () => {
  it('deletes the character before the cursor, and the cursor takes its place', () => {
    const state = press(buffer(['hello'], 0, 2), 'd', 'h')
    expect(state.lines).toEqual(['hllo'])
    expect(state.cursor.col).toBe(1)
    expect(state.dirty).toBe(true)
  })

  it('does nothing in column 0, where `h` cannot move', () => {
    const state = press(buffer(['hello']), 'd', 'h')
    expect(state.lines).toEqual(['hello'])
    expect(state.dirty).toBe(false)
  })

  it('takes the left arrow too', () => {
    expect(press(buffer(['hello'], 0, 2), 'd', 'ArrowLeft').lines).toEqual(['hllo'])
  })
})

describe('dl', () => {
  it('deletes the character under the cursor, which is all `x` is', () => {
    const state = press(buffer(['hello'], 0, 1), 'd', 'l')
    expect(state.lines).toEqual(['hllo'])
    expect(state.cursor.col).toBe(1)
    expect(press(buffer(['hello'], 0, 1), 'x').lines).toEqual(['hllo'])
  })

  // `l` cannot move off the last character, but under an operator vim lets it
  // take that character anyway — otherwise `x` could never delete it.
  it('deletes the last character, and steps back onto the new one', () => {
    const state = press(buffer(['hello'], 0, 4), 'd', 'l')
    expect(state.lines).toEqual(['hell'])
    expect(state.cursor.col).toBe(3)
  })

  it('does nothing on an empty line', () => {
    const state = press(buffer(['', 'two']), 'd', 'l')
    expect(state.lines).toEqual(['', 'two'])
    expect(state.dirty).toBe(false)
  })

  it('takes the right arrow too', () => {
    expect(press(buffer(['hello'], 0, 1), 'd', 'ArrowRight').lines).toEqual(['hllo'])
  })
})

describe('d0', () => {
  it('deletes from the start of the line up to, not including, the cursor', () => {
    const state = press(buffer(['hello world'], 0, 6), 'd', '0')
    expect(state.lines).toEqual(['world'])
    expect(state.cursor.col).toBe(0)
    expect(state.dirty).toBe(true)
  })

  it('does nothing in column 0', () => {
    const state = press(buffer(['hello']), 'd', '0')
    expect(state.lines).toEqual(['hello'])
    expect(state.dirty).toBe(false)
  })
})

describe('de', () => {
  // `e` is inclusive where `w` is exclusive: the word goes, the blank after it stays.
  it('deletes to the end of the word, keeping the blank after it', () => {
    const state = press(buffer(['foo bar']), 'd', 'e')
    expect(state.lines).toEqual([' bar'])
    expect(state.cursor.col).toBe(0)
    expect(state.dirty).toBe(true)
  })

  it('runs to the end of the next word from the end of one', () => {
    const state = press(buffer(['foo bar baz'], 0, 2), 'd', 'e')
    expect(state.lines).toEqual(['fo baz'])
    expect(state.cursor.col).toBe(2)
  })

  it('skips blanks to reach the end of the next word', () => {
    const state = press(buffer(['foo   bar'], 0, 3), 'd', 'e')
    expect(state.lines).toEqual(['foo'])
    expect(state.cursor.col).toBe(2)
  })

  it('uses the same word classes as `w`', () => {
    expect(press(buffer(['foo.bar']), 'd', 'e').lines).toEqual(['.bar'])
    expect(press(buffer(['foo.bar'], 0, 3), 'd', 'e').lines).toEqual(['foo'])
    expect(press(buffer(['déjà vu']), 'd', 'e').lines).toEqual([' vu'])
  })

  // Unlike `w`, `e` has no end-of-line special case: from a line's last word
  // it goes on to the next line's first, and the two lines join.
  it('crosses into the next line from the end of the last word', () => {
    const state = press(buffer(['foo', 'bar baz', 'qux'], 0, 2), 'd', 'e')
    expect(state.lines).toEqual(['fo baz', 'qux'])
    expect(state.cursor).toEqual({ row: 0, col: 2 })
  })

  // Vim's rule for a charwise delete over several lines: one that starts in the
  // indent and leaves only blanks after it becomes linewise.
  it('deletes whole lines when it starts in the indent and ends a line', () => {
    const state = press(buffer(['', 'bar', '  baz']), 'd', 'e')
    expect(state.lines).toEqual(['  baz'])
    expect(state.cursor).toEqual({ row: 0, col: 2 })
  })

  it('takes what is left at the end of the buffer', () => {
    expect(press(buffer(['foo  '], 0, 3), 'd', 'e').lines).toEqual(['foo'])
    expect(press(buffer(['foo'], 0, 2), 'd', 'e').lines).toEqual(['fo'])
  })

  it('does nothing on an empty last line', () => {
    const state = press(buffer(['foo', ''], 1), 'd', 'e')
    expect(state.lines).toEqual(['foo', ''])
    expect(state.dirty).toBe(false)
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

describe('counts', () => {
  const lines = () => ['one', 'two', 'three', 'four', 'five']

  describe('on `dd`, `dj` and `dk`', () => {
    it('`2dd` deletes two lines from the cursor', () => {
      const state = press(buffer(lines(), 1), '2', 'd', 'd')
      expect(state.lines).toEqual(['one', 'four', 'five'])
      expect(state.cursor.row).toBe(1)
    })

    it('takes the count after the `d` too, as `d2d`', () => {
      expect(press(buffer(lines(), 1), 'd', '2', 'd').lines).toEqual(['one', 'four', 'five'])
    })

    it('multiplies a count on each side: `2d2d` is four lines', () => {
      expect(press(buffer(lines()), '2', 'd', '2', 'd').lines).toEqual(['five'])
    })

    it('stops at the last line when the count runs past it', () => {
      expect(press(buffer(lines(), 3), '5', 'd', 'd').lines).toEqual(['one', 'two', 'three'])
    })

    // Vim's `cursor_down()` refuses outright from the last line, so a count
    // there deletes nothing, where a plain `dd` would.
    it('does nothing from the last line', () => {
      const state = press(buffer(lines(), 4), '2', 'd', 'd')
      expect(state.lines).toEqual(lines())
      expect(state.dirty).toBe(false)
    })

    it('`d2j` deletes the line and the two below', () => {
      expect(press(buffer(lines(), 1), 'd', '2', 'j').lines).toEqual(['one', 'five'])
    })

    it('`d2k` deletes the line and the two above, stopping at the first', () => {
      expect(press(buffer(lines(), 3), 'd', '2', 'k').lines).toEqual(['one', 'five'])
      expect(press(buffer(lines(), 1), 'd', '5', 'k').lines).toEqual(['three', 'four', 'five'])
    })
  })

  describe('on charwise motions', () => {
    it('`d3w` deletes three words', () => {
      const state = press(buffer(['one two three four']), 'd', '3', 'w')
      expect(state.lines).toEqual(['four'])
    })

    it('`2d3w` deletes six', () => {
      expect(press(buffer(['a b c d e f g h']), '2', 'd', '3', 'w').lines).toEqual(['g h'])
    })

    // Only the last `w` stops at the end of its line; the ones before it go on
    // to the next line like a plain `w` does.
    it('carries `w` across lines before the last one', () => {
      const state = press(buffer(['foo bar', 'baz qux'], 0, 4), 'd', '2', 'w')
      expect(state.lines).toEqual(['foo qux'])
      expect(state.cursor).toEqual({ row: 0, col: 4 })
    })

    it('`d2e` deletes through the end of the second word', () => {
      expect(press(buffer(['foo bar baz']), 'd', '2', 'e').lines).toEqual([' baz'])
    })

    it('`d3l` and `3x` delete three characters, as far as the line goes', () => {
      expect(press(buffer(['hello'], 0, 1), 'd', '3', 'l').lines).toEqual(['ho'])
      expect(press(buffer(['hello'], 0, 1), '3', 'x').lines).toEqual(['ho'])
      expect(press(buffer(['hello'], 0, 3), '5', 'x').lines).toEqual(['hel'])
    })

    it('`d3h` deletes three characters back, as far as column 0', () => {
      const state = press(buffer(['hello'], 0, 4), 'd', '3', 'h')
      expect(state.lines).toEqual(['ho'])
      expect(state.cursor.col).toBe(1)
      expect(press(buffer(['hello'], 0, 2), 'd', '9', 'h').lines).toEqual(['llo'])
    })

    it('`d2$` deletes to the end of the next line', () => {
      const state = press(buffer(['foo bar', 'baz', 'qux'], 0, 4), 'd', '2', '$')
      expect(state.lines).toEqual(['foo ', 'qux'])
    })

    // Vim's rule for a charwise delete over several lines, again: from the
    // indent, with nothing left after it, it takes the lines whole.
    it('`d2$` from the indent deletes the lines whole', () => {
      expect(press(buffer(['foo', 'bar', 'qux']), 'd', '2', '$').lines).toEqual(['qux'])
    })

    it('`d2$` does nothing from the last line', () => {
      expect(press(buffer(['foo', 'bar'], 1), 'd', '2', '$').lines).toEqual(['foo', 'bar'])
    })
  })

  describe('on plain motions', () => {
    it('moves `3j`, `2k`, `3l` and `2h` that many times, as far as the buffer goes', () => {
      const state = buffer(lines())
      press(state, '3', 'j')
      expect(state.cursor.row).toBe(3)
      press(state, '2', 'k')
      expect(state.cursor.row).toBe(1)
      press(state, '9', 'j')
      expect(state.cursor.row).toBe(4)
      press(state, '3', 'l')
      expect(state.cursor.col).toBe(3)
      press(state, '2', 'h')
      expect(state.cursor.col).toBe(1)
    })

    it('`2$` moves to the end of the next line', () => {
      expect(press(buffer(lines()), '2', '$').cursor).toEqual({ row: 1, col: 2 })
    })
  })

  describe('typing them', () => {
    it('reads `0` as a digit once a count has started, and as the motion otherwise', () => {
      expect(press(buffer(['abcdefghijkl']), '1', '0', 'x').lines).toEqual(['kl'])
      expect(press(buffer(['hello world'], 0, 6), 'd', '0').lines).toEqual(['world'])
    })

    // Vim's 'showcmd' shows the whole command typed so far, count included.
    it('keeps what has been typed in `pending`, for the status line to show', () => {
      const state = press(buffer(lines()), '2', 'd', '3')
      expect(state.pending).toBe('2d3')
      press(state, 'j')
      expect(state.pending).toBe('')
    })

    it('is dropped by Escape, so the next command runs once', () => {
      expect(press(buffer(['hello']), '3', 'Escape', 'x').lines).toEqual(['ello'])
    })
  })
})

describe('u', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 14, 30, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('takes back the last change', () => {
    const state = press(buffer(['one', 'two', 'three']), 'd', 'd', 'u')
    expect(state.lines).toEqual(['one', 'two', 'three'])
  })

  it('takes changes back one at a time, newest first', () => {
    const state = press(buffer(['hello']), 'x', 'x', 'u')
    expect(state.lines).toEqual(['ello'])
    press(state, 'u')
    expect(state.lines).toEqual(['hello'])
  })

  it('takes back a whole insert session as one change', () => {
    const state = press(buffer(['hello']), 'i', 'a', 'b', 'c', 'Escape', 'u')
    expect(state.lines).toEqual(['hello'])
  })

  // `o` opens the line and the text typed into it is the rest of the same change.
  it('takes back `o` and what was typed after it together, back where `o` was typed', () => {
    const state = press(buffer(['one', 'two'], 0, 1), 'o', 'x', 'y', 'Escape')
    expect(state.lines).toEqual(['one', 'xy', 'two'])
    press(state, 'u')
    expect(state.lines).toEqual(['one', 'two'])
    expect(state.cursor).toEqual({ row: 0, col: 1 })
  })

  // Vim starts a new change when the arrows move the cursor in insert mode.
  it('splits an insert session where the arrows moved the cursor', () => {
    const state = press(buffer(['hello']), 'i', 'a', 'ArrowRight', 'b', 'Escape', 'u')
    expect(state.lines).toEqual(['ahello'])
  })

  it('records nothing for a command that changed nothing', () => {
    const state = press(buffer(['hello']), 'x', 'j', 'l', 'd', 'k', 'i', 'Escape', 'u')
    expect(state.lines).toEqual(['hello'])
  })

  it('takes back as many changes as its count', () => {
    expect(press(buffer(['hello']), 'x', 'x', 'x', 'x', '3', 'u').lines).toEqual(['ello'])
  })

  it('cancels a `d` waiting for its motion instead of undoing', () => {
    expect(press(buffer(['hello']), 'x', 'd', 'u').lines).toEqual(['ello'])
  })

  describe('the cursor', () => {
    it('goes back to its column when the change was on its line', () => {
      const state = press(buffer(['hello'], 0, 3), 'x', '0', 'u')
      expect(state.cursor).toEqual({ row: 0, col: 3 })
    })

    it('goes to the first non-blank of the first changed line when that is another', () => {
      const state = press(buffer(['one', '  two', 'three'], 2), 'd', 'k', 'u')
      expect(state.lines).toEqual(['one', '  two', 'three'])
      expect(state.cursor).toEqual({ row: 1, col: 2 })
    })
  })

  // Back at the file as it was opened, the buffer is unmodified again — so a
  // plain `:q` lets go without E37, as it does in vim.
  it('leaves the buffer unmodified once every change is taken back', () => {
    const state = press(buffer(['hello']), 'x', 'x', 'u')
    expect(state.dirty).toBe(true)
    press(state, 'u')
    expect(state.dirty).toBe(false)
  })

  describe('says what it did, in vim’s words', () => {
    it('for lines put back, and when the change was made', () => {
      const state = press(buffer(['one', 'two', 'three']), 'd', 'd')
      vi.advanceTimersByTime(4000)
      press(state, 'u')
      expect(state.statusMessage).toBe('1 more line; before #1  4 seconds ago')
      expect(press(buffer(['a', 'b', 'c']), '2', 'd', 'd', 'u').statusMessage).toBe(
        '2 more lines; before #1  0 seconds ago',
      )
    })

    it('for lines taken away, and for lines changed in place', () => {
      expect(press(buffer(['one']), 'o', 'Escape', 'u').statusMessage).toBe(
        '1 line less; before #1  0 seconds ago',
      )
      vi.advanceTimersByTime(1000)
      expect(press(buffer(['one']), 'x', 'u').statusMessage).toBe('1 change; before #1  0 seconds ago')
    })

    it('with "second" for one second', () => {
      const state = press(buffer(['one']), 'x')
      vi.advanceTimersByTime(1000)
      expect(press(state, 'u').statusMessage).toBe('1 change; before #1  1 second ago')
    })

    it('with the time of day for a change 100 seconds old or more', () => {
      const state = press(buffer(['one']), 'x')
      vi.advanceTimersByTime(120_000)
      expect(press(state, 'u').statusMessage).toBe('1 change; before #1  14:30:00')
    })

    // Vim numbers changes from 1 and keeps counting through undos.
    it('numbering changes on through undos', () => {
      const state = press(buffer(['hello']), 'x', 'u', 'x', 'u')
      expect(state.statusMessage).toBe('1 change; before #2  0 seconds ago')
    })

    it('and that there is nothing left to undo', () => {
      const state = press(buffer(['hello']), 'u')
      expect(state.lines).toEqual(['hello'])
      expect(state.statusMessage).toBe('Already at oldest change')
    })
  })
})
