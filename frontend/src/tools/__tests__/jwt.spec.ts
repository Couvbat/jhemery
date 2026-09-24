import { describe, expect, it } from 'vitest'
import { cleanToken, decodeJwt, timeClaims, validity } from '../jwt/jwt'

const b64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// The jwt.io example token (HS256, `your-256-bit-secret`): a real token from the wild.
const EXAMPLE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('decodeJwt', () => {
  it('decodes the header and payload of a real token', () => {
    const decoded = decodeJwt(EXAMPLE)
    expect(decoded).toMatchObject({
      ok: true,
      header: { alg: 'HS256', typ: 'JWT' },
      payload: { sub: '1234567890', name: 'John Doe', iat: 1516239022 },
    })
  })

  it('forgives whitespace and an Authorization header around the token', () => {
    expect(cleanToken(`Authorization: Bearer  ${EXAMPLE.slice(0, 20)}\n${EXAMPLE.slice(20)}  `)).toBe(EXAMPLE)
    expect(decodeJwt(`Bearer ${EXAMPLE}`).ok).toBe(true)
  })

  it('reads UTF-8 claims', () => {
    const token = `${b64url({ alg: 'none' })}.${btoa(String.fromCharCode(...new TextEncoder().encode('{"name":"Hémery"}'))).replace(/=+$/, '')}.`
    expect(decodeJwt(token)).toMatchObject({ ok: true, payload: { name: 'Hémery' } })
  })

  it('says which part is wrong', () => {
    expect(decodeJwt('abc')).toEqual({ ok: false, error: 'segments' })
    expect(decodeJwt('!!!.e30.x')).toEqual({ ok: false, error: 'base64', segment: 'header' })
    expect(decodeJwt(`${b64url({ alg: 'HS256' })}.${btoa('[1,2]')}.x`)).toEqual({ ok: false, error: 'json', segment: 'payload' })
  })
})

describe('time claims', () => {
  const now = new Date('2026-09-24T12:00:00Z')
  const at = (iso: string) => Date.parse(iso) / 1000

  it('turns iat, nbf and exp into dates, and ignores what is not a number', () => {
    const times = timeClaims({ iat: at('2026-09-24T11:00:00Z'), exp: at('2026-09-24T13:00:00Z'), nbf: 'soon' })
    expect(times.map((t) => t.claim)).toEqual(['iat', 'exp'])
    expect(times[1]!.date.toISOString()).toBe('2026-09-24T13:00:00.000Z')
  })

  it('knows expired from not-yet from valid from open-ended', () => {
    expect(validity({ exp: at('2026-09-24T11:59:59Z') }, now)).toBe('expired')
    expect(validity({ exp: at('2026-09-24T12:00:00Z') }, now)).toBe('expired')
    expect(validity({ nbf: at('2026-09-24T13:00:00Z'), exp: at('2026-09-25T00:00:00Z') }, now)).toBe('not-yet')
    expect(validity({ exp: at('2026-09-24T12:00:01Z') }, now)).toBe('valid')
    expect(validity({ iat: at('2026-01-01T00:00:00Z') }, now)).toBe('no-expiry')
  })
})
