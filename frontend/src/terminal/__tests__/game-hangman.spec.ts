import { describe, expect, it } from 'vitest'
import * as hangman from '../games/hangman'
import { answersFor } from '../games/words'

/** Forces a known answer, so the assertions do not depend on which word came up. */
function withAnswer(display: string): hangman.HangmanState {
  return { ...hangman.newGame('en', () => 0), answer: display, display, guessed: [], status: 'playing' }
}

function guessAll(state: hangman.HangmanState, letters: string): hangman.HangmanState {
  for (const letter of letters) state = hangman.guess(state, letter)
  return state
}

describe('newGame', () => {
  it('picks a word from the locale’s list', () => {
    const state = hangman.newGame('fr', () => 0)
    expect(answersFor('fr')).toContain(state.display)
  })

  it('starts with a full set of lives and nothing guessed', () => {
    const state = hangman.newGame('en', () => 0)
    expect(state.guessed).toEqual([])
    expect(hangman.livesLeft(state)).toBe(hangman.LIVES)
    expect(state.status).toBe('playing')
  })
})

describe('guess', () => {
  it('accepts a letter in the word without costing a life', () => {
    const state = hangman.guess(withAnswer('SNAKE'), 's')
    expect(state.guessed).toEqual(['S'])
    expect(hangman.livesLeft(state)).toBe(hangman.LIVES)
  })

  it('costs a life for a letter that is not there', () => {
    const state = hangman.guess(withAnswer('SNAKE'), 'z')
    expect(hangman.livesLeft(state)).toBe(hangman.LIVES - 1)
    expect(hangman.wrongGuesses(state)).toEqual(['Z'])
  })

  /*
   * Repeating a letter is a mis-key, not a mistake — and the guessed row is right
   * there on screen saying which ones are spent. Charging a life for it would
   * make the visible information a trap.
   */
  it('ignores a letter already tried, right or wrong', () => {
    const right = guessAll(withAnswer('SNAKE'), 'ss')
    expect(right.guessed).toEqual(['S'])
    expect(hangman.livesLeft(right)).toBe(hangman.LIVES)

    const wrong = guessAll(withAnswer('SNAKE'), 'zz')
    expect(wrong.guessed).toEqual(['Z'])
    expect(hangman.livesLeft(wrong)).toBe(hangman.LIVES - 1)
  })

  it('ignores anything that is not a single letter', () => {
    const state = withAnswer('SNAKE')
    for (const key of ['Enter', 'ArrowUp', ' ', '4', 'Shift']) {
      expect(hangman.guess(state, key)).toBe(state)
    }
  })

  it('folds accents, so a French word is playable on any keyboard', () => {
    const state = hangman.guess({ ...withAnswer('EPEES'), display: 'ÉPÉES' }, 'e')
    expect(state.guessed).toEqual(['E'])
    expect(hangman.wrongGuesses(state)).toEqual([])
  })

  it('does nothing once the round is over', () => {
    const won = guessAll(withAnswer('SNAKE'), 'snake')
    expect(won.status).toBe('won')
    expect(hangman.guess(won, 'z')).toBe(won)
  })
})

describe('ending', () => {
  it('wins when every letter of the answer has been found', () => {
    // Guessing the four distinct letters of SPEED is enough — the second E is
    // covered by the first.
    const state = guessAll(withAnswer('SPEED'), 'sped')
    expect(state.status).toBe('won')
    expect(hangman.isSolved(state)).toBe(true)
  })

  it('loses on the sixth wrong guess, not the fifth', () => {
    const five = guessAll(withAnswer('SNAKE'), 'zqwxy')
    expect(hangman.livesLeft(five)).toBe(1)
    expect(five.status).toBe('playing')

    const six = hangman.guess(five, 'v')
    expect(hangman.livesLeft(six)).toBe(0)
    expect(six.status).toBe('lost')
  })
})

describe('reveal', () => {
  it('blanks what has not been guessed', () => {
    const state = hangman.guess(withAnswer('SNAKE'), 's')
    expect(hangman.reveal(state).join('')).toBe('S____')
  })

  it('shows the whole word once the round is lost', () => {
    const state = guessAll(withAnswer('SNAKE'), 'zqwxyv')
    expect(state.status).toBe('lost')
    expect(hangman.reveal(state).join('')).toBe('SNAKE')
  })

  it('reveals the accented spelling, not the folded one', () => {
    // Folding is for comparison only: a French player should get their accents
    // back on the reveal.
    const state = guessAll({ ...withAnswer('EPEES'), display: 'ÉPÉES' }, 'eps')
    expect(hangman.reveal(state).join('')).toBe('ÉPÉES')
  })
})
