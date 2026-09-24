/**
 * Decodes a JSON Web Token's header and payload. **Decode only**: verifying one means
 * pasting its secret or private key into a web page, which is exactly the habit a
 * tool like this should not teach. The panel says so, and nothing here asks for a key.
 */

import { decodeBase64 } from '../encode/encode'

export type JwtError = 'segments' | 'base64' | 'json'

export type DecodedJwt =
  | {
      ok: true
      header: Record<string, unknown>
      payload: Record<string, unknown>
      /** The three segments as pasted, for colouring the token itself. */
      segments: [string, string, string]
    }
  | { ok: false; error: JwtError; segment?: 'header' | 'payload' }

/** Forgives what people paste around a token: whitespace, an `Authorization:` prefix. */
export function cleanToken(input: string): string {
  return input
    .trim()
    .replace(/^authorization:\s*/i, '')
    .replace(/^bearer\s+/i, '')
    .replace(/\s+/g, '')
}

function decodeSegment(segment: string): Record<string, unknown> | JwtError {
  let text: string
  try {
    text = decodeBase64(segment)
  } catch {
    return 'base64'
  }
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : 'json'
  } catch {
    return 'json'
  }
}

export function decodeJwt(input: string): DecodedJwt {
  const parts = cleanToken(input).split('.')
  // A JWS has three parts; the signature may be empty (`alg: none`), the others not.
  if (parts.length !== 3 || !parts[0] || !parts[1]) return { ok: false, error: 'segments' }

  const header = decodeSegment(parts[0])
  if (typeof header === 'string') return { ok: false, error: header, segment: 'header' }
  const payload = decodeSegment(parts[1])
  if (typeof payload === 'string') return { ok: false, error: payload, segment: 'payload' }

  return { ok: true, header, payload, segments: [parts[0], parts[1], parts[2] ?? ''] }
}

/** The three registered claims that are times, in the order a reader wants them. */
export const TIME_CLAIMS = ['iat', 'nbf', 'exp'] as const
export type TimeClaim = (typeof TIME_CLAIMS)[number]

export interface ClaimTime {
  claim: TimeClaim
  date: Date
}

/** `iat`, `nbf` and `exp`, as dates, when they are the NumericDate (seconds) RFC 7519 says. */
export function timeClaims(payload: Record<string, unknown>): ClaimTime[] {
  return TIME_CLAIMS.flatMap((claim) => {
    const value = payload[claim]
    return typeof value === 'number' && Number.isFinite(value) ? [{ claim, date: new Date(value * 1000) }] : []
  })
}

export type Validity = 'expired' | 'not-yet' | 'valid' | 'no-expiry'

/** Whether the token is inside its window *now* — which says nothing about whether it is genuine. */
export function validity(payload: Record<string, unknown>, now: Date): Validity {
  const times = timeClaims(payload)
  const exp = times.find((t) => t.claim === 'exp')
  const nbf = times.find((t) => t.claim === 'nbf')
  if (exp && exp.date.getTime() <= now.getTime()) return 'expired'
  if (nbf && nbf.date.getTime() > now.getTime()) return 'not-yet'
  return exp ? 'valid' : 'no-expiry'
}
