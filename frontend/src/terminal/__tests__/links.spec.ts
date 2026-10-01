import { describe, expect, it } from 'vitest'
import { linkTarget } from '../links'

describe('linkTarget', () => {
  it('sends other sites to a new tab', () => {
    expect(linkTarget('https://github.com/Couvbat')).toEqual({ kind: 'external', href: 'https://github.com/Couvbat' })
    expect(linkTarget('mailto:contact@jhemery.xyz').kind).toBe('external')
  })

  it('runs a ?run= link in the shell, decoded', () => {
    expect(linkTarget('/?run=why%20mcp-sdk')).toEqual({ kind: 'run', line: 'why mcp-sdk' })
    expect(linkTarget('?run=wordle+daily')).toEqual({ kind: 'run', line: 'wordle daily' })
  })

  it('routes a page of the app, keeping its hash', () => {
    expect(linkTarget('/now')).toEqual({ kind: 'route', path: '/now' })
    expect(linkTarget('/tools/qr')).toEqual({ kind: 'route', path: '/tools/qr' })
    expect(linkTarget('/#projects')).toEqual({ kind: 'route', path: '/#projects' })
  })

  // The router can't serve these: they are real files, kept off the SPA fallback.
  it('navigates to a static document', () => {
    expect(linkTarget('/resume.fr.html')).toEqual({ kind: 'document', href: '/resume.fr.html' })
    expect(linkTarget('/notes/ctf-flag-chain#stages')).toEqual({ kind: 'document', href: '/notes/ctf-flag-chain#stages' })
    expect(linkTarget('/notes/').kind).toBe('document')
  })
})
