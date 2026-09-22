import { describe, expect, it } from 'vitest'
import { CASE_MODES, textStats, transformCase, wordFrequency, words } from '../text/text'

describe('text tool', () => {
  const sample = "Salut, moi c'est Jules. Développeur full-stack !\n\nDeuxième paragraphe… fin ?"

  it('finds words across accents, apostrophes and hyphens', () => {
    expect(words(sample)).toEqual([
      'Salut',
      'moi',
      "c'est",
      'Jules',
      'Développeur',
      'full-stack',
      'Deuxième',
      'paragraphe',
      'fin',
    ])
  })

  it('counts the lot', () => {
    const stats = textStats(sample)
    expect(stats.words).toBe(9)
    expect(stats.lines).toBe(3)
    expect(stats.paragraphs).toBe(2)
    expect(stats.sentences).toBe(4)
    expect(stats.characters).toBe([...sample].length)
    expect(stats.bytes).toBeGreaterThan(stats.characters)
    expect(stats.readingSeconds).toBe(3)
    expect(textStats('')).toMatchObject({ words: 0, lines: 0, paragraphs: 0, sentences: 0, bytes: 0 })
  })

  it('re-cases prose', () => {
    expect(transformCase('hello WORLD', 'upper')).toBe('HELLO WORLD')
    expect(transformCase('hello WORLD', 'lower')).toBe('hello world')
    expect(transformCase("l'été des quatre-vents", 'title')).toBe("L'été Des Quatre-Vents")
    expect(transformCase("c'est don't", 'title')).toBe("C'est Don't")
    expect(transformCase('one. two! three? four', 'sentence')).toBe('One. Two! Three? Four')
  })

  it('re-cases identifiers, from any of the shapes into any other', () => {
    const forms = ['hello big world', 'helloBigWorld', 'HelloBigWorld', 'hello_big_world', 'hello-big-world', 'HELLO_BIG_WORLD']
    for (const input of forms) {
      expect(transformCase(input, 'camel'), input).toBe('helloBigWorld')
      expect(transformCase(input, 'pascal'), input).toBe('HelloBigWorld')
      expect(transformCase(input, 'snake'), input).toBe('hello_big_world')
      expect(transformCase(input, 'kebab'), input).toBe('hello-big-world')
      expect(transformCase(input, 'constant'), input).toBe('HELLO_BIG_WORLD')
    }
  })

  it('slugs with accents folded', () => {
    expect(transformCase("Élève à l'école — été 2026 !", 'slug')).toBe('eleve-a-l-ecole-ete-2026')
  })

  it('handles every mode without throwing on empty input', () => {
    for (const mode of CASE_MODES) expect(transformCase('', mode)).toBe('')
  })

  it('ranks word frequency case-insensitively, ties by first appearance', () => {
    expect(wordFrequency('The cat and the dog and THE bird', 2)).toEqual([
      { word: 'the', count: 3 },
      { word: 'and', count: 2 },
    ])
    expect(wordFrequency('')).toEqual([])
  })
})
