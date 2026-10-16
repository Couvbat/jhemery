import type { NextFunction, Request, Response } from 'express';

/**
 * Timing the frontend's x-ray layer may read (`docs/superpowers/specs/2026-10-15-xray-data-layer-design.md`).
 * The browser already records how long each request took; across origins it hides the
 * rest, `Server-Timing` included, unless the response says the page's origin may see it.
 * Neither header carries anything about the visitor: cache ages and durations only.
 */

/** Who may call this API from a browser: CORS's list, and `Timing-Allow-Origin`'s. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return ['http://localhost:5173', env.FRONTEND_URL].filter(
    (origin): origin is string => Boolean(origin),
  );
}

/**
 * `Timing-Allow-Origin` on every response, naming the same origins CORS admits, so the
 * site's own pages, and no one else's, see sizes and `Server-Timing` in Resource Timing.
 */
export function timingAllowOrigin(origins: string[]) {
  const value = origins.join(', ');
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (value) res.setHeader('Timing-Allow-Origin', value);
    next();
  };
}

/** What a caching route served: its copy and how old it was, or a fresh fetch and how long it took. */
export type ServerCopy =
  { cache: 'hit'; ageMs: number } | { cache: 'miss'; upstreamMs: number };

export function formatServerTiming(copy: ServerCopy): string {
  return copy.cache === 'hit'
    ? `cache;desc="hit", age;dur=${Math.round(copy.ageMs)}`
    : `cache;desc="miss", upstream;dur=${Math.round(copy.upstreamMs)}`;
}

/** Sets the header, or nothing when there is no copy to describe. */
export function serverTiming(res: Response, copy: ServerCopy | null): void {
  if (copy) res.setHeader('Server-Timing', formatServerTiming(copy));
}

/**
 * Runs a caching service's call and says which it was, from the cache's own age: the
 * same `cacheAge()` `/health` reports, read before and after, so it costs no upstream
 * call. Younger after than before (or none before) is a fetch this request made; the
 * same age is the copy served. No age after is nothing cached at all, an unconfigured
 * service or a failed first fetch, and gets no header.
 *
 * Nor does an answer that served nothing: a refresh that fails after the copy expired
 * returns `{ configured: false }` and leaves the old copy in place, whose age still
 * reads as a hit (review of #160). The answer is the outcome, so it is read too.
 */
export async function timedCopy<T>(
  res: Response,
  age: () => number | null | undefined,
  work: () => Promise<T>,
  clock: () => number = () => performance.now(),
): Promise<T> {
  const before = age() ?? null;
  const started = clock();
  const result = await work();
  const after = age() ?? null;
  if (after !== null && !servedNothing(result)) {
    serverTiming(
      res,
      before === null || after < before
        ? { cache: 'miss', upstreamMs: clock() - started }
        : { cache: 'hit', ageMs: after },
    );
  }
  return result;
}

/** The degraded answer every caching service gives when it has nothing to serve. */
function servedNothing(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as { configured?: unknown }).configured === false
  );
}
