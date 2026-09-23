/**
 * Digests over Web Crypto. `subtle` is a parameter rather than a global read so the
 * encoding maths can be tested under Node's `webcrypto` — jsdom has no `subtle`.
 */

export const ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-512'] as const
export type Algorithm = (typeof ALGORITHMS)[number]

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function toBase64(buffer: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function digest(
  algorithm: Algorithm,
  data: BufferSource,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<ArrayBuffer> {
  return subtle.digest(algorithm, data)
}

export function digestText(
  algorithm: Algorithm,
  text: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<ArrayBuffer> {
  return digest(algorithm, new TextEncoder().encode(text), subtle)
}
