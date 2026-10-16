/**
 * What x-ray's data lines would lose when the browser's Resource Timing buffer is emptied
 * (`main.ts`). The browser keeps 250 entries and then drops new ones, and a poll fills
 * that on a long visit, so the buffer is cleared when full; but a route fetched once a
 * visit (`/steam/activity`) would then have no timing left by the time x-ray opened.
 * So the newest entry per API route is kept here first, in memory, and `XrayLayer` reads
 * these before the buffer (review of #160). Eager, since it has to be there before the
 * first clear: kept to a handful of lines, with the reading of the entries left to
 * `lib/xray-data.ts`, which loads with the layer.
 */

/** More routes than the API has; a bound all the same, against a URL that varies. */
const MAX_KEPT = 32

const kept = new Map<string, PerformanceEntry>()

/** Keeps the newest entry of each route under `base`, then empties the buffer. */
export function keepAndClear(base: string): void {
  for (const entry of performance.getEntriesByType('resource')) {
    if (!base || !entry.name.startsWith(`${base}/`)) continue
    const route = entry.name.split(/[?#]/)[0]!
    // Entries come in start order, so the last one seen is the newest: moved to the end.
    kept.delete(route)
    kept.set(route, entry)
    if (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!)
  }
  performance.clearResourceTimings()
}

export function keptTimings(): PerformanceEntry[] {
  return [...kept.values()]
}
