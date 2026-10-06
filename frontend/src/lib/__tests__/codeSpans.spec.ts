import { describe, expect, it } from 'vitest'
import { codeSpans } from '../codeSpans'

describe('codeSpans', () => {
  it('splits paired backticks into code runs', () => {
    expect(codeSpans('run `vim`, then `:q`.')).toEqual([
      { text: 'run ', code: false },
      { text: 'vim', code: true },
      { text: ', then ', code: false },
      { text: ':q', code: true },
      { text: '.', code: false },
    ])
  })

  it('leaves text with no backticks, or a stray one, whole', () => {
    expect(codeSpans('plain')).toEqual([{ text: 'plain', code: false }])
    expect(codeSpans('a ` stray')).toEqual([{ text: 'a ` stray', code: false }])
  })

  it('keeps markup as text: the page renders it through interpolation', () => {
    expect(codeSpans('`<b>`')).toEqual([{ text: '<b>', code: true }])
  })
})
