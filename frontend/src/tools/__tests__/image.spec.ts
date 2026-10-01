import { describe, expect, it } from 'vitest'
import { fitWidth, formatBytes, isLossy, outputName, savings } from '../image/image'
import {
  MAX_FILE_BYTES,
  MAX_IFD_ENTRIES,
  MAX_TEXT_FIELDS,
  MAX_VALUE_CHARS,
  clean,
  groupFields,
  inspectBytes,
  inspectFile,
  type Inspected,
  type MetaReport,
} from '../image/metadata'
import {
  LONDON,
  TAG,
  ascii,
  bytes,
  chunk,
  comment,
  concat,
  exif,
  ftyp,
  gif,
  icc,
  iptc,
  jfif,
  jpeg,
  long,
  opaque,
  png,
  rational,
  riff,
  short,
  tiff,
  vp8x,
  webp,
  xmp,
  type ByteOrder,
} from './fixtures/exif'

describe('image converter maths', () => {
  it('scales down to a maximum width, never up, keeping the ratio', () => {
    expect(fitWidth(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWidth(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWidth(800, 600, null)).toEqual({ width: 800, height: 600 })
    expect(fitWidth(800, 600, 0)).toEqual({ width: 800, height: 600 })
  })

  it('never produces a zero side', () => {
    expect(fitWidth(10000, 1, 10)).toEqual({ width: 10, height: 1 })
  })

  it('renames the file after the format it actually got', () => {
    expect(outputName('holiday.HEIC', 'webp')).toBe('holiday.webp')
    expect(outputName('shot.png', 'jpeg')).toBe('shot.jpg')
    expect(outputName('noext', 'png')).toBe('noext.png')
    expect(outputName('.png', 'png')).toBe('image.png')
  })

  it('knows the quality slider means nothing to PNG', () => {
    expect(isLossy('png')).toBe(false)
    expect(isLossy('jpeg')).toBe(true)
    expect(isLossy('webp')).toBe(true)
  })

  it('prints sizes people can read', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1_234)).toBe('1.23 kB')
    expect(formatBytes(84_000)).toBe('84.0 kB')
    expect(formatBytes(1_234_567)).toBe('1.23 MB')
  })

  it('reports savings as a signed percentage', () => {
    expect(savings(1000, 250)).toBe(75)
    expect(savings(1000, 1500)).toBe(-50)
    expect(savings(0, 10)).toBe(0)
  })
})

function inspected(report: MetaReport): Inspected {
  if (report.format === 'unsupported') throw new Error(`expected a format the inspector reads, got ${report.detected}`)
  return report
}

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

/** A camera's worth of Exif, in either byte order. */
function camera(order: ByteOrder): Uint8Array {
  return jpeg(
    jfif(),
    exif(
      tiff(order, {
        ifd0: [
          ascii(TAG.make, 'Canon'),
          ascii(TAG.model, 'Canon EOS R6'),
          short(TAG.orientation, 6),
          ascii(TAG.software, 'Firmware 1.8.1'),
          ascii(TAG.dateTime, '2026:09:30 14:03:11'),
          ascii(TAG.artist, 'Jules'),
          ascii(TAG.copyright, 'Jules\0Darkroom'),
        ],
        exif: [
          rational(TAG.exposureTime, [1, 250]),
          ascii(TAG.dateTimeOriginal, '2026:09:30 14:03:11'),
          opaque(TAG.makerNote, new Array<number>(40).fill(7)),
          ascii(TAG.bodySerial, '032021001234'),
          ascii(TAG.lensModel, 'RF24-105mm F4 L IS USM'),
        ],
        gps: LONDON.entries,
      }),
    ),
  )
}

/** The fixture the partial-read spec slices: one Make, one position, nothing else. */
const makeAndGps = jpeg(jfif(), exif(tiff('MM', { ifd0: [ascii(TAG.make, 'Canon')], gps: LONDON.entries })))

describe('the metadata inspector', () => {
  it.each(['II', 'MM'] as const)('reads a camera JPEG in %s byte order', (order) => {
    const report = inspected(inspectBytes(camera(order)))
    expect(report.format).toBe('jpeg')
    expect(report.fields).toEqual([
      { key: 'make', value: 'Canon' },
      { key: 'model', value: 'Canon EOS R6' },
      { key: 'orientation', value: '6' },
      { key: 'software', value: 'Firmware 1.8.1' },
      { key: 'modified', value: '2026-09-30 14:03:11' },
      { key: 'artist', value: 'Jules' },
      // TIFF 6.0 lets Copyright hold the photographer, then the editor.
      { key: 'copyright', value: 'Jules / Darkroom' },
      { key: 'taken', value: '2026-09-30 14:03:11' },
      { key: 'makerNote', value: '', bytes: 40 },
      { key: 'serial', value: '032021001234' },
      { key: 'lensModel', value: 'RF24-105mm F4 L IS USM' },
      { key: 'gps', value: LONDON.value },
    ])
    // ExposureTime and GPSVersionID: counted, not named. The IFD pointers are structure.
    expect(report.more).toBe(2)
    expect(report.count).toBe(14)
  })

  it('reads the orientation a phone held on its side writes', () => {
    const report = inspected(inspectBytes(jpeg(exif(tiff('II', { ifd0: [short(TAG.orientation, 6)] })))))
    expect(report.fields).toEqual([{ key: 'orientation', value: '6' }])
    // Outside TIFF 6.0's 1–8 it is still a tag, just not one worth naming.
    expect(inspected(inspectBytes(jpeg(exif(tiff('II', { ifd0: [short(TAG.orientation, 9)] })))))).toMatchObject({
      fields: [],
      count: 1,
    })
  })

  it('signs GPS by hemisphere, and shows no position without both refs', () => {
    const sydney = [
      ascii(TAG.gpsLatitudeRef, 'S'),
      rational(TAG.gpsLatitude, [33, 1], [51, 1], [24408, 1000]),
      ascii(TAG.gpsLongitudeRef, 'E'),
      rational(TAG.gpsLongitude, [151, 1], [12, 1], [5508, 100]),
    ]
    const at = (gps: typeof sydney) => inspected(inspectBytes(jpeg(exif(tiff('II', { ifd0: [], gps })))))
    expect(at(sydney).fields).toEqual([{ key: 'gps', value: '-33.85678, 151.21530' }])
    // Without its ref the latitude's sign would be a guess: the tags count, no position shows.
    expect(at(sydney.slice(1))).toMatchObject({ fields: [], count: 3 })
  })

  it('counts nothing in a JPEG that carries only JFIF', () => {
    expect(inspectBytes(jpeg(jfif()))).toEqual({ format: 'jpeg', fields: [], more: 0, count: 0 })
  })

  it("counts a JPEG's XMP, ICC, IPTC and comments, each block once", () => {
    const report = inspected(
      inspectBytes(jpeg(jfif(), xmp('<x:xmpmeta/>'), icc(1, 2), icc(2, 2), iptc(), comment('Shot on a Tuesday'))),
    )
    expect(report.fields).toEqual([
      { key: 'xmp', value: '' },
      // Split across two APP2s, it is still one profile.
      { key: 'icc', value: '' },
      { key: 'iptc', value: '' },
      { key: 'comment', value: 'Shot on a Tuesday' },
    ])
    expect(report.count).toBe(4)
  })

  it('finds PNG text, time and Exif after IDAT', () => {
    const report = inspected(
      inspectBytes(
        png(
          chunk('iCCP', concat(bytes('Display P3\0\0'), [0x78, 0x9c])),
          // Past the 256 kB a head-only read would have stopped at.
          chunk('IDAT', new Uint8Array(300_000)),
          chunk('tEXt', bytes('Author\0Jules H\xe9mery')),
          chunk('zTXt', concat(bytes('Comment\0\0'), [1, 2, 3, 4])),
          chunk('iTXt', concat(bytes('XML:com.adobe.xmp\0\0\0\0\0'), bytes('<x:xmpmeta/>'))),
          chunk('iTXt', concat(bytes('Title\0\0\0fr\0Titre\0'), new TextEncoder().encode('Été'))),
          chunk('tIME', [0x07, 0xea, 9, 30, 14, 3, 11]),
          chunk('eXIf', tiff('II', { ifd0: [ascii(TAG.make, 'Apple')] })),
        ),
      ),
    )
    expect(report.fields).toEqual([
      { key: 'icc', value: 'Display P3' },
      { key: 'text', name: 'Author', value: 'Jules Hémery' },
      { key: 'text', name: 'Comment', value: '', bytes: 4 },
      { key: 'xmp', value: '' },
      { key: 'text', name: 'Title', value: 'Été' },
      { key: 'pngTime', value: '2026-09-30 14:03:11 UTC' },
      { key: 'make', value: 'Apple' },
    ])
    expect(report.count).toBe(7)
  })

  it.each([false, true])('finds WebP Exif after a large image chunk (JPEG prefix: %s)', (prefixed) => {
    const block = tiff('MM', { ifd0: [ascii(TAG.make, 'Google'), ascii(TAG.model, 'Pixel 9')] })
    const report = inspected(
      inspectBytes(
        webp(
          vp8x(0x08 | 0x04 | 0x20),
          riff('ICCP', new Uint8Array(64)),
          // An odd size, so the next chunk starts past a pad byte.
          riff('VP8 ', new Uint8Array(300_001)),
          riff('EXIF', prefixed ? concat(bytes('Exif\0\0'), block) : block),
          riff('XMP ', bytes('<x:xmpmeta/>')),
        ),
      ),
    )
    expect(report.fields).toEqual([
      { key: 'icc', value: '' },
      { key: 'make', value: 'Google' },
      { key: 'model', value: 'Pixel 9' },
      { key: 'xmp', value: '' },
    ])
  })

  it('reports HEIC, AVIF and GIF as unsupported, never as 0 fields', () => {
    expect(inspectBytes(ftyp('heic', 'mif1', 'heic'))).toEqual({ format: 'unsupported', detected: 'heic' })
    expect(inspectBytes(ftyp('avif', 'avif', 'mif1', 'miaf'))).toEqual({ format: 'unsupported', detected: 'avif' })
    // AVIF under the generic HEIF brand is still AVIF.
    expect(inspectBytes(ftyp('mif1', 'mif1', 'avif'))).toEqual({ format: 'unsupported', detected: 'avif' })
    expect(inspectBytes(gif())).toEqual({ format: 'unsupported', detected: 'gif' })
    expect(inspectBytes(bytes('BM\0\0\0\0'))).toEqual({ format: 'unsupported', detected: null })
    expect(inspectBytes(new Uint8Array())).toEqual({ format: 'unsupported', detected: null })
  })

  it('walks a cyclic IFD once', () => {
    // Both pointers aim at IFD0 itself, at offset 8.
    const self = inspected(
      inspectBytes(jpeg(exif(tiff('II', { ifd0: [ascii(TAG.make, 'Canon'), long(TAG.exifIfd, 8), long(TAG.gpsIfd, 8)] })))),
    )
    expect(self.fields).toEqual([{ key: 'make', value: 'Canon' }])
    expect(self.count).toBe(1)

    // The Exif IFD (at 38: 8 + 2 + 2 × 12 + 4) points back at IFD0 and at itself.
    const loop = inspected(
      inspectBytes(
        jpeg(exif(tiff('MM', { ifd0: [ascii(TAG.make, 'Canon')], exif: [long(TAG.exifIfd, 8), long(TAG.gpsIfd, 38)] }))),
      ),
    )
    expect(loop.fields).toEqual([{ key: 'make', value: 'Canon' }])
    expect(loop.count).toBe(1)
  })

  it('returns a partial result at every offset, never a throw', () => {
    const full = inspected(inspectBytes(makeAndGps))
    expect(full.fields.map((field) => field.key)).toEqual(['make', 'gps'])
    const makeEnd = indexOf(makeAndGps, bytes('Canon\0')) + 'Canon\0'.length
    expect(makeEnd).toBeGreaterThan(6)

    for (let end = 0; end <= makeAndGps.length; end++) {
      // `subarray`, not `slice`: the bytes past the cut stay in the buffer, so a read that
      // ignored the view's end would find them and fail here.
      const partial = inspectBytes(makeAndGps.subarray(0, end))
      const fields = partial.format === 'unsupported' ? [] : partial.fields
      for (const field of fields) expect(full.fields, `cut at ${end}`).toContainEqual(field)
      expect(
        fields.some((field) => field.key === 'make'),
        `cut at ${end}`,
      ).toBe(end >= makeEnd)
    }
  })

  it('reads a subset of every container at every offset', () => {
    const files = [
      png(
        chunk('iCCP', concat(bytes('sRGB\0\0'), [0x78])),
        chunk('tEXt', bytes('Author\0Jules')),
        chunk('iTXt', concat(bytes('XML:com.adobe.xmp\0\0\0\0\0'), bytes('<x/>'))),
        chunk('eXIf', tiff('II', { ifd0: [ascii(TAG.make, 'Apple'), short(TAG.orientation, 6)] })),
        chunk('tIME', [0x07, 0xea, 9, 30, 14, 3, 11]),
      ),
      webp(
        vp8x(0x2c),
        riff('ICCP', [1, 2, 3]),
        riff('VP8 ', [0, 0, 0]),
        riff('EXIF', tiff('MM', { ifd0: [ascii(TAG.software, 'GIMP 3.0')] })),
        riff('XMP ', bytes('<x/>')),
      ),
      jpeg(
        jfif(),
        xmp('<x/>'),
        icc(),
        iptc(),
        comment('hello'),
        exif(tiff('II', { ifd0: [ascii(TAG.artist, 'Jules')], gps: LONDON.entries })),
      ),
    ]
    for (const file of files) {
      const full = inspected(inspectBytes(file))
      expect(full.fields.length).toBeGreaterThanOrEqual(3)
      for (let end = 0; end <= file.length; end++) {
        const partial = inspectBytes(file.subarray(0, end))
        const fields = partial.format === 'unsupported' ? [] : partial.fields
        for (const field of fields) expect(full.fields, `${full.format} cut at ${end}`).toContainEqual(field)
      }
    }
  })

  it('never throws on noise behind a real signature', () => {
    // A fixed generator, so a failure is the same failure on the next run.
    let seed = 0x5eed
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed >>> 24
    }
    const heads = [
      bytes('\xff\xd8\xff\xe1'),
      bytes('\x89PNG\r\n\x1a\n'),
      bytes('RIFF\0\0\0\0WEBP'),
      bytes('\xff\xd8\xff\xe1\0\x40Exif\0\0MM\0*\0\0\0\x08'),
    ]
    for (let i = 0; i < 400; i++) {
      const file = concat(heads[i % heads.length]!, Uint8Array.from({ length: 64 + (i % 7) * 50 }, random))
      expect(() => inspectBytes(file), `run ${i}`).not.toThrow()
    }
  })

  describe('caps', () => {
    it('caps a value at 120 characters and strips control characters', () => {
      const long = inspected(inspectBytes(jpeg(exif(tiff('II', { ifd0: [ascii(TAG.make, 'A'.repeat(500))] })))))
      expect(Array.from(long.fields[0]!.value)).toHaveLength(MAX_VALUE_CHARS)
      expect(long.fields[0]!.value.endsWith('…')).toBe(true)

      // A bell, an escape sequence and a right-to-left override, which would reverse whatever
      // the page draws after the value.
      const sly = inspected(
        inspectBytes(jpeg(exif(tiff('MM', { ifd0: [ascii(TAG.artist, 'Jul\u0007es‮\u001b[31mred')] })))),
      )
      expect(sly.fields).toEqual([{ key: 'artist', value: 'Jul es [31mred' }])
      expect(clean('a⁦b‏c\u0085d')).toBe('a b c d')
    })

    it('reads at most 512 entries per IFD', () => {
      const entries = Array.from({ length: 600 }, (_, i) => short(0xc000 + i, 1))
      expect(inspected(inspectBytes(jpeg(exif(tiff('II', { ifd0: entries })))))).toMatchObject({
        fields: [],
        count: MAX_IFD_ENTRIES,
      })
    })

    it('never reads a value whose declared size runs past the file', () => {
      const liar = { ...ascii(TAG.make, 'Canon'), count: 0xffffffff }
      expect(inspected(inspectBytes(jpeg(exif(tiff('II', { ifd0: [liar] })))))).toMatchObject({ fields: [], count: 1 })
    })

    it('lists 32 text chunks and counts the rest', () => {
      const chunks = Array.from({ length: 40 }, (_, i) => chunk('tEXt', bytes(`k${i}\0v`)))
      const report = inspected(inspectBytes(png(...chunks)))
      expect(report.fields).toHaveLength(MAX_TEXT_FIELDS)
      expect(report).toMatchObject({ count: 40, more: 40 - MAX_TEXT_FIELDS })
    })

    it('reads a file whole, up to 64 MB', async () => {
      expect(await inspectFile(new Blob([makeAndGps]))).toEqual(inspectBytes(makeAndGps))

      const asked: number[] = []
      const huge = {
        size: MAX_FILE_BYTES + 1,
        slice: (start: number, end: number) => {
          asked.push(start, end)
          return new Blob([jpeg(jfif())])
        },
        arrayBuffer: () => Promise.reject(new Error('read past the cap')),
      } as unknown as Blob
      expect(await inspectFile(huge)).toMatchObject({ format: 'jpeg', count: 0, truncated: true })
      expect(asked).toEqual([0, MAX_FILE_BYTES])
    })

    it('never rejects, even when the file cannot be read', async () => {
      const gone = { size: 10, arrayBuffer: () => Promise.reject(new Error('NotReadableError')) } as unknown as Blob
      expect(await inspectFile(gone)).toEqual({ format: 'unsupported', detected: null })
    })
  })

  it('groups the fields with the position first', () => {
    const report = inspected(inspectBytes(camera('II')))
    expect(groupFields(report.fields).map((entry) => entry.group)).toEqual(['where', 'device', 'people', 'time'])
  })
})
