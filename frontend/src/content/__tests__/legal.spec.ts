import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FFMPEG_CORE_VERSION, cdn, credits, host, legalCopy, legalHeadings } from '../legal'

/**
 * `/legal`'s copy, held as `privacy.spec.ts` holds `/privacy`'s: both languages, and out of
 * the barrel. Plus the one fact here that can drift on its own: the GPL credit names the
 * exact `@ffmpeg/core` the ffmpeg tool serves, so a dependency bump that forgets it fails.
 */
describe('legalCopy', () => {
  it.each(Object.entries({ ...legalCopy, ...legalHeadings }))('%s is written in both languages', (_, text) => {
    expect(text.en.trim()).not.toBe('')
    expect(text.fr.trim()).not.toBe('')
    expect(text.fr).not.toBe(text.en)
  })

  it('stays out of the content barrel, which loads with every first paint', () => {
    const barrel = readFileSync(resolve(process.cwd(), 'src/content/index.ts'), 'utf8')
    expect(barrel).not.toMatch(/['"]\.\/legal['"]/)
  })
})

describe('the hosts and credits', () => {
  it('gives the host everything the LCEN asks for: name, address and phone', () => {
    expect(host.name).not.toBe('')
    expect(host.address).toMatch(/France$/)
    expect(host.phone).toMatch(/^\+33 /)
    expect(cdn.address).not.toBe('')
  })

  it('links every credit, and every licence, over https', () => {
    for (const credit of credits) {
      expect(credit.href, credit.who).toMatch(/^https:\/\//)
      if (credit.licence) expect(credit.licence.href, credit.who).toMatch(/^https:\/\//)
      expect(credit.what.fr, credit.who).not.toBe('')
    }
  })

  it('names the @ffmpeg/core version that is installed, and a pinned source tag', () => {
    const installed = JSON.parse(readFileSync(resolve(process.cwd(), 'node_modules/@ffmpeg/core/package.json'), 'utf8'))
    expect(FFMPEG_CORE_VERSION).toBe(installed.version)
    // Not `v${version}`: upstream's tags don't follow the core's version (see legal.ts).
    const ffmpeg = credits.find((credit) => credit.who.startsWith('ffmpeg.wasm'))!
    expect(ffmpeg.href).toMatch(/\/tree\/v[\d.]+\/packages\/core$/)
    expect(ffmpeg.href).not.toContain(`/tree/v${FFMPEG_CORE_VERSION}/`)
  })
})
