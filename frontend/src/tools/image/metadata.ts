/**
 * What an image file says about where it came from. The image tool runs this on the file it is
 * given and again on its own output, so "0 fields — verified" is a check a browser change would
 * fail on screen, not a claim about canvases (features-spec §11).
 *
 * Written from the standards rather than pulled in, like the QR encoder:
 *
 * - **TIFF 6.0** §2 for the structure every Exif block shares: the byte-order header, IFDs of
 *   12-byte entries, the field types, and the rule that a value of four bytes or fewer sits in
 *   its entry. §8 for the baseline tags read from IFD0.
 * - **CIPA DC-008** (Exif 2.32) §4.6.3 for the Exif and GPS IFD pointers, §4.6.5 for the Exif
 *   IFD's tags and §4.6.6 for the GPS IFD's. Each tag below names its section.
 * - The containers: JPEG markers up to SOS (ITU-T T.81 B.1), with each APP payload known by its
 *   signature (Exif; XMP Part 3 on JPEG; ICC.1 Annex B; Photoshop's image resources for IPTC);
 *   PNG chunks (PNG 3rd edition §11); WebP's RIFF chunks (RFC 9649 §2.7).
 *
 * The file is untrusted. Every read goes through `View`, which answers `null` past the end
 * instead of throwing, every loop is bounded by the bytes or by a cap, and every string is
 * stripped of control characters and capped before it leaves this module. Two rules make a
 * truncated file read as a subset of the whole one: a container is walked as far as its bytes
 * go, but a value is reported only when every byte of it is there.
 *
 * What counts as a field: each Exif/TIFF tag, each PNG text chunk, the PNG time, and the XMP,
 * ICC, IPTC and comment blocks. JFIF, VP8X, the IFD pointers and the image chunks are
 * structure. GPS reads four tags and reports one position. So a browser that writes an ICC
 * profile on export honestly shows "1 field".
 */

export type FieldKey =
  | 'gps'
  | 'make'
  | 'model'
  | 'serial'
  | 'lensMake'
  | 'lensModel'
  | 'lensSerial'
  | 'makerNote'
  | 'orientation'
  | 'software'
  | 'owner'
  | 'artist'
  | 'copyright'
  | 'taken'
  | 'digitised'
  | 'modified'
  | 'pngTime'
  | 'xmp'
  | 'icc'
  | 'iptc'
  | 'comment'
  | 'text'

export interface MetaField {
  key: FieldKey
  /** What the file says, stripped and capped. Empty for a block that is only present. */
  value: string
  /** The file's own name for the field: a PNG text chunk's keyword. As untrusted as `value`. */
  name?: string
  /** The size of a block the inspector does not decode: a maker note, compressed PNG text. */
  bytes?: number
}

export type Container = 'jpeg' | 'png' | 'webp'

/** Formats a browser may decode but the inspector does not read. Never reported as clean. */
export type Unreadable = 'heic' | 'avif' | 'gif'

export interface Inspected {
  format: Container
  /** Everything the inspector names, in the order it was read. */
  fields: MetaField[]
  /** Fields counted but not listed: tags it doesn't name, text past the list's cap. */
  more: number
  /** `fields.length + more`: what "N fields" means. */
  count: number
  /** Set by `inspectFile` when only the first `MAX_FILE_BYTES` were read. */
  truncated?: boolean
}

export interface Uninspected {
  format: 'unsupported'
  /** What the file looks like, when it is one of the formats named; `null` otherwise. */
  detected: Unreadable | null
}

export type MetaReport = Inspected | Uninspected

export const MAX_VALUE_CHARS = 120
export const MAX_IFD_ENTRIES = 512
/** PNG text chunks and JPEG comments listed; past this they are counted in `more`. Everything
 *  else is bounded by the tag table, so a position is never pushed off the list. */
export const MAX_TEXT_FIELDS = 32
/** WebP's extended format puts Exif and XMP after the image data, and PNG text may follow
 *  IDAT, so the whole file is read rather than its head. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024
/** The most bytes read for one value: a capped value needs no more, whatever it declares. */
const MAX_VALUE_BYTES = 1024

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

class View {
  private readonly data: DataView

  constructor(readonly bytes: Uint8Array) {
    this.data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get length(): number {
    return this.bytes.length
  }

  has(at: number, size: number): boolean {
    return at >= 0 && size >= 0 && at + size <= this.bytes.length
  }

  u8(at: number): number | null {
    return this.has(at, 1) ? this.data.getUint8(at) : null
  }

  u16(at: number, le: boolean): number | null {
    return this.has(at, 2) ? this.data.getUint16(at, le) : null
  }

  u32(at: number, le: boolean): number | null {
    return this.has(at, 4) ? this.data.getUint32(at, le) : null
  }

  /** From `at` for up to `size` bytes, clamped to what there is: containers are walked as
   *  far as they go. */
  sub(at: number, size: number): View | null {
    return this.has(at, 0) ? new View(this.bytes.subarray(at, Math.min(this.bytes.length, at + size))) : null
  }

  /** All `size` bytes from `at`, or nothing: a value is reported whole or not at all. At most
   *  `limit` of them are handed over. */
  whole(at: number, size: number, limit = MAX_VALUE_BYTES): Uint8Array | null {
    return this.has(at, size) ? this.bytes.subarray(at, at + Math.min(size, limit)) : null
  }

  /** Whether the bytes at `at` spell `signature`, one byte per character. */
  is(at: number, signature: string): boolean {
    if (!this.has(at, signature.length)) return false
    for (let i = 0; i < signature.length; i++) {
      if (this.bytes[at + i] !== signature.charCodeAt(i)) return false
    }
    return true
  }

  /** Four bytes as text, the way PNG and RIFF name their chunks. */
  fourcc(at: number): string | null {
    return this.has(at, 4) ? latin1(this.bytes.subarray(at, at + 4)) : null
  }

  /** The offset of the first NUL in `at … at + limit`. */
  nul(at: number, limit: number): number | null {
    const end = Math.min(this.bytes.length, at + limit)
    for (let i = Math.max(0, at); i < end; i++) if (this.bytes[i] === 0) return i
    return null
  }
}

const utf8 = new TextDecoder()

/** Callers hand over at most `MAX_VALUE_BYTES` + a keyword, so the spread is bounded. */
function latin1(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}

// C0 and C1 controls, plus the bidirectional marks, overrides and isolates: a value carrying
// U+202E would otherwise reverse whatever the page draws after it.
const UNPRINTABLE = /[\p{Cc}؜‎‏‪-‮⁦-⁩]+/gu

/** Control characters to spaces, whitespace collapsed, then at most `MAX_VALUE_CHARS`. */
export function clean(text: string): string {
  const flat = text.replace(UNPRINTABLE, ' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length > MAX_VALUE_CHARS ? `${chars.slice(0, MAX_VALUE_CHARS - 1).join('')}…` : flat
}

// ---------------------------------------------------------------------------
// The report as it fills
// ---------------------------------------------------------------------------

class Collector {
  readonly fields: MetaField[] = []
  more = 0
  /** Only the first Exif block is walked; a file with two is malformed, and the first is the
   *  one every reader honours. */
  exif = false
  private texts = 0
  private readonly once = new Set<FieldKey>()

  add(field: MetaField): void {
    this.fields.push(field)
  }

  /** A PNG text chunk or a JPEG comment: a file may hold any number of them. */
  text(field: MetaField): void {
    if (this.texts++ < MAX_TEXT_FIELDS) this.fields.push(field)
    else this.more++
  }

  /** XMP, ICC, IPTC and the PNG time count once however many segments carry them: an ICC
   *  profile split across six APP2s is one profile. */
  block(key: FieldKey, value = ''): void {
    if (this.once.has(key)) return
    this.once.add(key)
    this.fields.push({ key, value })
  }

  report(format: Container): Inspected {
    return { format, fields: this.fields, more: this.more, count: this.fields.length + this.more }
  }
}

// ---------------------------------------------------------------------------
// TIFF: the structure inside every Exif block
// ---------------------------------------------------------------------------

/** TIFF 6.0 §2: bytes per value of each field type, plus Exif 3.0's UTF-8 (129). */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 129: 1 }
const SHORT = 3
const RATIONAL = 5

type Ifd = 'ifd0' | 'exif' | 'gps'

/** CIPA DC-008 §4.6.3: the pointers from IFD0 to the Exif and GPS IFDs. Structure, so neither
 *  counts, and nor does the Exif IFD's Interoperability pointer, which is not followed. */
const POINTERS: Record<number, Ifd> = { 0x8769: 'exif', 0x8825: 'gps' }
const INTEROP_POINTER = 0xa005

/** Text tags, by number. Make (271), Model (272), Software (305), DateTime (306), Artist (315)
 *  and Copyright (33432) are TIFF 6.0 §8; the rest are the Exif IFD's, CIPA DC-008 §4.6.5. */
const TEXT_TAGS: Record<number, FieldKey> = {
  0x010f: 'make',
  0x0110: 'model',
  0x0131: 'software',
  // "The date and time the file was changed", in Exif's reading of TIFF's creation date.
  0x0132: 'modified',
  0x013b: 'artist',
  0x8298: 'copyright',
  0x9003: 'taken', // DateTimeOriginal
  0x9004: 'digitised', // DateTimeDigitized
  0xa430: 'owner', // CameraOwnerName
  0xa431: 'serial', // BodySerialNumber
  0xa433: 'lensMake',
  0xa434: 'lensModel',
  0xa435: 'lensSerial',
}
/** TIFF 6.0 §8: one SHORT, 1–8, saying which way up the stored rows are. */
const ORIENTATION = 0x0112
/** CIPA DC-008 §4.6.5: UNDEFINED, in the maker's own undocumented format. Present or not. */
const MAKER_NOTE = 0x927c
/** CIPA DC-008 §4.6.6: the hemisphere refs (ASCII, `N`/`S`, `E`/`W`) and the coordinates
 *  (three RATIONALs: degrees, minutes, seconds). */
const GPS = { latitudeRef: 1, latitude: 2, longitudeRef: 3, longitude: 4 } as const
const GPS_TAGS: number[] = Object.values(GPS)

const DATES = new Set<FieldKey>(['taken', 'digitised', 'modified'])

interface Entry {
  ifd: Ifd
  tag: number
  type: number
  count: number
  /** Offset of the entry's four-byte value field. */
  field: number
}

function readTiff(view: View, out: Collector): void {
  if (out.exif) return
  const mark = view.u16(0, false)
  const le = mark === 0x4949 ? true : mark === 0x4d4d ? false : null
  if (le === null || view.u16(2, le) !== 42) return
  const first = view.u32(4, le)
  if (first === null) return
  out.exif = true

  // A queue rather than recursion, with two guards against a file that points in circles:
  // each offset is walked once, and each kind of IFD once, so at most three are read.
  const queue: Array<[Ifd, number]> = [['ifd0', first]]
  const visited = new Set<number>()
  const walked = new Set<Ifd>()
  const entries: Entry[] = []
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [ifd, offset] = next
    if (visited.has(offset) || walked.has(ifd)) continue
    visited.add(offset)
    walked.add(ifd)
    const count = view.u16(offset, le)
    if (count === null) continue
    for (let i = 0; i < Math.min(count, MAX_IFD_ENTRIES); i++) {
      const at = offset + 2 + 12 * i
      const tag = view.u16(at, le)
      const type = view.u16(at + 2, le)
      const n = view.u32(at + 4, le)
      const value = view.u32(at + 8, le)
      if (tag === null || type === null || n === null || value === null) break
      const target = POINTERS[tag]
      if (target) queue.push([target, value])
      else if (tag !== INTEROP_POINTER) entries.push({ ifd, tag, type, count: n, field: at + 8 })
    }
  }

  const gps = new Map<number, Entry>()
  for (const entry of entries) {
    if (entry.ifd === 'gps') {
      if (GPS_TAGS.includes(entry.tag) && !gps.has(entry.tag)) gps.set(entry.tag, entry)
      else out.more++
      continue
    }
    const field = nameEntry(view, entry, le)
    if (field) out.add(field)
    else out.more++
  }
  const position = gpsPosition(view, gps, le)
  if (position) out.add({ key: 'gps', value: position })
  else out.more += gps.size
}

/** Where an entry's value starts: in the entry when it fits in four bytes, else at the offset
 *  the entry holds, counted from the TIFF header. */
function locate(view: View, entry: Entry, le: boolean): number | null {
  const size = TYPE_SIZE[entry.type]
  if (size === undefined) return null
  return size * entry.count <= 4 ? entry.field : view.u32(entry.field, le)
}

function valueBytes(view: View, entry: Entry, le: boolean): Uint8Array | null {
  const size = TYPE_SIZE[entry.type]
  const at = locate(view, entry, le)
  return size === undefined || at === null ? null : view.whole(at, size * entry.count)
}

function nameEntry(view: View, entry: Entry, le: boolean): MetaField | null {
  const key = TEXT_TAGS[entry.tag]
  if (key) {
    const bytes = TYPE_SIZE[entry.type] === 1 ? valueBytes(view, entry, le) : null
    if (!bytes) return null
    // ASCII ends in NUL, and TIFF 6.0 lets one field hold several NUL-separated strings
    // (Copyright's photographer, then its editor).
    const parts = utf8.decode(bytes).split('\0').filter((part) => part.trim())
    const value = clean(parts.join(' / '))
    if (!value) return null
    return { key, value: DATES.has(key) ? value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : value }
  }
  if (entry.tag === ORIENTATION && entry.type === SHORT && entry.count === 1) {
    const value = view.u16(entry.field, le)
    return value !== null && value >= 1 && value <= 8 ? { key: 'orientation', value: String(value) } : null
  }
  if (entry.tag === MAKER_NOTE) return { key: 'makerNote', value: '', bytes: entry.count * (TYPE_SIZE[entry.type] ?? 1) }
  return null
}

function coordinate(view: View, ref: Entry | undefined, value: Entry | undefined, le: boolean, hemispheres: string): number | null {
  if (!ref || !value || value.type !== RATIONAL || value.count !== 3) return null
  const sign = [1, -1][hemispheres.indexOf(String.fromCharCode(valueBytes(view, ref, le)?.[0] ?? 0))]
  const at = locate(view, value, le)
  if (sign === undefined || at === null || !view.has(at, 24)) return null
  let degrees = 0
  for (let i = 0; i < 3; i++) {
    const numerator = view.u32(at + 8 * i, le) ?? 0
    const denominator = view.u32(at + 8 * i + 4, le) ?? 0
    if (denominator === 0) return null
    degrees += numerator / denominator / 60 ** i
  }
  return sign * degrees
}

/** Signed decimal degrees to 5 dp, about a metre: the four tags, all whole, or nothing. */
function gpsPosition(view: View, gps: Map<number, Entry>, le: boolean): string | null {
  const latitude = coordinate(view, gps.get(GPS.latitudeRef), gps.get(GPS.latitude), le, 'NS')
  const longitude = coordinate(view, gps.get(GPS.longitudeRef), gps.get(GPS.longitude), le, 'EW')
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

// ---------------------------------------------------------------------------
// The containers
// ---------------------------------------------------------------------------

const XMP = 'http://ns.adobe.com/xap/1.0/\0'
const XMP_EXTENSION = 'http://ns.adobe.com/xmp/extension/\0'
const PHOTOSHOP = 'Photoshop 3.0\0'
/** Photoshop's image resource holding the IPTC-NAA record. */
const IPTC_RESOURCE = 0x0404

/** T.81 B.1: markers, each optionally preceded by `FF` fill, up to SOS, after which only
 *  entropy-coded data and EOI follow, so nothing a camera writes is left unread. */
function readJpeg(view: View, out: Collector): void {
  for (let at = 2; ; ) {
    if (view.u8(at) !== 0xff) return
    while (view.u8(at + 1) === 0xff) at++
    const marker = view.u8(at + 1)
    at += 2
    if (marker === null || marker === 0xda || marker === 0xd9) return
    // TEM and RST carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = view.u16(at, false)
    if (length === null || length < 2) return
    const payload = view.sub(at + 2, length - 2)
    if (payload) readSegment(marker, payload, length - 2, out)
    at += length
  }
}

function readSegment(marker: number, payload: View, declared: number, out: Collector): void {
  // APP0 is JFIF (or its JFXX extension): density and version, structure.
  if (marker === 0xe1) {
    if (payload.is(0, 'Exif\0')) readTiff(payload.sub(6, payload.length) ?? payload, out)
    else if (payload.is(0, XMP) || payload.is(0, XMP_EXTENSION)) out.block('xmp')
  } else if (marker === 0xe2 && payload.is(0, 'ICC_PROFILE\0')) {
    out.block('icc')
  } else if (marker === 0xed && payload.is(0, PHOTOSHOP)) {
    readPhotoshop(payload, out)
  } else if (marker === 0xfe) {
    const bytes = payload.whole(0, declared)
    if (!bytes) return
    const value = clean(utf8.decode(bytes))
    if (value) out.text({ key: 'comment', value })
    else out.more++
  }
}

/** Image resources: `8BIM`, a 16-bit id, a Pascal name padded to even, a 32-bit size, the
 *  data padded to even. IPTC is resource 0x0404. */
function readPhotoshop(view: View, out: Collector): void {
  let at = PHOTOSHOP.length
  for (let i = 0; i < 1024 && view.is(at, '8BIM'); i++) {
    const id = view.u16(at + 4, false)
    const nameLength = view.u8(at + 6)
    if (id === null || nameLength === null) return
    if (id === IPTC_RESOURCE) return out.block('iptc')
    const sizeAt = at + 6 + ((nameLength + 2) & ~1)
    const size = view.u32(sizeAt, false)
    if (size === null) return
    at = sizeAt + 4 + size + (size & 1)
  }
}

/** PNG §5.3: length, type, data, CRC, until IEND. Text and time may sit anywhere, IDAT
 *  included, so the walk runs to the end. */
function readPng(view: View, out: Collector): void {
  for (let at = 8; view.has(at, 8); ) {
    const length = view.u32(at, false) ?? 0
    const type = view.fourcc(at + 4)
    if (type === 'IEND') return
    const data = view.sub(at + 8, length)
    const complete = view.has(at + 8, length)
    if (data) {
      if (type === 'eXIf') readTiff(data, out)
      else if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') readPngText(type, data, complete, out)
      else if (type === 'iCCP') {
        // The profile's name, Latin-1, then NUL; the profile itself is compressed.
        const end = data.nul(0, 80)
        if (end !== null) out.block('icc', clean(latin1(data.bytes.subarray(0, end))))
      } else if (type === 'tIME' && complete && length === 7) {
        // Seven numbers, so nothing from the file reaches the string but digits.
        const pad = (n: number | null, width = 2) => String(n ?? 0).padStart(width, '0')
        const date = `${pad(data.u16(0, false), 4)}-${pad(data.u8(2))}-${pad(data.u8(3))}`
        out.block('pngTime', `${date} ${pad(data.u8(4))}:${pad(data.u8(5))}:${pad(data.u8(6))} UTC`)
      }
    }
    at += 12 + length
  }
}

/** PNG §11.3, textual information: a 1–79 byte Latin-1 keyword and a NUL, then the text:
 *  Latin-1 for tEXt, compressed for zTXt, and for iTXt two flags, a language, a translated
 *  keyword, then UTF-8, compressed or not. XMP travels as iTXt under its own keyword. */
function readPngText(type: string, data: View, complete: boolean, out: Collector): void {
  const end = data.nul(0, 80)
  if (end === null) {
    out.more++
    return
  }
  const keyword = clean(latin1(data.bytes.subarray(0, end)))
  if (type === 'iTXt' && keyword === 'XML:com.adobe.xmp') return out.block('xmp')
  if (!complete) return
  const rest = data.bytes.subarray(end + 1)
  if (type === 'tEXt') return out.text({ key: 'text', name: keyword, value: clean(latin1(rest.subarray(0, MAX_VALUE_BYTES))) })
  if (type === 'zTXt') return out.text({ key: 'text', name: keyword, value: '', bytes: Math.max(0, rest.length - 1) })
  const compressed = data.u8(end + 1)
  const language = data.nul(end + 3, data.length)
  const translated = language === null ? null : data.nul(language + 1, data.length)
  if (compressed === null || translated === null) {
    out.more++
    return
  }
  const text = data.bytes.subarray(translated + 1)
  if (compressed === 0) out.text({ key: 'text', name: keyword, value: clean(utf8.decode(text.subarray(0, MAX_VALUE_BYTES))) })
  else out.text({ key: 'text', name: keyword, value: '', bytes: text.length })
}

/** RFC 9649: `RIFF`, a size, `WEBP`, then FourCC + little-endian size + data, padded to even.
 *  The extended format's EXIF and XMP chunks come after the image data. VP8X only flags that
 *  they exist, so it is structure, like the image chunks. */
function readWebp(view: View, out: Collector): void {
  for (let at = 12; view.has(at, 8); ) {
    const fourcc = view.fourcc(at)
    const size = view.u32(at + 4, true) ?? 0
    const data = view.sub(at + 8, size)
    if (data) {
      // Some writers keep the JPEG `Exif\0\0` prefix the format dropped.
      if (fourcc === 'EXIF') readTiff(data.is(0, 'Exif\0') ? (data.sub(6, data.length) ?? data) : data, out)
      else if (fourcc === 'XMP ') out.block('xmp')
      else if (fourcc === 'ICCP') out.block('icc')
    }
    at += 8 + size + (size & 1)
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'])

/** ISO BMFF opens with `ftyp`: a major brand, a minor version, then compatible brands. */
function bmffBrand(view: View): Unreadable | null {
  const size = view.u32(0, false) ?? 0
  const end = Math.min(view.length, 16 + 4 * 32, size >= 16 ? size : Infinity)
  const brands: string[] = []
  for (let at = 8; at + 4 <= end; at += 4) if (at !== 12) brands.push(view.fourcc(at) ?? '')
  if (brands.includes('avif') || brands.includes('avis')) return 'avif'
  return brands.some((brand) => HEIF_BRANDS.has(brand)) ? 'heic' : null
}

const READERS: Record<Container, (view: View, out: Collector) => void> = {
  jpeg: readJpeg,
  png: readPng,
  webp: readWebp,
}

/**
 * Reads what a file gives away. Never throws, whatever the bytes: not because of a catch, which
 * would hide a bounds bug from the specs that slice and fuzz it, but because nothing in it can.
 */
export function inspectBytes(bytes: Uint8Array): MetaReport {
  const view = new View(bytes)
  let format: Container
  if (view.u8(0) === 0xff && view.u8(1) === 0xd8) format = 'jpeg'
  else if (view.is(0, '\x89PNG\r\n\x1a\n')) format = 'png'
  else if (view.is(0, 'RIFF') && view.is(8, 'WEBP')) format = 'webp'
  else if (view.is(0, 'GIF8')) return { format: 'unsupported', detected: 'gif' }
  else return { format: 'unsupported', detected: view.is(4, 'ftyp') ? bmffBrand(view) : null }

  const out = new Collector()
  READERS[format](view, out)
  return out.report(format)
}

/**
 * Reads a file into memory, up to `MAX_FILE_BYTES`, and inspects it. Never rejects: a file
 * that can't be read, or a bug `inspectBytes` should not have, reads as one the inspector
 * can't vouch for, which is the honest answer to either.
 */
export async function inspectFile(blob: Blob): Promise<MetaReport> {
  try {
    const truncated = blob.size > MAX_FILE_BYTES
    const bytes = new Uint8Array(await (truncated ? blob.slice(0, MAX_FILE_BYTES) : blob).arrayBuffer())
    const report = inspectBytes(bytes)
    return truncated && report.format !== 'unsupported' ? { ...report, truncated } : report
  } catch {
    return { format: 'unsupported', detected: null }
  }
}

// ---------------------------------------------------------------------------
// Presentation order
// ---------------------------------------------------------------------------

export type FieldGroup = 'where' | 'device' | 'people' | 'time' | 'embedded'

const GROUP: Record<FieldKey, FieldGroup> = {
  gps: 'where',
  make: 'device',
  model: 'device',
  serial: 'device',
  lensMake: 'device',
  lensModel: 'device',
  lensSerial: 'device',
  makerNote: 'device',
  orientation: 'device',
  software: 'device',
  owner: 'people',
  artist: 'people',
  copyright: 'people',
  taken: 'time',
  digitised: 'time',
  modified: 'time',
  pngTime: 'time',
  xmp: 'embedded',
  icc: 'embedded',
  iptc: 'embedded',
  comment: 'embedded',
  text: 'embedded',
}

const GROUPS: FieldGroup[] = ['where', 'device', 'people', 'time', 'embedded']

/** The fields in the order the list shows them, the position first, empty groups dropped. */
export function groupFields(fields: readonly MetaField[]): Array<{ group: FieldGroup; fields: MetaField[] }> {
  return GROUPS.map((group) => ({ group, fields: fields.filter((field) => GROUP[field.key] === group) })).filter(
    (entry) => entry.fields.length > 0,
  )
}
