/** Types for `stems-lib.mjs`, so its spec type-checks with the rest of the suite. */

export interface Probe {
  file: string
  sampleRate: number
  duration: number
}

export interface TrackJson {
  id: string
  title: string
  start?: string | number
  seconds: number
  bpm?: number
  beatsPerBar?: number
  key?: string
  daw?: string
  released?: string
  url?: string
  note?: { en: string; fr: string }
  stems: Array<{ file: string; id: string; name: { en: string; fr: string }; chain?: string[] }>
}

export function parseTime(value: string | number): number
export function barsIn(seconds: number, bpm: number, beatsPerBar?: number): number
export function wholeBarWarning(seconds: number, bpm: number | undefined, beatsPerBar?: number): string | null
export function probeProblems(
  probes: Probe[],
  options: { maxStems: number; start?: number; seconds?: number },
): Array<[string, string]>
export function problemTable(problems: Array<[string, string]>): string
export function bucketPeaks(samples: ArrayLike<number>, points: number): Float32Array
export function normalisePeaks(peaksByStem: Record<string, ArrayLike<number>>): Record<string, Uint8Array>
export function peaksFile(
  bytesByStem: Record<string, Uint8Array>,
  points: number,
): { v: 1; points: number; stems: Record<string, string> }
export function trackLiteral(track: TrackJson, bytesByFile: Record<string, number>): string
