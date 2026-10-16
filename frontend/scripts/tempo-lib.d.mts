/** Types for `tempo-lib.mjs`, so its spec type-checks with the rest of the suite. */

export interface DetectedTempo {
  bpm: number
  firstBeatMs: number
  /** The first beat had the offbeat been taken for the beat: the alternative to try by ear. */
  offbeatMs: number
  /** The beat grid's onsets over its offbeat's: several for a clear beat, near 1 for none. */
  confidence: number
}

export const ANALYSIS_RATE: number
export const FRAME_RATE: number
export const DEFAULT_RANGE: readonly [number, number]

export function onsets(samples: Float32Array): { all: Float32Array; low: Float32Array }
export function onsetEnvelope(samples: Float32Array): Float32Array
export function roughTempo(env: Float32Array, range?: readonly [number, number]): number
export function gridScore(env: Float32Array, bpm: number, phase: number): number
export function fitGrid(env: Float32Array, rough: number): { bpm: number; phase: number; score: number }
export function detectTempo(samples: Float32Array, range?: readonly [number, number]): DetectedTempo | null
export function parseRange(value: unknown): [number, number] | null
export function soundcloudPath(url: string): string | null
export function writeTempos(source: string, entries: Record<string, { bpm: number; firstBeatMs: number }>): string
