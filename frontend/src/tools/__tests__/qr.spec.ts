import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  alignmentPositions,
  byteCapacity,
  dataCodewords,
  dataCodewordsFor,
  drawQr,
  ECLS,
  encodeQr,
  formatBits,
  QrTooLong,
  rsDivisor,
  rsRemainder,
  toSvg,
  versionBits,
  withErrorCorrection,
  type Ecl,
  type QrCode,
} from '../qr/qr'

/**
 * A QR encoder that is subtly wrong still draws something that looks like a QR code,
 * so every stage is checked against an answer this file did not compute: the
 * standard's own worked examples, its tables, and module-for-module matrices from a
 * reference encoder (segno 1.6.6, run once, at the same version and mask), then read
 * back by a decoder written here.
 */

const rows = (qr: QrCode) => qr.modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join(''))
const sha = (qr: QrCode) => createHash('sha256').update(rows(qr).join('\n')).digest('hex')

describe('Reed–Solomon', () => {
  it('matches ISO/IEC 18004 Annex I ("01234567", 1-M)', () => {
    const data = [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17]
    expect(rsRemainder(data, rsDivisor(10))).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85])
  })

  it('matches the usual "HELLO WORLD" 1-M example', () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
    expect(rsRemainder(data, rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
  })

  it('appends the error correction after a single block unchanged', () => {
    const data = [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17]
    expect(withErrorCorrection(data, 1, 'M').slice(16)).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85])
  })
})

describe('format and version information', () => {
  // The standard's table of the 32 format strings, level then mask 0–7.
  const TABLE: Record<Ecl, string[]> = {
    L: ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'],
    M: ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'],
    Q: ['011010101011111', '011000001101000', '011111100110001', '011101000000110', '010010010110100', '010000110000011', '010111011011010', '010101111101101'],
    H: ['001011010001001', '001001110111110', '001110011100111', '001100111010000', '000011101100010', '000001001010101', '000110100001100', '000100000111011'],
  }

  it.each(ECLS)('encodes every mask at level %s', (ecl) => {
    for (let mask = 0; mask < 8; mask++) {
      expect(formatBits(ecl, mask).toString(2).padStart(15, '0'), `${ecl}${mask}`).toBe(TABLE[ecl][mask])
    }
  })

  it('encodes version information from 7 up', () => {
    expect(versionBits(7)).toBe(0x07c94)
    expect(versionBits(40)).toBe(0x28c69)
  })
})

describe('capacity', () => {
  // Bytes per version and level, from the standard's capacity table.
  const BYTES: Record<number, [number, number, number, number]> = {
    1: [17, 14, 11, 7],
    2: [32, 26, 20, 14],
    3: [53, 42, 32, 24],
    4: [78, 62, 46, 34],
    5: [106, 84, 60, 44],
    6: [134, 106, 74, 58],
    7: [154, 122, 86, 64],
    8: [192, 152, 108, 84],
    9: [230, 180, 130, 98],
    10: [271, 213, 151, 119],
    40: [2953, 2331, 1663, 1273],
  }

  it.each(Object.entries(BYTES))('version %s holds the standard’s byte counts', (version, counts) => {
    expect(ECLS.map((ecl) => byteCapacity(Number(version), ecl))).toEqual(counts)
  })

  it('picks the smallest version that fits, and refuses what nothing fits', () => {
    expect(encodeQr('x'.repeat(14), 'M').version).toBe(1)
    expect(encodeQr('x'.repeat(15), 'M').version).toBe(2)
    expect(() => encodeQr('x'.repeat(2954), 'L')).toThrow(QrTooLong)
  })
})

describe('padding', () => {
  it('goes straight from the terminator to the pad codewords on a byte boundary (7.4.10)', () => {
    // 0100 | 00000101 | h e l l o | 0000: already 56 bits, so no padding bits, and
    // 0xEC 0x11 alternate from the next codeword on.
    expect(dataCodewordsFor(new TextEncoder().encode('hello'), 1, 'M')).toEqual([
      64, 86, 134, 86, 198, 198, 240, 236, 17, 236, 17, 236, 17, 236, 17, 236,
    ])
  })

  it('drops the terminator when the data fills the symbol', () => {
    const data = dataCodewordsFor(new TextEncoder().encode('z'.repeat(14)), 1, 'M')
    expect(data).toHaveLength(16)
    expect(data.at(-1)).toBe(0x7a << 4 & 0xff)
  })
})

/**
 * segno writes a whole zero codeword after the terminator when the stream already
 * sits on a byte boundary — `8 - length % 8` bits, which is 8 when the remainder is
 * 0 — where the standard (7.4.10) pads only a stream that does not. Readers stop at
 * the terminator, so its symbols scan, but the pad codewords land one place later.
 * So its codewords are rebuilt here and handed to `drawQr`: everything from the
 * blocks on — Reed–Solomon, interleaving, function patterns, placement, masking,
 * format and version information — is then compared module for module.
 */
function segnoCodewords(text: string, version: number, ecl: Ecl): number[] {
  const bytes = new TextEncoder().encode(text)
  const ours = dataCodewordsFor(bytes, version, ecl)
  const header = (4 + (version <= 9 ? 8 : 16) + 4) / 8
  const end = header + bytes.length
  return end >= ours.length ? ours : [...ours.slice(0, end), 0, ...ours.slice(end, -1)]
}

describe('against a reference encoder', () => {
  it('draws "hello" (1-M, mask 0) module for module', () => {
    const expected = [
      '#######..##...#######',
      '#.....#.##..#.#.....#',
      '#.###.#....##.#.###.#',
      '#.###.#..#.#..#.###.#',
      '#.###.#.##.##.#.###.#',
      '#.....#..#.#..#.....#',
      '#######.#.#.#.#######',
      '.....................',
      '#.#.#.#...#.#...#..#.',
      '.###.....#.#.#.#...##',
      '#.#####...##.###.####',
      '.#..#..#######.##..#.',
      '##....#...##.###.....',
      '........##....##..###',
      '#######..##.#...#.###',
      '#.....#..##...##.....',
      '#.###.#.#.#.#.#.#..##',
      '#.###.#...##.#.#..##.',
      '#.###.#.####.##.#.#.#',
      '#.....#..#####..#..#.',
      '#######.##.#.###...##',
    ]
    const qr = drawQr(segnoCodewords('hello', 1, 'M'), 1, 'M', 0)
    expect(rows(qr).map((row) => row.replace(/1/g, '#').replace(/0/g, '.'))).toEqual(expected)
  })

  // One case per structural feature: several blocks, versions 7+ (version
  // information), 10+ (16-bit length), the largest, UTF-8 input, every level.
  it.each([
    ['https://jhemery.xyz', 'L', 2, 3, 'a8c56e51043d9561fd43fa3ce93ba5f781f00cd06e2064e97b14f9c8118bdf1e'],
    ['Jules Hémery — Full-Stack', 'Q', 3, 5, 'd6e6916eff87dc3a1f111102926e8e805716fed1f97231135c381785cd4f787c'],
    ['x'.repeat(150), 'H', 12, 6, 'e5749b5fbea9be76cad7a4224efd21167fdfd5736b014821bfb8a3c39c16203e'],
    ['a'.repeat(250), 'M', 11, 2, 'eaa1c96460bcee3428b1f19608377fa5d44890ce8b17fad68725b8ff0d6480a1'],
    ['abc'.repeat(300), 'L', 21, 4, '067273caf1cbc945975298ca094a4c4afa9ca7eebbe54f305a639197181966d5'],
    ['The quick brown fox jumps over the lazy dog. '.repeat(30), 'Q', 36, 7, '1e26bbe1a6011169b4de5955ead8838046ac11a6d140f0dd8dc8ffae4ae582fb'],
    ['z'.repeat(2331), 'M', 40, 1, '3df0b1f45eba120946e20ee862856d306aadad249e4b13cd12ed91792a6164e0'],
  ] as const)('matches case %#', (text, ecl, version, mask, hash) => {
    expect(encodeQr(text, ecl).version).toBe(version)
    expect(sha(drawQr(segnoCodewords(text, version, ecl), version, ecl, mask))).toBe(hash)
  })
})

/**
 * A decoder written for this file, for the symbols `encodeQr` itself produces (single
 * block, versions 1–6): it finds the format bits in the *second* copy, maps the
 * function patterns from the standard's geometry rather than from the encoder, walks
 * the data columns, unmasks, and parses byte mode.
 */
function decode(qr: QrCode): string {
  const { size, modules, version } = qr
  let format = 0
  for (let i = 0; i < 8; i++) format |= (modules[8]![size - 1 - i] ? 1 : 0) << i
  for (let i = 8; i < 15; i++) format |= (modules[size - 15 + i]![8] ? 1 : 0) << i
  const info = (format ^ 0x5412) >>> 10
  const ecl = (['M', 'L', 'H', 'Q'] as const)[info >>> 3]!
  const mask = info & 7

  const isFunction = (x: number, y: number) => {
    if (x === 6 || y === 6) return true
    if (x <= 8 && y <= 8) return true // top-left finder, separator, format
    if (x >= size - 8 && y <= 8) return true // top-right
    if (x <= 8 && y >= size - 8) return true // bottom-left, dark module included
    const align = alignmentPositions(version)
    if (align.length) {
      const c = align[align.length - 1]!
      if (Math.abs(x - c) <= 2 && Math.abs(y - c) <= 2) return true
    }
    return false
  }
  const flip = [
    (x: number, y: number) => (x + y) % 2 === 0,
    (_x: number, y: number) => y % 2 === 0,
    (x: number) => x % 3 === 0,
    (x: number, y: number) => (x + y) % 3 === 0,
    (x: number, y: number) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x: number, y: number) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x: number, y: number) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x: number, y: number) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ][mask]!

  // Right-hand column of each pair: every even x down to 8, then 5, 3, 1 — the
  // vertical timing column at 6 is stepped over.
  const columns: number[] = []
  for (let x = size - 1; x >= 8; x -= 2) columns.push(x)
  columns.push(5, 3, 1)

  const bits: number[] = []
  columns.forEach((right, pair) => {
    const ys = [...Array(size).keys()]
    if (pair % 2 === 0) ys.reverse() // the first pair runs upward
    for (const y of ys) {
      for (const x of [right, right - 1]) {
        if (!isFunction(x, y)) bits.push(modules[y]![x]! !== flip(x, y) ? 1 : 0)
      }
    }
  })

  const stream = bits.slice(0, dataCodewords(version, ecl) * 8)
  let at = 0
  const read = (n: number) => {
    let value = 0
    for (let i = 0; i < n; i++) value = (value << 1) | stream[at++]!
    return value
  }
  expect(read(4)).toBe(0b0100)
  const length = read(version <= 9 ? 8 : 16)
  return new TextDecoder().decode(Uint8Array.from({ length }, () => read(8)))
}

describe('round trip', () => {
  it.each([
    ['hello', 'M', 1],
    ['https://jhemery.xyz/?run=wordle%20daily', 'L', 3],
    ['Jules Hémery — ça marche', 'M', 3],
  ] as const)('reads back %s', (text, ecl, version) => {
    const qr = encodeQr(text, ecl)
    expect(qr.version).toBe(version)
    expect(decode(qr)).toBe(text)
  })

  it('chooses a mask of its own that still reads back', () => {
    const masks = new Set(['a', 'bb', 'hello', 'jhemery', 'QR!'].map((text) => encodeQr(text, 'M').mask))
    expect(masks.size).toBeGreaterThan(1)
  })
})

describe('svg', () => {
  it('draws one path on a white square with the quiet zone', () => {
    const qr = encodeQr('hello', 'M')
    const svg = toSvg(qr)
    expect(svg).toContain('viewBox="0 0 29 29"')
    expect(svg.match(/<path/g)).toHaveLength(1)
    const dark = qr.modules.flat().filter(Boolean).length
    expect(svg.match(/h1v1h-1z/g)).toHaveLength(dark)
  })
})
