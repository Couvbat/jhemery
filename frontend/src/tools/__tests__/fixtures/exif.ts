/**
 * Byte builders for the metadata inspector's specs. Every fixture is assembled here from the
 * structures the standards describe rather than committed as a binary nobody can read in a
 * diff, the way the e2e suite draws its images with the browser's own encoder.
 *
 * Each builder writes only what `inspectBytes` reads. It walks containers, never pixels, and
 * never checks a CRC, so a JPEG here has a token scan and a PNG's CRCs are zero.
 *
 * The e2e suite imports this too, to splice a real Exif segment into a canvas-drawn JPEG, so
 * it imports nothing and touches no DOM.
 */

export type ByteOrder = 'II' | 'MM'

/** What every builder returns: backed by a plain `ArrayBuffer`, so it goes straight into a
 *  `Blob` or a Playwright upload. */
export type Bytes = Uint8Array<ArrayBuffer>

// TIFF 6.0 §2: the field types an entry names.
export const BYTE = 1
export const ASCII = 2
export const SHORT = 3
export const LONG = 4
export const RATIONAL = 5
export const UNDEFINED = 7

// The tags the specs write, by their TIFF 6.0 §8 and CIPA DC-008 §4.6 numbers.
export const TAG = {
  make: 0x010f,
  model: 0x0110,
  orientation: 0x0112,
  software: 0x0131,
  dateTime: 0x0132,
  artist: 0x013b,
  copyright: 0x8298,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  exposureTime: 0x829a,
  dateTimeOriginal: 0x9003,
  makerNote: 0x927c,
  bodySerial: 0xa431,
  lensModel: 0xa434,
  gpsVersion: 0x0000,
  gpsLatitudeRef: 0x0001,
  gpsLatitude: 0x0002,
  gpsLongitudeRef: 0x0003,
  gpsLongitude: 0x0004,
} as const

export interface Entry {
  tag: number
  type: number
  /** BYTE, ASCII and UNDEFINED: one byte each. SHORT and LONG: one number each. RATIONAL:
   *  numerator, denominator, numerator, … */
  values: number[]
  /** Overrides the count derived from `values`, to write an entry that lies about its size. */
  count?: number
}

const encoder = new TextEncoder()

export const ascii = (tag: number, text: string): Entry => ({
  tag,
  type: ASCII,
  values: [...encoder.encode(text), 0],
})
export const short = (tag: number, ...values: number[]): Entry => ({ tag, type: SHORT, values })
export const long = (tag: number, ...values: number[]): Entry => ({ tag, type: LONG, values })
export const rational = (tag: number, ...pairs: Array<[number, number]>): Entry => ({
  tag,
  type: RATIONAL,
  values: pairs.flat(),
})
export const opaque = (tag: number, bytes: number[]): Entry => ({ tag, type: UNDEFINED, values: bytes })

/** Trafalgar Square, as a camera writes it: degrees, minutes and seconds as rationals. */
export const LONDON = {
  value: '51.50735, -0.12776',
  entries: [
    { tag: TAG.gpsVersion, type: BYTE, values: [2, 3, 0, 0] },
    ascii(TAG.gpsLatitudeRef, 'N'),
    rational(TAG.gpsLatitude, [51, 1], [30, 1], [2646, 100]),
    ascii(TAG.gpsLongitudeRef, 'W'),
    rational(TAG.gpsLongitude, [0, 1], [7, 1], [39936, 1000]),
  ],
}

export interface TiffSpec {
  ifd0: Entry[]
  exif?: Entry[]
  gps?: Entry[]
}

function push16(out: number[], value: number, le: boolean) {
  const bytes = [(value >>> 8) & 0xff, value & 0xff]
  out.push(...(le ? bytes.reverse() : bytes))
}

function push32(out: number[], value: number, le: boolean) {
  const bytes = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
  out.push(...(le ? bytes.reverse() : bytes))
}

function encode(entry: Entry, le: boolean): number[] {
  const out: number[] = []
  for (const value of entry.values) {
    if (entry.type === SHORT) push16(out, value, le)
    else if (entry.type === LONG || entry.type === RATIONAL) push32(out, value, le)
    else out.push(value & 0xff)
  }
  return out
}

/**
 * A TIFF block: the payload of a JPEG's Exif APP1 after `Exif\0\0`, of a PNG `eXIf` and of a
 * WebP `EXIF`. IFD0 comes first, then the Exif and GPS IFDs (with their pointers added to
 * IFD0), then every value too long to sit in its entry.
 */
export function tiff(order: ByteOrder, spec: TiffSpec): Bytes {
  const le = order === 'II'
  const ifd0Length = spec.ifd0.length + (spec.exif ? 1 : 0) + (spec.gps ? 1 : 0)
  const ifdSize = (entries: number) => 2 + 12 * entries + 4

  let offset = 8
  const ifd0At = offset
  offset += ifdSize(ifd0Length)
  const exifAt = offset
  if (spec.exif) offset += ifdSize(spec.exif.length)
  const gpsAt = offset
  if (spec.gps) offset += ifdSize(spec.gps.length)
  const dataAt = offset

  const ifds: Entry[][] = [
    [
      ...spec.ifd0,
      ...(spec.exif ? [long(TAG.exifIfd, exifAt)] : []),
      ...(spec.gps ? [long(TAG.gpsIfd, gpsAt)] : []),
    ],
    ...(spec.exif ? [spec.exif] : []),
    ...(spec.gps ? [spec.gps] : []),
  ]

  const out: number[] = order === 'II' ? [0x49, 0x49] : [0x4d, 0x4d]
  push16(out, 42, le)
  push32(out, ifd0At, le)
  const data: number[] = []
  for (const entries of ifds) {
    push16(out, entries.length, le)
    for (const entry of entries) {
      const value = encode(entry, le)
      const count = entry.count ?? (entry.type === RATIONAL ? entry.values.length / 2 : entry.values.length)
      push16(out, entry.tag, le)
      push16(out, entry.type, le)
      push32(out, count, le)
      if (value.length <= 4) {
        out.push(...value, ...new Array<number>(4 - value.length).fill(0))
      } else {
        push32(out, dataAt + data.length, le)
        data.push(...value)
        if (data.length % 2) data.push(0)
      }
    }
    push32(out, 0, le)
  }
  return Uint8Array.from([...out, ...data])
}

export function concat(...parts: Array<Uint8Array | number[]>): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** One byte per character, so `\0` and `\x89` mean what they say. */
export function bytes(text: string): Bytes {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)
}

// --- JPEG (ITU-T T.81 B.1) --------------------------------------------------------------

/** A marker segment: `FF`, the marker, a big-endian length that counts itself, the payload. */
export function segment(marker: number, payload: Uint8Array | number[]): Bytes {
  const length = payload.length + 2
  return concat([0xff, marker, length >>> 8, length & 0xff], payload)
}

export const jfif = () => segment(0xe0, concat(bytes('JFIF\0'), [1, 1, 0, 0, 1, 0, 1, 0, 0]))
export const exif = (block: Uint8Array) => segment(0xe1, concat(bytes('Exif\0\0'), block))
export const xmp = (xml: string) =>
  segment(0xe1, concat(bytes('http://ns.adobe.com/xap/1.0/\0'), encoder.encode(xml)))
/** One APP2 of an ICC profile: its sequence number, the total, then a slice of the profile. */
export const icc = (sequence = 1, total = 1) =>
  segment(0xe2, concat(bytes('ICC_PROFILE\0'), [sequence, total], new Uint8Array(128)))
/** Photoshop's image resources, holding an IPTC-NAA record (resource 0x0404). */
export const iptc = () =>
  segment(0xed, concat(bytes('Photoshop 3.0\0'), bytes('8BIM'), [0x04, 0x04, 0, 0, 0, 0, 0, 4], [0x1c, 2, 0, 0]))
export const comment = (text: string) => segment(0xfe, encoder.encode(text))

/** SOI, the segments, then SOS with a token scan and EOI. The inspector stops at SOS. */
export function jpeg(...segments: Uint8Array[]): Bytes {
  return concat([0xff, 0xd8], ...segments, [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0], new Uint8Array(16), [0xff, 0xd9])
}

/** Puts `extra` after SOI and the APP0 a browser writes, which is where a camera's Exif sits. */
export function insertSegment(file: Uint8Array, extra: Uint8Array): Bytes {
  let at = 2
  if (file[2] === 0xff && file[3] === 0xe0) at = 4 + (((file[4] ?? 0) << 8) | (file[5] ?? 0))
  return concat(file.subarray(0, at), extra, file.subarray(at))
}

// --- PNG (PNG 3rd edition §5) -----------------------------------------------------------

export function chunk(type: string, data: Uint8Array | number[] = []): Bytes {
  const length = data.length
  return concat([length >>> 24, (length >>> 16) & 0xff, (length >>> 8) & 0xff, length & 0xff], bytes(type), data, [0, 0, 0, 0])
}

/** The signature, a 1×1 IHDR, the chunks, IEND. */
export function png(...chunks: Uint8Array[]): Bytes {
  return concat(
    bytes('\x89PNG\r\n\x1a\n'),
    chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunks,
    chunk('IEND'),
  )
}

// --- WebP (RFC 9649) --------------------------------------------------------------------

/** A RIFF chunk: FourCC, little-endian size, data, padded to an even length. */
export function riff(fourcc: string, data: Uint8Array | number[]): Bytes {
  const size = data.length
  return concat(bytes(fourcc), [size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, size >>> 24], data, size % 2 ? [0] : [])
}

/** The extended header: flags (0x08 Exif, 0x04 XMP, 0x20 ICC), then a 1×1 canvas. */
export const vp8x = (flags: number) => riff('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0])

export function webp(...chunks: Uint8Array[]): Bytes {
  const body = concat(bytes('WEBP'), ...chunks)
  const size = body.length
  return concat(bytes('RIFF'), [size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, size >>> 24], body)
}

// --- What the inspector refuses to guess at ---------------------------------------------

/** An ISO BMFF `ftyp` box naming its major and compatible brands, as HEIC and AVIF open. */
export function ftyp(major: string, ...compatible: string[]): Bytes {
  const size = 16 + 4 * compatible.length
  return concat([0, 0, 0, size], bytes('ftyp'), bytes(major), [0, 0, 0, 0], ...compatible.map(bytes), new Uint8Array(32))
}

export const gif = () => concat(bytes('GIF89a'), [1, 0, 1, 0, 0, 0, 0], bytes(';'))
