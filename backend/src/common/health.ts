/**
 * What `GET /health` reports for one module, and what each service's `health()`
 * returns. The rule every implementation follows: **read only what the service
 * already holds** — its configuration, its flags, the age of the cache it already
 * keeps. No probe, no upstream call, so asking for the health of `steam` never calls
 * Steam on a visitor's behalf, and asking for `ask` never wakes the model.
 */
export type UnitState = 'active' | 'inactive';

/** Why a unit is inactive, as a word the terminal can put into either language. */
export type InactiveReason = 'unconfigured' | 'disabled' | 'missing-binary';

export interface UnitHealth {
  /** The module's name: `steam`, `rooms` — shown as `steam.service`. */
  unit: string;
  state: UnitState;
  reason?: InactiveReason;
  /**
   * Milliseconds since the service last fetched its upstream, for the ones that cache
   * one; `null` when it has not fetched since the process started.
   */
  cacheAge?: number | null;
  /** A count the service already keeps: visitors online, rooms open, jobs known. */
  detail?: Record<string, number>;
}

export interface HealthReport {
  /** Seconds since this process started. */
  uptime: number;
  units: UnitHealth[];
}

/** Age of a cache entry that stores only its expiry, given the TTL it was set with. */
export function cacheAge(
  entry: { expiresAt: number } | null | undefined,
  ttlMs: number,
  now = Date.now(),
): number | null {
  return entry ? Math.max(0, now - (entry.expiresAt - ttlMs)) : null;
}
