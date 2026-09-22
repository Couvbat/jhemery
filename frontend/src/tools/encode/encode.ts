/**
 * Text ⇄ base64 / percent-encoding / hex, UTF-8 throughout. Every decoder throws on
 * malformed input rather than returning something plausible — the tool shows the
 * error, which is more useful than a silently wrong answer.
 */

export type Scheme = 'base64' | 'url' | 'hex'
export const SCHEMES: Scheme[] = ['base64', 'url', 'hex']

const encoder = new TextEncoder()
/** `fatal` so a byte sequence that is not UTF-8 is an error, not a row of U+FFFD. */
const decoder = new TextDecoder('utf-8', { fatal: true })

function bytesToBinary(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return binary
}

export function encodeBase64(text: string): string {
  return btoa(bytesToBinary(encoder.encode(text)))
}

/** Accepts the URL-safe alphabet and missing padding, since both are what people
 *  actually paste; rejects anything else. */
export function decodeBase64(input: string): string {
  const cleaned = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) throw new Error('not base64')
  const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4)
  const binary = atob(padded)
  return decoder.decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
}

export function encodeUrl(text: string): string {
  return encodeURIComponent(text)
}

export function decodeUrl(input: string): string {
  return decodeURIComponent(input)
}

export function encodeHex(text: string): string {
  return Array.from(encoder.encode(text), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Forgives `0x`, spaces, colons and case — the shapes hex arrives in. */
export function decodeHex(input: string): string {
  const cleaned = input.replace(/^0x/i, '').replace(/[\s:]+/g, '')
  if (cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(cleaned)) throw new Error('not hex')
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16)
  return decoder.decode(bytes)
}

export function encode(scheme: Scheme, text: string): string {
  switch (scheme) {
    case 'base64':
      return encodeBase64(text)
    case 'url':
      return encodeUrl(text)
    case 'hex':
      return encodeHex(text)
  }
}

export function decode(scheme: Scheme, input: string): string {
  switch (scheme) {
    case 'base64':
      return decodeBase64(input)
    case 'url':
      return decodeUrl(input)
    case 'hex':
      return decodeHex(input)
  }
}
