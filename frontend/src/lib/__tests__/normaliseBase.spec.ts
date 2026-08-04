import { describe, expect, it } from 'vitest'
import { normaliseBase } from '@/lib/api'

/**
 * `VITE_API_URL` is typed by hand into a GitHub repository variable, and every
 * call site writes `${apiUrl}/path`. A trailing slash there is the easiest
 * mistake in the whole deployment — it is what a browser shows in the address
 * bar when you visit the API to check it is up — and the resulting `//path` is
 * answered by a proxy with a normalisation redirect that carries no CORS
 * headers. The browser reports that as a missing `Access-Control-Allow-Origin`,
 * which sends you to look at CORS config that was correct all along.
 */
describe('normaliseBase', () => {
  it('leaves a well-formed base alone', () => {
    expect(normaliseBase('https://api.jhemery.xyz')).toBe('https://api.jhemery.xyz')
  })

  it('strips the trailing slash that would make every path a double slash', () => {
    expect(normaliseBase('https://api.jhemery.xyz/')).toBe('https://api.jhemery.xyz')
  })

  it('strips however many were typed', () => {
    expect(normaliseBase('https://api.jhemery.xyz///')).toBe('https://api.jhemery.xyz')
  })

  it('keeps a path prefix, minus its trailing slash', () => {
    expect(normaliseBase('https://jhemery.xyz/api/')).toBe('https://jhemery.xyz/api')
  })

  it('leaves the empty same-origin fallback empty', () => {
    // Not "/" — that would reintroduce the double slash it exists to avoid.
    expect(normaliseBase('')).toBe('')
  })

  it('reduces a lone slash to the same-origin fallback', () => {
    expect(normaliseBase('/')).toBe('')
  })
})
