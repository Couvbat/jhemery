/**
 * A QR code encoder, written from ISO/IEC 18004 rather than pulled in: byte mode,
 * versions 1–40, all four error-correction levels, and the mask chosen by the
 * standard's penalty score. `ffmpeg` stays the only dependency the tools page makes
 * an exception for (tools-and-views spec §5); this is ~300 lines against a package.
 *
 * Byte mode only, on purpose: it takes any UTF-8 text, and the numeric and
 * alphanumeric modes only save room for inputs a person rarely types into a web tool.
 * The structure follows the standard's own order — codewords, then blocks and Reed–
 * Solomon, then the function patterns, then placement and masking — and `qr.spec.ts`
 * checks each stage against the standard's worked examples and a reference encoder.
 */

export type Ecl = 'L' | 'M' | 'Q' | 'H'
export const ECLS: Ecl[] = ['L', 'M', 'Q', 'H']

/** The two bits each level writes into the format information. */
const FORMAT_BITS: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 }
const ROW: Record<Ecl, number> = { L: 0, M: 1, Q: 2, H: 3 }

/** Error-correction codewords per block, by level then version (index 0 unused). */
const ECC_PER_BLOCK: number[][] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]

/** Error-correction blocks, by level then version (index 0 unused). */
const BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

export const MIN_VERSION = 1
export const MAX_VERSION = 40

export interface QrCode {
  version: number
  ecl: Ecl
  mask: number
  /** Side length in modules: `4 × version + 17`. */
  size: number
  /** `modules[y][x]`, true for dark. */
  modules: boolean[][]
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

/** Modules left for data and error correction once every function pattern is drawn. */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (version >= 7) result -= 36
  }
  return result
}

export function dataCodewords(version: number, ecl: Ecl): number {
  const row = ROW[ecl]
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[row]![version]! * BLOCKS[row]![version]!
}

/** Byte mode spends 4 bits on the mode and 8 or 16 on the length (versions 10 and up). */
function countBits(version: number): number {
  return version <= 9 ? 8 : 16
}

/** How many bytes of data a version holds at a level. */
export function byteCapacity(version: number, ecl: Ecl): number {
  return Math.floor((dataCodewords(version, ecl) * 8 - 4 - countBits(version)) / 8)
}

/** The smallest version that holds `bytes`, or null when even version 40 is too small. */
export function versionFor(bytes: number, ecl: Ecl): number | null {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
    if (byteCapacity(version, ecl) >= bytes) return version
  }
  return null
}

// ---------------------------------------------------------------------------
// Codewords
// ---------------------------------------------------------------------------

/** Mode, length, data, terminator, byte padding, then the 0xEC/0x11 pad bytes. */
export function dataCodewordsFor(bytes: Uint8Array, version: number, ecl: Ecl): number[] {
  const capacity = dataCodewords(version, ecl) * 8
  const bits: number[] = []
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }

  push(0b0100, 4)
  push(bytes.length, countBits(version))
  for (const byte of bytes) push(byte, 8)
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8)

  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0))
  }
  return codewords
}

// ---------------------------------------------------------------------------
// Reed–Solomon over GF(2⁸), modulo x⁸ + x⁴ + x³ + x² + 1
// ---------------------------------------------------------------------------

export function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

/** The generator polynomial of `degree`, highest coefficient dropped (it is always 1). */
export function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j]!, root)
      if (j + 1 < result.length) result[j]! ^= result[j + 1]!
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

export function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0)
  for (const byte of data) {
    const factor = byte ^ result.shift()!
    result.push(0)
    divisor.forEach((coefficient, i) => {
      result[i]! ^= gfMultiply(coefficient, factor)
    })
  }
  return result
}

/**
 * Splits the data into the version's blocks, appends each block's error correction,
 * and interleaves: first byte of every block, then the second, and so on. The later
 * blocks are one data byte longer than the early ones when the count does not divide.
 */
export function withErrorCorrection(data: readonly number[], version: number, ecl: Ecl): number[] {
  const row = ROW[ecl]
  const blockCount = BLOCKS[row]![version]!
  const eccLength = ECC_PER_BLOCK[row]![version]!
  const raw = Math.floor(rawDataModules(version) / 8)
  const shortBlocks = blockCount - (raw % blockCount)
  const shortLength = Math.floor(raw / blockCount)
  const divisor = rsDivisor(eccLength)

  const blocks: number[][] = []
  for (let i = 0, k = 0; i < blockCount; i++) {
    const block = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1))
    k += block.length
    const ecc = rsRemainder(block, divisor)
    // A placeholder keeps every block the same length for the interleave below.
    if (i < shortBlocks) block.push(0)
    blocks.push([...block, ...ecc])
  }

  const out: number[] = []
  for (let i = 0; i < blocks[0]!.length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLength - eccLength || j >= shortBlocks) out.push(block[i]!)
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// The symbol
// ---------------------------------------------------------------------------

/** Centres of the alignment patterns along one axis. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
  const size = version * 4 + 17
  const result = [6]
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos)
  return result
}

/** The 15 format bits: level and mask, BCH-protected, XOR-masked with 0x5412. */
export function formatBits(ecl: Ecl, mask: number): number {
  const data = (FORMAT_BITS[ecl] << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((data << 10) | rem) ^ 0x5412
}

/** The 18 version bits, from version 7 up. */
export function versionBits(version: number): number {
  let rem = version
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
  return (version << 12) | rem
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

const bit = (value: number, i: number) => ((value >>> i) & 1) !== 0

class Grid {
  readonly modules: boolean[][]
  readonly reserved: boolean[][]

  constructor(readonly size: number) {
    this.modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
    this.reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  }

  set(x: number, y: number, dark: boolean) {
    this.modules[y]![x] = dark
    this.reserved[y]![x] = true
  }

  finder(cx: number, cy: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue
        const ring = Math.max(Math.abs(dx), Math.abs(dy))
        this.set(x, y, ring !== 2 && ring !== 4)
      }
    }
  }

  alignment(cx: number, cy: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }

  format(ecl: Ecl, mask: number) {
    const bits = formatBits(ecl, mask)
    const size = this.size
    // Around the top-left finder…
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(bits, i))
    this.set(8, 7, bit(bits, 6))
    this.set(8, 8, bit(bits, 7))
    this.set(7, 8, bit(bits, 8))
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(bits, i))
    // …and split between the other two, with the one module that is always dark.
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(bits, i))
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(bits, i))
    this.set(8, size - 8, true)
  }

  version(version: number) {
    if (version < 7) return
    const bits = versionBits(version)
    for (let i = 0; i < 18; i++) {
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.set(a, b, bit(bits, i))
      this.set(b, a, bit(bits, i))
    }
  }

  /** Two columns at a time from the right, snaking up then down, skipping the
   *  vertical timing column and anything reserved. */
  place(codewords: readonly number[]) {
    const total = codewords.length * 8
    let i = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (this.reserved[y]![x] || i >= total) continue
          this.modules[y]![x] = bit(codewords[i >>> 3]!, 7 - (i & 7))
          i++
        }
      }
    }
  }

  applyMask(mask: number) {
    const test = MASKS[mask]!
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.reserved[y]![x] && test(x, y)) this.modules[y]![x] = !this.modules[y]![x]
      }
    }
  }
}

/**
 * The standard's four penalty rules: runs of five or more, 2×2 blocks, finder-like
 * 1:1:3:1:1 patterns with four light modules on a side, and dark/light imbalance.
 */
export function penalty(modules: boolean[][]): number {
  const size = modules.length
  let score = 0

  const finderLike = (history: number[]) => {
    const n = history[1]!
    const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n
    return (core && history[0]! >= n * 4 && history[6]! >= n ? 1 : 0) + (core && history[6]! >= n * 4 && history[0]! >= n ? 1 : 0)
  }
  const addRun = (length: number, history: number[]) => {
    // The quiet zone counts as light before the first run.
    if (history[0] === 0) length += size
    history.pop()
    history.unshift(length)
  }

  for (const line of [
    (i: number, j: number) => modules[i]![j]!,
    (i: number, j: number) => modules[j]![i]!,
  ]) {
    for (let i = 0; i < size; i++) {
      let colour = false
      let run = 0
      const history = [0, 0, 0, 0, 0, 0, 0]
      for (let j = 0; j < size; j++) {
        if (line(i, j) === colour) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score++
        } else {
          addRun(run, history)
          if (!colour) score += finderLike(history) * 40
          colour = line(i, j)
          run = 1
        }
      }
      if (colour) {
        addRun(run, history)
        run = 0
      }
      addRun(run + size, history)
      score += finderLike(history) * 40
    }
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y]![x]
      if (c === modules[y]![x + 1] && c === modules[y + 1]![x] && c === modules[y + 1]![x + 1]) score += 3
    }
  }

  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
  const total = size * size
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
  return score
}

export class QrTooLong extends Error {
  constructor(readonly bytes: number, readonly ecl: Ecl) {
    super(`${bytes} bytes do not fit in a QR code at level ${ecl}`)
  }
}

/**
 * Encodes `text` as UTF-8 in the smallest version that holds it. `mask` is for the
 * spec, which compares against a reference encoder at a fixed mask; left out, each of
 * the eight is tried and the lowest penalty wins.
 */
export function encodeQr(text: string, ecl: Ecl = 'M', options: { mask?: number; version?: number } = {}): QrCode {
  const bytes = new TextEncoder().encode(text)
  const fits = versionFor(bytes.length, ecl)
  if (fits === null) throw new QrTooLong(bytes.length, ecl)
  const version = Math.max(fits, options.version ?? 0)
  return drawQr(dataCodewordsFor(bytes, version, ecl), version, ecl, options.mask)
}

/**
 * Everything after the data codewords: error correction, the function patterns,
 * placement, and the mask. Separate from `encodeQr` so the spec can hand it a
 * reference encoder's own codewords and compare the symbol module for module.
 */
export function drawQr(data: readonly number[], version: number, ecl: Ecl, requestedMask?: number): QrCode {
  const size = version * 4 + 17
  const grid = new Grid(size)
  for (let i = 0; i < size; i++) {
    grid.set(6, i, i % 2 === 0)
    grid.set(i, 6, i % 2 === 0)
  }
  grid.finder(3, 3)
  grid.finder(size - 4, 3)
  grid.finder(3, size - 4)
  const align = alignmentPositions(version)
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)
      if (!corner) grid.alignment(align[i]!, align[j]!)
    }
  }
  grid.format(ecl, 0) // reserves the area; rewritten once the mask is known
  grid.version(version)
  grid.place(withErrorCorrection(data, version, ecl))

  let mask = requestedMask ?? -1
  if (mask < 0) {
    let best = Infinity
    for (let candidate = 0; candidate < 8; candidate++) {
      grid.applyMask(candidate)
      grid.format(ecl, candidate)
      const score = penalty(grid.modules)
      if (score < best) {
        best = score
        mask = candidate
      }
      grid.applyMask(candidate) // XOR again undoes it
    }
  }
  grid.applyMask(mask)
  grid.format(ecl, mask)

  return { version, ecl, mask, size, modules: grid.modules }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** The four-module quiet zone the standard requires around the symbol. */
export const QUIET_ZONE = 4

/**
 * An SVG with one path for every dark module — one element rather than hundreds, so
 * it stays small and scales without seams. Black on white whatever the site's theme:
 * scanners want contrast, not a palette.
 */
export function toSvg(qr: QrCode, border = QUIET_ZONE): string {
  const extent = qr.size + border * 2
  const parts: string[] = []
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.modules[y]![x]) parts.push(`M${x + border},${y + border}h1v1h-1z`)
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="#ffffff"/><path d="${parts.join('')}" fill="#000000"/></svg>`
  )
}
