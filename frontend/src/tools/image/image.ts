/**
 * The image converter's maths. The component owns the canvas and the file; nothing
 * here touches either, so all of it runs in jsdom.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp'

export const FORMATS: ImageFormat[] = ['png', 'jpeg', 'webp']

export const MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/** PNG is lossless; the quality slider means nothing to it. */
export function isLossy(format: ImageFormat): boolean {
  return format !== 'png'
}

/** Scales a `width × height` image down to `maxWidth`, never up, keeping the ratio.
 *  `null` (or a non-positive number) means no limit. Never returns a zero side. */
export function fitWidth(
  width: number,
  height: number,
  maxWidth: number | null,
): { width: number; height: number } {
  if (!maxWidth || maxWidth <= 0 || width <= maxWidth) return { width, height }
  const scale = maxWidth / width
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** `holiday.HEIC` + webp → `holiday.webp`; a name with no extension just gains one. */
export function outputName(name: string, format: ImageFormat): string {
  const stem = name.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}.${format === 'jpeg' ? 'jpg' : format}`
}

/** `1 234 567` → `1.2 MB`. One decimal above a kilobyte, none below. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes
  let unit = -1
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unit]}`
}

/** How much smaller (or larger) the result came out, as a signed percentage. */
export function savings(before: number, after: number): number {
  if (before <= 0) return 0
  return Math.round(((before - after) / before) * 100)
}

/** Whether `canvas.toBlob` can actually produce `format` in this browser. Safari has
 *  no WebP encoder and silently hands back a PNG under the name you asked for, which
 *  is the one thing a converter must not do quietly. */
export function canEncode(format: ImageFormat, canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.toDataURL(MIME[format]).startsWith(`data:${MIME[format]}`)
  } catch {
    return false
  }
}
