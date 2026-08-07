import { describe, expect, it } from 'vitest'
import * as typing from '../games/typing'

const PROMPTS = ['hello world']

/** Types a string starting at `t = 0`, one character per `step` milliseconds. */
function run(target: string, input: string, step = 100): typing.TypingState {
  let state: typing.TypingState = { ...typing.newGame(PROMPTS, () => 0), target }
  input.split('').forEach((char, i) => {
    state = typing.type(state, char, (i + 1) * step)
  })
  return state
}

describe('newGame', () => {
  it('picks a prompt and starts idle', () => {
    const state = typing.newGame(PROMPTS, () => 0)
    expect(state.target).toBe('hello world')
    expect(state.typed).toBe('')
    expect(state.startedAt).toBeNull()
    expect(state.mistakes.size).toBe(0)
  })
})

describe('type', () => {
  it('starts the clock on the first keystroke, not before', () => {
    const state = typing.newGame(PROMPTS, () => 0)
    expect(state.startedAt).toBeNull()

    const typed = typing.type(state, 'h', 5000)
    expect(typed.startedAt).toBe(5000)
  })

  it('keeps the original start time on later keystrokes', () => {
    const state = run('hello', 'hel')
    expect(state.startedAt).toBe(100)
  })

  it('ignores keys that are not a single character', () => {
    let state = typing.newGame(PROMPTS, () => 0)
    for (const key of ['Enter', 'ArrowLeft', 'Shift', 'Backspace']) {
      state = typing.type(state, key, 100)
    }
    expect(state.typed).toBe('')
    expect(state.startedAt).toBeNull()
  })

  it('records a wrong character but still advances', () => {
    const state = run('hello', 'hxl')
    expect(state.typed).toBe('hxl')
    expect([...state.mistakes]).toEqual([1])
  })

  it('stops at the end of the target', () => {
    const state = run('hi', 'hiya')
    expect(state.typed).toBe('hi')
    expect(typing.isDone(state)).toBe(true)
  })

  it('stamps the finish time on the last character', () => {
    const state = run('hi', 'hi')
    expect(state.endedAt).toBe(200)
  })
})

describe('backspace', () => {
  it('un-types a character', () => {
    const state = typing.backspace(run('hello', 'he'))
    expect(state.typed).toBe('h')
  })

  /*
   * The rule that makes accuracy mean anything: a test you can backspace your way
   * to 100% on measures nothing. The text is fixed, the record is not.
   */
  it('does not clear a mistake it already recorded', () => {
    let state = run('hello', 'hx')
    expect([...state.mistakes]).toEqual([1])

    state = typing.backspace(state)
    state = typing.type(state, 'e', 300)

    expect(state.typed).toBe('he')
    expect([...state.mistakes]).toEqual([1])
    expect(typing.accuracy(state)).toBe(50)
  })

  it('is a no-op on an empty or finished run', () => {
    const empty = typing.newGame(PROMPTS, () => 0)
    expect(typing.backspace(empty)).toBe(empty)

    const done = run('hi', 'hi')
    expect(typing.backspace(done)).toBe(done)
  })
})

describe('wpm', () => {
  it('is zero before anything is typed', () => {
    expect(typing.wpm(typing.newGame(PROMPTS, () => 0), 1000)).toBe(0)
  })

  it('counts a word as five characters', () => {
    // 10 characters typed over 60 s from the first keystroke → 2 "words" a minute.
    let state: typing.TypingState = { ...typing.newGame(PROMPTS, () => 0), target: 'a'.repeat(10) }
    'a'.repeat(10)
      .split('')
      .forEach((char, i) => {
        state = typing.type(state, char, i === 0 ? 0 : 60000)
      })

    expect(typing.wpm(state, 60000)).toBe(2)
  })

  it('freezes once the run is finished', () => {
    const state = run('hi', 'hi')
    // Long after the finish, the score is still the one that was earned.
    expect(typing.wpm(state, 999999)).toBe(typing.wpm(state, 200))
  })
})

describe('accuracy', () => {
  it('is 100 before anything is typed', () => {
    expect(typing.accuracy(typing.newGame(PROMPTS, () => 0))).toBe(100)
  })

  it('is 100 for a clean run', () => {
    expect(typing.accuracy(run('hello', 'hello'))).toBe(100)
  })

  it('drops by one position per mistake', () => {
    expect(typing.accuracy(run('hello', 'hxllo'))).toBe(80)
    expect(typing.accuracy(run('hello', 'hxxlo'))).toBe(60)
  })
})
