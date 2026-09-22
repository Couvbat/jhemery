import { describe, expect, it } from 'vitest'
import {
  decode,
  decodeBase64,
  decodeHex,
  encode,
  encodeBase64,
  encodeHex,
  encodeUrl,
} from '../encode/encode'

describe('encode tool', () => {
  it('round-trips UTF-8 through base64', () => {
    expect(encodeBase64('hello')).toBe('aGVsbG8=')
    expect(encodeBase64('héllo wörld ✓')).toBe('aMOpbGxvIHfDtnJsZCDinJM=')
    expect(decodeBase64('aMOpbGxvIHfDtnJsZCDinJM=')).toBe('héllo wörld ✓')
  })

  it('accepts the url-safe alphabet, missing padding and whitespace', () => {
    expect(decodeBase64('aGVsbG8')).toBe('hello')
    expect(decodeBase64('aGVs\nbG8=')).toBe('hello')
    // `+/` → `-_`
    expect(decodeBase64(encodeBase64('ûÿ').replace(/\+/g, '-').replace(/\//g, '_'))).toBe(
      'ûÿ',
    )
  })

  it('rejects what is not base64, or not UTF-8 once decoded', () => {
    expect(() => decodeBase64('not base64!')).toThrow()
    // 0xff alone is never valid UTF-8.
    expect(() => decodeBase64('/w==')).toThrow()
  })

  it('percent-encodes everything a URL component needs', () => {
    expect(encodeUrl('a b&c=d/é')).toBe('a%20b%26c%3Dd%2F%C3%A9')
    expect(decode('url', 'a%20b%26c%3Dd%2F%C3%A9')).toBe('a b&c=d/é')
    expect(() => decode('url', '%E0%A4%A')).toThrow()
  })

  it('round-trips hex and forgives its common dressings', () => {
    expect(encodeHex('hi✓')).toBe('6869e29c93')
    expect(decodeHex('6869e29c93')).toBe('hi✓')
    expect(decodeHex('0x68 69:E2 9C 93')).toBe('hi✓')
    expect(() => decodeHex('abc')).toThrow()
    expect(() => decodeHex('zz')).toThrow()
  })

  it('dispatches by scheme', () => {
    for (const scheme of ['base64', 'url', 'hex'] as const) {
      expect(decode(scheme, encode(scheme, 'round trip ✓'))).toBe('round trip ✓')
    }
  })
})
