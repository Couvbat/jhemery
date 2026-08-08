import type { Page, Route } from '@playwright/test'
import { API_ORIGIN, API_PREFIX } from '../constants'
import * as payloads from './payloads'

/**
 * The backend, stubbed.
 *
 * No test in this suite is allowed to touch a real API. Partly because a suite that
 * goes red when api.jhemery.xyz restarts is worse than no suite, and partly because
 * the behaviour most worth testing here — that every optional integration degrades
 * instead of breaking — is only reachable by *choosing* the failure. You cannot ask
 * a healthy backend to be unconfigured.
 *
 * One catch-all route rather than a `page.route` per endpoint: it means a call the
 * fixture has no handler for is recorded in `unstubbed` and answered with a 501,
 * instead of escaping to the network and hanging until Playwright's timeout.
 */

export type ApiPreset =
  /** Every integration on, with fixture data. */
  | 'configured'
  /** Every integration off — `{ configured: false }`, the documented degraded state. */
  | 'unconfigured'
  /** The backend is unreachable. Requests fail at the transport, as they would with a dead host. */
  | 'down'

export interface RecordedRequest {
  method: string
  /** Pathname only — the origin is always `API_ORIGIN`. */
  path: string
  body: unknown
}

interface Handler {
  method: string
  pattern: RegExp
  respond: (route: Route) => Promise<void>
}

function json(body: unknown, status = 200) {
  return (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

/** `/guestbook/:id` → a regex; everything else is matched literally. */
function toPattern(path: string): RegExp {
  const source = path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[a-zA-Z]+/g, '[^/]+')
  return new RegExp(`^${source}$`)
}

export class ApiStub {
  /** Searched from the end, so a per-test override beats the preset underneath it. */
  private handlers: Handler[] = []

  /** Every intercepted call, in order. Assert on this instead of trusting the UI. */
  readonly requests: RecordedRequest[] = []

  /** Paths that reached the catch-all with nothing to answer them. Should stay empty. */
  readonly unstubbed: string[] = []

  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    await this.page.route(`${API_ORIGIN}/**`, async (route) => {
      const request = route.request()
      // Matched without the prefix, so handlers are written as the backend's own
      // routes (`/steam/activity`, not `/__e2e-api/steam/activity`).
      const path = new URL(request.url()).pathname.slice(API_PREFIX.length)
      const method = request.method()

      let body: unknown
      try {
        body = request.postDataJSON()
      } catch {
        // GET, or a non-JSON body. Neither is interesting to record.
      }
      this.requests.push({ method, path, body })

      for (let i = this.handlers.length - 1; i >= 0; i -= 1) {
        const handler = this.handlers[i]!
        if (handler.method === method && handler.pattern.test(path)) {
          await handler.respond(route)
          return
        }
      }

      this.unstubbed.push(`${method} ${path}`)
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'no stub in the e2e fixture for this endpoint' }),
      })
    })
  }

  /**
   * Replaces the whole handler stack. It applies to every request made from now on,
   * so switching mid-test is fine for endpoints the app re-fetches (`btc`, `guestbook`)
   * — but `steam`, `weather` and `gitlog` memoise their first success for the life of
   * the page, and those need the preset chosen before the load that fetches them.
   */
  use(preset: ApiPreset): this {
    this.handlers = []

    if (preset === 'down') {
      // Aborted rather than 500'd: an unreachable host fails at the transport, and
      // `src/lib/api.ts` distinguishes the two — a rejected fetch never reaches
      // `errorFrom`. Testing the wrong one would let a real outage through.
      this.any('/**', (route) => route.abort('connectionrefused'))
      return this
    }

    const configured = preset === 'configured'

    this.get('/steam/activity', configured ? payloads.steamConfigured : payloads.unconfigured)
    this.get(
      '/github/activity',
      configured ? payloads.githubActivityConfigured : payloads.unconfigured,
    )
    this.get(
      '/github/contributions',
      configured ? payloads.githubContributionsConfigured : payloads.unconfigured,
    )
    this.get(
      '/github/pinned-repos',
      configured ? payloads.githubPinnedConfigured : payloads.unconfigured,
    )
    this.get(
      '/github/workflow-status',
      configured ? payloads.githubWorkflowConfigured : payloads.unconfigured,
    )
    this.get('/weather', configured ? payloads.weatherConfigured : payloads.unconfigured)
    this.get('/markets', configured ? payloads.marketsConfigured : payloads.unconfigured)
    this.get(
      '/guestbook',
      configured ? payloads.guestbookConfigured : payloads.guestbookDisabled,
    )

    // Not gated on the preset: `/stats` has no key to be missing, and every page
    // load posts a session. Leaving it unanswered would put a 501 in the console of
    // every test that never mentions stats.
    this.get('/stats', payloads.statsConfigured)
    this.post('/stats/session', payloads.statsConfigured)

    // Presence is a held SSE connection. Aborting it is the quiet default: the
    // composable gives up after three failures (`MAX_FAILURES`) and the counter
    // simply never appears, whereas a stream that closes cleanly makes EventSource
    // reconnect for as long as the tab is open. `presence()` opts in.
    this.any('/presence', (route) => route.abort('connectionrefused'))

    return this
  }

  /** A one-off JSON response for one endpoint, overriding the preset. */
  get(path: string, body: unknown, status = 200): this {
    this.handlers.push({ method: 'GET', pattern: toPattern(path), respond: json(body, status) })
    return this
  }

  post(path: string, body: unknown, status = 200): this {
    this.handlers.push({ method: 'POST', pattern: toPattern(path), respond: json(body, status) })
    return this
  }

  /** Any method, raw route control — for aborts and streams. `'/**'` matches every path. */
  any(path: string, respond: (route: Route) => Promise<void>): this {
    const pattern = path === '/**' ? /.*/ : toPattern(path)
    for (const method of ['GET', 'POST', 'DELETE', 'PUT', 'PATCH']) {
      this.handlers.push({ method, pattern, respond })
    }
    return this
  }

  /** An endpoint that answers, but with an error status — a rate limit, a 500. */
  fail(method: 'GET' | 'POST' | 'DELETE', path: string, status: number, message?: string): this {
    const body = message ? { message } : { statusCode: status }
    this.handlers.push({
      method,
      pattern: toPattern(path),
      respond: json(body, status),
    })
    return this
  }

  /**
   * A presence stream that emits `counts` and then ends. The connection closing makes
   * EventSource reconnect, so each subsequent attempt replays the same body — fine for
   * asserting the counter renders, which is all any test needs from it.
   */
  presence(...counts: number[]): this {
    const body = counts.map((online) => `data: ${JSON.stringify({ online })}\n\n`).join('')
    this.handlers.push({
      method: 'GET',
      pattern: toPattern('/presence'),
      respond: (route) =>
        route.fulfill({ status: 200, contentType: 'text/event-stream', body }),
    })
    return this
  }

  /**
   * `POST /ask`, as the SSE frame sequence `askStream` parses: one `data:` line per
   * delta, terminated by `[DONE]`. Pass `{ error }` for the mid-stream failure case
   * that cannot be a status code — the one `askStream` turns back into an ApiError.
   */
  ask(deltas: string[], trailer?: { error: string }): this {
    const frames = deltas.map((delta) => `data: ${JSON.stringify({ delta })}\n\n`)
    frames.push(trailer ? `data: ${JSON.stringify(trailer)}\n\n` : 'data: [DONE]\n\n')
    this.handlers.push({
      method: 'POST',
      pattern: toPattern('/ask'),
      respond: (route) =>
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames.join('') }),
    })
    return this
  }

  /** All recorded calls to one path, for asserting on what the app actually sent. */
  sent(method: string, path: string): RecordedRequest[] {
    const pattern = toPattern(path)
    return this.requests.filter((r) => r.method === method && pattern.test(r.path))
  }
}
