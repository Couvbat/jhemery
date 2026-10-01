import { describe, expect, it } from 'vitest'
import { docUrl, REPO, sourceRef, sourceUrl } from '../source'

describe('source links', () => {
  it('pins to the build’s commit', () => {
    expect(sourceRef('ab12cd3')).toBe('ab12cd3')
    expect(sourceUrl('frontend/src/terminal/vimEditor.ts', 'ab12cd3')).toBe(
      `${REPO}/blob/ab12cd3/frontend/src/terminal/vimEditor.ts`,
    )
  })

  // `'dev'` is a build outside a checkout, and what the unit tests define.
  it('falls back to master when there is no commit', () => {
    expect(sourceRef('dev')).toBe('master')
    expect(sourceRef()).toBe('master')
  })

  it('sends a spec to its note on the site, at the heading', () => {
    expect(docUrl({ doc: 'docs/superpowers/specs/2026-08-04-ctf-flag-chain-design.md', anchor: 'stages' })).toBe(
      '/notes/ctf-flag-chain#stages',
    )
  })

  it('points any other doc at its heading on GitHub', () => {
    expect(docUrl({ doc: 'docs/roadmap.md', anchor: 'dropped' }, 'ab12cd3')).toBe(`${REPO}/blob/ab12cd3/docs/roadmap.md#dropped`)
    expect(docUrl({ doc: 'docs/roadmap.md' }, 'ab12cd3')).toBe(`${REPO}/blob/ab12cd3/docs/roadmap.md`)
  })
})
