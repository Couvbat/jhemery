import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ALGORITHMS, digestText, toBase64, toHex } from '../hash/hash'

// jsdom exposes `crypto.getRandomValues` but no `subtle`; Node's implementation is
// the same Web Crypto API, so the maths is checked against it.
const subtle = webcrypto.subtle as SubtleCrypto

describe('hash tool', () => {
  it('encodes bytes as lowercase, zero-padded hex', () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]).buffer)).toBe('00010f10ff')
  })

  it('encodes bytes as base64', () => {
    expect(toBase64(new TextEncoder().encode('hello').buffer as ArrayBuffer)).toBe('aGVsbG8=')
  })

  it('matches the published SHA test vectors for "abc"', async () => {
    expect(toHex(await digestText('SHA-1', 'abc', subtle))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    )
    expect(toHex(await digestText('SHA-256', 'abc', subtle))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(toBase64(await digestText('SHA-256', 'abc', subtle))).toBe(
      'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    )
  })

  it('hashes the UTF-8 bytes, not the UTF-16 code units', async () => {
    // "é" is the two bytes C3 A9 in UTF-8; hashing the string's code units would differ.
    const expected = toHex(await subtle.digest('SHA-256', new Uint8Array([0xc3, 0xa9])))
    expect(toHex(await digestText('SHA-256', 'é', subtle))).toBe(expected)
  })

  it('offers exactly the three algorithms the page lists', () => {
    expect([...ALGORITHMS]).toEqual(['SHA-1', 'SHA-256', 'SHA-512'])
  })
})
