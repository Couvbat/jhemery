import { afterEach, describe, expect, it } from 'vitest'
import { toBase64Url } from '../base64url'
import {
  MAX_SAVE_BYTES,
  MAX_VALUE_BYTES,
  SAVE_VERSION,
  codeFrom,
  decodeSave,
  encodeSave,
  fitSave,
  isPortable,
  portableItems,
  saveLink,
  writeSave,
} from '../save-file'
import { storedItems } from '../storage-keys'

/** A code by hand: the version, a format byte (0 is stored as it is), and the payload. */
function rawCode(payload: unknown, version = SAVE_VERSION): string {
  const json = new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload))
  return toBase64Url(Uint8Array.from([version, 0, ...json]))
}

const ITEMS = [
  { key: 'couvbat:theme', value: 'nord' },
  { key: 'couvbat:achievements', value: '["vim-quit","konami"]' },
  { key: 'couvbat:games:snake', value: '42' },
  { key: 'couvbat:aliases', value: '{"gl":"git log"}' },
]

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('what a save may carry', () => {
  it('takes the visitor’s own keys and never a secret', () => {
    expect(isPortable('couvbat:theme')).toBe(true)
    expect(isPortable('couvbat:history')).toBe(true)
    expect(isPortable('couvbat:sudo')).toBe(false)
    expect(isPortable('couvbat:room:AB3DE')).toBe(false)
    expect(isPortable('couvbat:old-thing')).toBe(false)
    expect(isPortable('umami.disabled')).toBe(false)
    // A refusal of visit counting belongs to its browser: a link must not withdraw one.
    expect(isPortable('couvbat:analytics')).toBe(false)
  })

  it('carries the groups asked for, from what is stored', () => {
    localStorage.setItem('couvbat:theme', 'nord')
    localStorage.setItem('couvbat:history', '["ls"]')
    localStorage.setItem('couvbat:old-thing', 'x')
    sessionStorage.setItem('couvbat:sudo', 'hunter2')
    expect(portableItems(['settings', 'shell']).map((item) => item.key)).toEqual(['couvbat:theme', 'couvbat:history'])
    expect(portableItems(['settings']).map((item) => item.key)).toEqual(['couvbat:theme'])
    expect(portableItems(['settings', 'progress', 'scores', 'shell'], storedItems()).some((i) => i.key === 'couvbat:sudo')).toBe(false)
  })
})

describe('a save code', () => {
  it('reads back exactly what was written into it', async () => {
    const { code, tooBig } = await encodeSave(ITEMS)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(tooBig).toEqual([])
    expect(await decodeSave(code)).toEqual({ ok: true, items: ITEMS, dropped: [] })
  })

  // The same limits a read holds a code to, so a link never offers what restoring drops.
  it('leaves out, and names, a value too big for a restore to take', async () => {
    const history = { key: 'couvbat:history', value: JSON.stringify(Array.from({ length: 100 }, (_, i) => `echo ${i} ${'x'.repeat(700)}`)) }
    const { code, tooBig } = await encodeSave([...ITEMS, history])
    expect(tooBig).toEqual(['couvbat:history'])
    expect(await decodeSave(code)).toEqual({ ok: true, items: ITEMS, dropped: [] })
  })

  it('stops adding values once the whole would pass what a read unpacks', () => {
    const big = (key: string) => ({ key, value: 'x'.repeat(MAX_VALUE_BYTES - 100) })
    const keys = ['couvbat:history', 'couvbat:aliases', 'couvbat:achievements', 'couvbat:ctf', 'couvbat:theme:custom']
    const { items, tooBig } = fitSave(keys.map(big))
    expect(items.length).toBe(Math.floor(MAX_SAVE_BYTES / MAX_VALUE_BYTES))
    expect(tooBig).toEqual(keys.slice(items.length))
    const json = JSON.stringify(Object.fromEntries(items.map((i) => [i.key, i.value])))
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(MAX_SAVE_BYTES)
  })

  it('reads from the link as well as the bare code, which rides in the fragment', async () => {
    const { code } = await encodeSave(ITEMS)
    const link = saveLink('https://jhemery.xyz', code)
    expect(link).toBe(`https://jhemery.xyz/privacy#save=${code}`)
    expect(new URL(link).search).toBe('')
    expect(codeFrom(`  ${link}\n`)).toBe(code)
    expect(await decodeSave(link)).toMatchObject({ ok: true, items: ITEMS })
  })

  it('reads one stored without compression too', async () => {
    expect(await decodeSave(rawCode({ 'couvbat:theme': 'dracula' }))).toEqual({
      ok: true,
      items: [{ key: 'couvbat:theme', value: 'dracula' }],
      dropped: [],
    })
  })

  // Anyone can send a link, so nothing in one is trusted.
  it('drops a secret, an unlisted key, a value that isn’t a string and one that is too big', async () => {
    const read = await decodeSave(
      rawCode({
        'couvbat:theme': 'nord',
        'couvbat:sudo': 'hunter2',
        'couvbat:room:AB3DE': 'token',
        'couvbat:analytics': 'counted',
        'evil:key': 'x',
        'couvbat:games:snake': 42,
        'couvbat:history': 'x'.repeat(MAX_VALUE_BYTES + 1),
      }),
    )
    expect(read).toEqual({
      ok: true,
      items: [{ key: 'couvbat:theme', value: 'nord' }],
      dropped: ['couvbat:sudo', 'couvbat:room:AB3DE', 'couvbat:analytics', 'evil:key', 'couvbat:games:snake', 'couvbat:history'],
    })
  })

  it('refuses what isn’t a save, says why, and never throws', async () => {
    expect(await decodeSave('')).toEqual({ ok: false, reason: 'malformed' })
    expect(await decodeSave('not a code!')).toEqual({ ok: false, reason: 'malformed' })
    expect(await decodeSave(rawCode({ 'couvbat:theme': 'nord' }, 9))).toEqual({ ok: false, reason: 'version' })
    expect(await decodeSave(rawCode('[1, 2]'))).toEqual({ ok: false, reason: 'malformed' })
    expect(await decodeSave(rawCode('{"couvbat:theme":'))).toEqual({ ok: false, reason: 'malformed' })
    expect(await decodeSave(toBase64Url(Uint8Array.from([SAVE_VERSION, 7, 1, 2])))).toEqual({ ok: false, reason: 'malformed' })
    // Deflated bytes that aren't deflate.
    expect(await decodeSave(toBase64Url(Uint8Array.from([SAVE_VERSION, 1, 0xff, 0xff, 0xff])))).toEqual({ ok: false, reason: 'malformed' })
  })

  // A few hundred bytes of deflate can unpack into megabytes; reading stops at the limit.
  it('stops unpacking a code that would grow past the limit', async () => {
    const huge = new TextEncoder().encode(JSON.stringify({ 'couvbat:theme': 'x'.repeat(MAX_SAVE_BYTES * 4) }))
    const packed = await new Response(new Response(huge).body!.pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()
    const code = toBase64Url(Uint8Array.from([SAVE_VERSION, 1, ...new Uint8Array(packed)]))
    expect(code.length).toBeLessThan(5_000)
    expect(await decodeSave(code)).toEqual({ ok: false, reason: 'too-large' })
  })
})

describe('restoring', () => {
  it('writes the keys a save may carry and nothing else', () => {
    localStorage.setItem('couvbat:theme', 'dracula')
    const written = writeSave([...ITEMS, { key: 'couvbat:sudo', value: 'hunter2' }, { key: 'evil:key', value: 'x' }])
    expect(written).toEqual(ITEMS.map((item) => item.key))
    expect(localStorage.getItem('couvbat:theme')).toBe('nord')
    expect(localStorage.getItem('couvbat:sudo')).toBeNull()
    expect(sessionStorage.getItem('couvbat:sudo')).toBeNull()
    expect(localStorage.getItem('evil:key')).toBeNull()
  })
})
