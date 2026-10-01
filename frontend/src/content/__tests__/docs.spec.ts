import { describe, expect, it } from 'vitest'
import { githubSlug, headingSlugs, noteSlug } from '../docs'

// The anchors GitHub gives these exact headings from the repo's specs, so a link built
// with githubSlug lands where GitHub (and the notes pages) put the id.
describe('githubSlug', () => {
  it.each([
    ['Rejected', 'rejected'],
    ['Addendum — real word lists', 'addendum--real-word-lists'],
    ['`tetris` — reversing a decision', 'tetris--reversing-a-decision'],
    ['1. `views.ts` — a second content list, one level above sections', '1-viewsts--a-second-content-list-one-level-above-sections'],
    ['The primitive: `ctx.capture()`', 'the-primitive-ctxcapture'],
    ['Grounding — no RAG', 'grounding--no-rag'],
    ['Fond animé Three.js — formes wireframe', 'fond-animé-threejs--formes-wireframe'],
    ['A [linked](https://example.com) and **bold** heading', 'a-linked-and-bold-heading'],
    ['snake_case stays', 'snake_case-stays'],
  ])('%s → %s', (heading, slug) => {
    expect(githubSlug(heading)).toBe(slug)
  })
})

describe('headingSlugs', () => {
  it('numbers a repeated heading the way GitHub does', () => {
    expect(headingSlugs('# Testing\n## Testing\n### Testing')).toEqual(['testing', 'testing-1', 'testing-2'])
  })

  it('ignores a heading inside a code fence', () => {
    expect(headingSlugs('# Real\n```\n# not a heading\n```\n## Also real')).toEqual(['real', 'also-real'])
  })
})

describe('noteSlug', () => {
  it('drops the date and a trailing -design', () => {
    expect(noteSlug('2026-08-04-ctf-flag-chain-design.md')).toBe('ctf-flag-chain')
    expect(noteSlug('docs/superpowers/specs/2026-07-29-vim-pane-editing-design.md')).toBe('vim-pane-editing')
    expect(noteSlug('2026-07-27-github-activity-integration.md')).toBe('github-activity-integration')
  })
})
