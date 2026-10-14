/**
 * Bytes ⇄ base64url, unpadded: the alphabet that survives a URL untouched, for the codes
 * the site puts in links (an `acid` pattern, a save file, a stems mix). Over btoa/atob
 * rather than borrowed from the encode tool, which is about UTF-8 text and would turn
 * these bytes into characters first.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Null for anything that isn't base64url: a length no encoding produces, or a stray character. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (text.length % 4 === 1 || !/^[A-Za-z0-9_-]*$/.test(text)) return null
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}
