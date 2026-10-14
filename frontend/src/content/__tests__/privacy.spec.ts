import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { privacyCopy, privacyLabels } from '../privacy'

/**
 * `/privacy`'s paragraphs and labels live outside `i18n/messages.ts`, so the message tree's
 * own both-languages check never sees them, and outside the barrel, which is what keeps them off
 * the home page's first paint. Both are held here.
 */
describe('privacyCopy', () => {
  it.each(Object.entries(privacyCopy))('%s is written in both languages', (_, text) => {
    expect(text.en.trim()).not.toBe('')
    expect(text.fr.trim()).not.toBe('')
    expect(text.fr).not.toBe(text.en)
  })

  // Labels can be the same word in both (`Caches`), as in the message tree they came from.
  it.each(Object.entries(privacyLabels))('label %s has both languages', (_, text) => {
    expect(text.en.trim()).not.toBe('')
    expect(text.fr.trim()).not.toBe('')
  })

  it('stays out of the content barrel, which loads with every first paint', () => {
    const barrel = readFileSync(resolve(process.cwd(), 'src/content/index.ts'), 'utf8')
    expect(barrel).not.toMatch(/['"]\.\/privacy['"]/)
  })
})
