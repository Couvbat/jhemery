import { describe, expect, it } from 'vitest'
import * as wordle from '../games/wordle'
import { ANSWERS as EN_ANSWERS, ACCEPTED as EN_ACCEPTED } from '../games/data/words-en'
import { ANSWERS as FR_ANSWERS, ACCEPTED as FR_ACCEPTED } from '../games/data/words-fr'
import { type WordleWords, fold } from '../games/words'

/**
 * The rules are tested against a fixture, not the shipped list: a handful of
 * words makes each assertion readable, and a spec that breaks whenever
 * `npm run wordlists` reshuffles a few thousand entries is testing the wrong
 * thing. The real lists get their own shape checks at the bottom.
 */
const WORDS: WordleWords = {
  answers: ['SNAKE', 'CRANE', 'SPEED', 'RADAR', 'ÉPÉES'],
  accepted: new Set(['SNAKE', 'CRANE', 'SPEED', 'RADAR', 'EPEES', 'ERASE', 'PLUMB', 'SPACE', 'PLANS', 'ABOUT']),
}

const LISTS = {
  en: { answers: EN_ANSWERS.split(' '), accepted: new Set(EN_ACCEPTED.split(' ')) },
  fr: { answers: FR_ANSWERS.split(' '), accepted: new Set(FR_ACCEPTED.split(' ')) },
}

describe('fold', () => {
  it('strips accents and uppercases', () => {
    expect(fold('épée')).toBe('EPEE')
    expect(fold('Forêt')).toBe('FORET')
    expect(fold('naïfs')).toBe('NAIFS')
    expect(fold('ÇA')).toBe('CA')
  })

  it('leaves unaccented words alone', () => {
    expect(fold('SNAKE')).toBe('SNAKE')
  })
})

describe('score', () => {
  it('marks an exact match all hits', () => {
    expect(wordle.score('SNAKE', 'SNAKE')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit'])
  })

  it('marks a letter in the wrong place as near', () => {
    // A is in ABOUT but not in position 0.
    expect(wordle.score('AAAAA', 'ABOUT')).toEqual(['hit', 'miss', 'miss', 'miss', 'miss'])
  })

  /*
   * The two cases that separate a correct implementation from a plausible one.
   * A single pass marks every occurrence of a repeated letter, handing out more
   * near-misses than the answer actually contains.
   */
  it('does not spend a letter the answer only has once on two marks', () => {
    // SNAKE has exactly one E, and ERASE's trailing E claims it as an exact hit.
    // The leading E must therefore be a *miss*: there is no second E to be near.
    // A single-pass implementation marks it `near` and quietly lies to the player.
    expect(wordle.score('ERASE', 'SNAKE')).toEqual(['miss', 'miss', 'hit', 'near', 'hit'])
  })

  it('marks every occurrence when the answer really has that many', () => {
    // Both words have two Es, so both of ERASE's Es earn something.
    expect(wordle.score('ERASE', 'SPEED')).toEqual(['near', 'miss', 'miss', 'near', 'near'])
  })

  it('spends exact hits before near-misses', () => {
    // ARRAY vs RADAR: position 3 is a hit (A). RADAR has three As and two Rs, so
    // the leading A and both Rs can still be claimed, but the trailing Y cannot.
    expect(wordle.score('ARRAY', 'RADAR')).toEqual(['near', 'near', 'near', 'hit', 'miss'])
  })

  it('gives nothing for a letter the answer does not have at all', () => {
    expect(wordle.score('ZZZZZ', 'SNAKE')).toEqual(['miss', 'miss', 'miss', 'miss', 'miss'])
  })
})

describe('typing', () => {
  const game = () => wordle.newGame(WORDS, 'en', () => 0)

  it('accepts letters and folds them', () => {
    let state = game()
    for (const key of ['s', 'n', 'a']) state = wordle.typeLetter(state, key)
    expect(state.current).toBe('SNA')
  })

  it('ignores keys that are not single letters', () => {
    let state = game()
    for (const key of ['Shift', 'ArrowLeft', '1', ' ', 'Enter']) {
      state = wordle.typeLetter(state, key)
    }
    expect(state.current).toBe('')
  })

  it('stops at the row width', () => {
    let state = game()
    for (const key of 'ABCDEFGH') state = wordle.typeLetter(state, key)
    expect(state.current).toHaveLength(wordle.LENGTH)
  })

  it('backspaces', () => {
    let state = wordle.typeLetter(game(), 'a')
    state = wordle.backspace(state)
    expect(state.current).toBe('')
    // Backspacing an empty row is a no-op rather than an error.
    expect(wordle.backspace(state).current).toBe('')
  })
})

describe('submit', () => {
  function typed(word: string) {
    let state = wordle.newGame(WORDS, 'en', () => 0)
    for (const letter of word) state = wordle.typeLetter(state, letter)
    return state
  }

  it('refuses a short guess without consuming a row', () => {
    const result = wordle.submit(typed('CAT'))
    expect(result.refused).toBe('short')
    expect(result.state.guesses).toHaveLength(0)
    expect(result.state.current).toBe('CAT')
  })

  it('refuses a word that is not in the list, keeping the letters', () => {
    const result = wordle.submit(typed('ZZZZZ'))
    expect(result.refused).toBe('unknown')
    expect(result.state.guesses).toHaveLength(0)
    expect(result.state.current).toBe('ZZZZZ')
  })

  it('accepts a real word and clears the row', () => {
    const result = wordle.submit(typed('CRANE'))
    expect(result.refused).toBeNull()
    expect(result.state.guesses).toEqual(['CRANE'])
    expect(result.state.current).toBe('')
  })

  it('wins when the guess matches', () => {
    // `() => 0` picks the first answer in the fixture.
    const result = wordle.submit(typed(WORDS.answers[0]!))
    expect(result.state.status).toBe('won')
  })

  it('loses after six wrong guesses', () => {
    let state = wordle.newGame(WORDS, 'en', () => 0)
    const wrong = WORDS.answers.find((word) => word !== state.answer)!

    for (let i = 0; i < wordle.ROWS; i++) {
      for (const letter of wrong) state = wordle.typeLetter(state, letter)
      state = wordle.submit(state).state
    }

    expect(state.guesses).toHaveLength(wordle.ROWS)
    expect(state.status).toBe('lost')
  })

  it('accepts an accented French answer typed without accents', () => {
    // The whole point of folding: ÉPÉES has to be reachable from a keyboard
    // nobody wants to hunt for accent keys on.
    const state = { ...wordle.newGame(WORDS, 'fr', () => 0), answer: 'EPEES', display: 'ÉPÉES' }
    let typing = state
    for (const letter of 'EPEES') typing = wordle.typeLetter(typing, letter)

    const result = wordle.submit(typing)
    expect(result.refused).toBeNull()
    expect(result.state.status).toBe('won')
  })
})

describe('letterMarks', () => {
  it('keeps the best mark a letter has earned, not the latest', () => {
    // Learning that a letter is a hit and then playing it in the wrong place
    // must not downgrade the keyboard back to `near`.
    const state: wordle.WordleState = {
      ...wordle.newGame(WORDS, 'en', () => 0),
      answer: 'SNAKE',
      display: 'SNAKE',
      guesses: ['SPACE', 'PLANS'],
    }

    // S is a hit in SPACE (position 0) and a near in PLANS (position 4).
    expect(wordle.letterMarks(state).get('S')).toBe('hit')
  })

  it('marks letters the answer does not contain as misses', () => {
    const state: wordle.WordleState = {
      ...wordle.newGame(WORDS, 'en', () => 0),
      answer: 'SNAKE',
      display: 'SNAKE',
      guesses: ['PLUMB'],
    }
    expect(wordle.letterMarks(state).get('P')).toBe('miss')
  })
})

/*
 * Shape checks on the *generated* lists. These guard the output of
 * `scripts/build-wordlists.mjs`, so a bad regeneration fails here rather than in
 * someone's game.
 */
describe('generated word lists', () => {
  for (const locale of ['en', 'fr'] as const) {
    describe(`the ${locale} list`, () => {
      const { answers, accepted } = LISTS[locale]

      it('holds only five-letter answers', () => {
        expect(answers.filter((word) => fold(word).length !== wordle.LENGTH)).toEqual([])
      })

      it('holds only five-letter accepted guesses', () => {
        expect([...accepted].filter((word) => word.length !== wordle.LENGTH)).toEqual([])
      })

      it('has no duplicate answers', () => {
        const folded = answers.map(fold)
        expect(new Set(folded).size).toBe(folded.length)
      })

      it('accepts every answer as a guess', () => {
        // Otherwise a player can lose to a word the game would have refused them.
        expect(answers.filter((word) => !accepted.has(fold(word)))).toEqual([])
      })

      it('stores the accepted set folded, so guesses never need accents', () => {
        for (const word of accepted) expect(word).toBe(fold(word))
      })

      it('is long enough that the same word does not come up constantly', () => {
        expect(answers.length).toBeGreaterThan(500)
        expect(accepted.size).toBeGreaterThan(answers.length)
      })

      it('holds no proper nouns or punctuation', () => {
        for (const word of answers) expect(fold(word)).toMatch(/^[A-Z]{5}$/)
      })
    })
  }

  it('keeps the French answers accented and the guesses folded', () => {
    // The whole point of the split: correct on display, forgiving on input.
    expect(LISTS.fr.answers.some((word) => /[À-ÿ]/.test(word))).toBe(true)
    expect([...LISTS.fr.accepted].some((word) => /[À-ÿ]/.test(word))).toBe(false)
  })
})
