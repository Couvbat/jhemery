import type { Locale } from '@/content/types'

/**
 * Where the backend lives.
 *
 * `VITE_API_URL` is read **by `vite build`** — from `frontend/.env` locally, and
 * from the `VITE_API_URL` repository variable in CI — and Vite inlines it into
 * the bundle as a literal, so it has to be set wherever the build runs. Dropping
 * a `.env` next to the deployed `dist/` does nothing: what ships is static files
 * with the URL already frozen in.
 *
 * The localhost fallback is deliberately dev-only. It used to apply to every
 * build, so a production bundle with no `VITE_API_URL` aimed every live-data
 * call at the *visitor's* machine — five doomed cross-origin requests to
 * `http://localhost:3000` on each page load. Falling back to an empty base
 * makes that same mistake a same-origin request instead: still wrong, but it
 * fails quietly and locally rather than in every visitor's console.
 *
 * Trailing slashes are stripped because every caller below writes `${apiUrl}/path`.
 * `https://api.jhemery.xyz/` — the obvious thing to type into a repository
 * variable, and what a browser shows you when you visit the API — would otherwise
 * make every request `//path`, which a proxy answers with a redirect to the single
 * slash. A redirect is fatal to a cross-origin request unless it carries CORS
 * headers, and no proxy's normalisation redirect does, so the browser reports it
 * as a *missing CORS header* on an endpoint that is configured perfectly and
 * answers `curl` without complaint. Nothing in the console names the extra
 * character, and it is identical on every device, so it survives every clean
 * profile and cache clear you try.
 *
 * `ask.service.ts` strips the same character off `LLM_BASE_URL` for the same reason.
 */
/** Exported for the test; `apiUrl` below is the only caller in the app. */
export function normaliseBase(url: string): string {
  return url.replace(/\/+$/, '')
}

export const apiUrl: string = normaliseBase(
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : ''),
)

export interface SteamRecentGame {
  appId: number
  name: string
  iconUrl: string
  playtime2Weeks: number
  playtimeForever: number
}

export interface SteamProfile {
  name: string
  avatar: string
  profileUrl: string
  status: string
  inGame?: string
}

export interface SteamActivity {
  configured: boolean
  profile?: SteamProfile
  recentGames?: SteamRecentGame[]
}

export interface GithubCommit {
  repo: string
  sha: string
  message: string
  url: string
  date: string
}

export interface GithubActivity {
  configured: boolean
  commits?: GithubCommit[]
}

export interface ContributionDay {
  date: string
  count: number
  /** 0–4, as GitHub's own graph buckets them. */
  level: number
}

export interface GithubContributions {
  configured: boolean
  total?: number
  /** Weeks of 7 days, oldest first. Partial leading/trailing weeks are padded by the API. */
  weeks?: ContributionDay[][]
}

export interface GithubPinnedRepo {
  name: string
  description: string | null
  url: string
  language: string | null
  languageColor: string | null
  stars: number
  forks: number
}

export interface GithubPinnedRepos {
  configured: boolean
  repos?: GithubPinnedRepo[]
}

export interface WorkflowRun {
  name: string
  /** `queued` | `in_progress` | `completed`. */
  status: string
  /** `success` | `failure` | `cancelled` | … — null while still running. */
  conclusion: string | null
  branch: string
  sha: string
  url: string
  startedAt: string
  durationMs: number | null
}

export interface GithubWorkflowStatus {
  configured: boolean
  repo?: string
  runs?: WorkflowRun[]
}

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder'

export interface WeatherNow {
  temperature: number
  apparent: number
  humidity: number
  windSpeed: number
  windDirection: number
  precipitation: number
  isDay: boolean
  code: number
  condition: WeatherCondition
}

export interface WeatherForecastDay {
  date: string
  min: number
  max: number
  code: number
  condition: WeatherCondition
}

export interface WeatherReport {
  configured: boolean
  location?: string
  now?: WeatherNow
  forecast?: WeatherForecastDay[]
}

export interface MarketQuote {
  id: string
  symbol: string
  name: string
  price: number
  currency: string
  change24h: number | null
  /** Seven days of closes, already downsampled by the backend. */
  sparkline: number[]
}

export interface MarketsReport {
  configured: boolean
  quotes?: MarketQuote[]
}

export interface StatsReport {
  /** Terminal sessions opened, ever. Aggregate — there is nothing else stored. */
  sessions: number
}

/** One finished daily wordle, everyone's: `counts[0..5]` solved in 1–6, `counts[6]` not solved. */
export interface WordleHistogram {
  day: string
  locale: Locale
  counts: number[]
}

/** `GET /health` — see `backend/src/common/health.ts` for what each field may and may not read. */
export interface UnitHealth {
  unit: string
  state: 'active' | 'inactive'
  reason?: 'unconfigured' | 'disabled' | 'missing-binary'
  /** Milliseconds since the unit last fetched its upstream; null if it has not yet. */
  cacheAge?: number | null
  detail?: Record<string, number>
  /** What the last real use found, and when: `ask`'s last answer or the reason it failed. */
  last?: { outcome: string; agoMs: number }
}

export interface HealthReport {
  /** Seconds the API process has been up. */
  uptime: number
  units: UnitHealth[]
}

export interface GuestbookEntry {
  id: string
  name: string
  message: string
  date: string
  /** A local model's one-line reply, under an entry it published; `see` a page it drew from. */
  reply?: { text: string; by: 'model'; see?: string }
}

/** Where a moderated entry is: what `GET /guestbook/:id/status` answers. */
export type GuestbookStatus = 'pending' | 'held' | 'published'

/** `sign` with moderation on: the entry waits for the model, and only its id comes back. */
export interface GuestbookPending {
  id: string
  status: 'pending'
}

/** What the owner's list shows of an entry that isn't up. */
export interface HeldGuestbookEntry {
  id: string
  name: string
  message: string
  status: 'pending' | 'held'
  reason?: string
  ageMs: number
}

export interface GuestbookList {
  enabled: boolean
  entries?: GuestbookEntry[]
}

export type RoomKind = 'watch' | 'radio' | 'connect4'

/** A game room's public state: every move, in order. See `backend/src/rooms/rooms.types.ts`. */
export interface GameState {
  moves: number[]
  /** 1 until someone takes the second seat, then 2. */
  seats: 1 | 2
  /** Which seat opened this round: 0 is the host. */
  starter: 0 | 1
}

/** The host's playback, anchored to the server clock — see `rooms/sync.ts` for the maths. */
export interface PlaybackState {
  /** A YouTube video id (`watch`), or that or a soundcloud.com URL (`radio`); null when nothing is loaded. */
  media: string | null
  /** Seconds into the item as of `at`. */
  position: number
  playing: boolean
  /** Server time in ms when the state was set. */
  at: number
  /** The current item's title, once the server has found one; absent from an older backend. */
  title?: string
}

/** One frame of a room's event stream. `members` is a count, as in `/presence`. */
export interface RoomSnapshot {
  code: string
  kind: RoomKind
  state: PlaybackState
  queue: string[]
  /**
   * Item → title, found by the server through oEmbed — never text a host typed. Beside
   * the queue rather than in it, so the queue stays `string[]` for bundles that predate
   * it, and absent from a backend that predates it.
   */
  titles?: Record<string, string>
  members: number
  /** Only on a game room. */
  game?: GameState
}

/** The second seat of a game room, handed to whoever takes it first. */
export interface RoomJoined extends RoomSnapshot {
  seatToken: string
}

export interface RoomCreated extends RoomSnapshot {
  /** Proves the host on the state route. Kept in the host's tab, never in a URL. */
  hostToken: string
}

export interface RoomsInfo {
  enabled: boolean
}

export interface RoomPatch {
  media?: string | null
  position?: number
  playing?: boolean
  queue?: string[]
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

/** One download on the server. No path: the file is only ever reached through `fetchJobFile`. */
export interface DownloadJob {
  id: string
  url: string
  status: JobStatus
  /** 0–1 while running; null before yt-dlp's first progress line. */
  progress: number | null
  filename: string | null
  size: number | null
  error: string | null
  createdAt: number
  finishedAt: number | null
}

export interface JobsInfo {
  configured: boolean
  jobs: DownloadJob[]
}

/** A pool's health word, as ZFS says it; absent when only its fill is known. */
export type PoolHealth = 'ONLINE' | 'DEGRADED' | 'FAULTED' | 'OFFLINE' | 'UNAVAIL'

/**
 * One machine in the lab's snapshot. The shape is `backend/src/lab/lab.types.ts`, and
 * what it may hold is the lab map spec's: coarse figures, never an address or a version.
 */
export interface LabMachine {
  id: string
  up: boolean
  uptimeSeconds?: number
  /** Percent, 0–100. */
  cpu?: number
  memory?: number
  load?: number
  tempC?: { cpu?: number; gpu?: number }
  pools?: { name: string; health?: PoolHealth; used: number }[]
  gpu?: { util: number; vramUsedMb: number; vramTotalMb: number; powerW?: number }
  containers?: number
}

export interface LabServiceSample {
  id: string
  status: 'up' | 'down' | 'maintenance'
  latencyMs?: number
}

export interface LabSnapshot {
  takenAt: string
  machines: LabMachine[]
  services: LabServiceSample[]
  models?: {
    runtime: 'up' | 'down'
    resident: { name: string; vramMb: number }[]
    installed: { name: string; sizeGb: number }[]
  }
  tunnel?: { healthy: boolean; connections: number }
}

/** `GET /lab`: the copy the API holds of the lab's last push. It never calls the lab. */
export type LabReport =
  | { configured: false }
  | {
      configured: true
      receivedAt: string | null
      ageMs: number | null
      stale: boolean
      snapshot: LabSnapshot | null
      /** Per node, 30 UTC days oldest first: the fraction up, or null for no data. */
      history: Record<string, (number | null)[]>
    }

/** `POST /presence/wall` on a deployment that hasn't opted in. */
export interface WallOff {
  configured: false
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Why, when the API names it: `ask`'s closed set (`lib/ask-session.ts`). */
    readonly reason?: string,
    /** Seconds until a rate limit's window frees, from `Retry-After`. */
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let detail = `${res.status}`
  let reason: string | undefined
  try {
    const body = (await res.json()) as { message?: string | string[]; reason?: unknown }
    if (body?.message) {
      detail = Array.isArray(body.message) ? body.message.join(', ') : body.message
    }
    if (typeof body?.reason === 'string') reason = body.reason
  } catch {
    // Non-JSON error body — the status code is all we have.
  }
  const retry = Number(res.headers?.get('retry-after'))
  return new ApiError(detail, res.status, reason, Number.isFinite(retry) && retry > 0 ? retry : undefined)
}

// ---------------------------------------------------------------------------
// The request observer, which `strace` reads
// ---------------------------------------------------------------------------

/**
 * One request as `strace` shows it. Never its headers: those carry `x-admin-password`
 * and `x-room-token`. The bodies are here so strace can print their shape; it prints
 * keys, never values, and nothing else reads them.
 */
export interface RequestTrace {
  method: string
  /** The path, relative to the API or, with `site`, to this origin. */
  url: string
  /** The status; `error` for a request that never got one, `stream` for an event stream that opened. */
  status: number | 'error' | 'stream'
  /** The body's size: a transfer size would need `Timing-Allow-Origin` on the API. */
  bytes: number
  ms: number
  sent?: unknown
  received?: unknown
  /** A poll nobody asked for (the guestbook ticker, the download tool's), which strace leaves out. */
  background?: boolean
  /** A request to this origin (`curl`) rather than the API. */
  site?: boolean
}

export interface RequestOptions {
  background?: boolean
}

const observers = new Set<(trace: RequestTrace) => void>()

/** Reports every request from now until the returned function is called. */
export function observeRequests(observer: (trace: RequestTrace) => void): () => void {
  observers.add(observer)
  return () => void observers.delete(observer)
}

function report(trace: RequestTrace): void {
  for (const observer of observers) observer(trace)
}

const since = (started: number) => Math.round(performance.now() - started)
const byteLength = (text: string) => new TextEncoder().encode(text).byteLength

function parsed(text: unknown): unknown {
  if (typeof text !== 'string' || !text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

async function settle<T>(res: Response): Promise<T> {
  if (!res.ok) throw await errorFrom(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function request<T>(path: string, init?: RequestInit, options: RequestOptions = {}): Promise<T> {
  // Nobody watching: exactly the path every request took before strace existed.
  if (!observers.size) return settle<T>(await fetch(`${apiUrl}${path}`, init))

  const started = performance.now()
  const trace = { method: (init?.method ?? 'GET').toUpperCase(), url: path, sent: parsed(init?.body), background: options.background }
  let res: Response
  try {
    res = await fetch(`${apiUrl}${path}`, init)
  } catch (error) {
    report({ ...trace, status: 'error', bytes: 0, ms: since(started) })
    throw error
  }
  const text = await res
    .clone()
    .text()
    .catch(() => '')
  report({ ...trace, status: res.status, bytes: byteLength(text), ms: since(started), received: parsed(text) })
  return settle<T>(res)
}

/**
 * An event stream from the API, reported once: as `stream` when it opens, or `error` if
 * it fails first. What arrives afterwards is the stream's business, not one request's.
 */
export function openEventSource(path: string): EventSource {
  const source = new EventSource(`${apiUrl}${path}`)
  if (!observers.size) return source
  const started = performance.now()
  let reported = false
  const once = (status: 'stream' | 'error') => () => {
    if (reported) return
    reported = true
    report({ method: 'GET', url: path, status, bytes: 0, ms: since(started) })
  }
  source.addEventListener('open', once('stream'))
  source.addEventListener('error', once('error'))
  return source
}

/** A response from this origin, read up to a limit so `curl` can't pull 32 MB of wasm. */
export interface SiteResponse {
  status: number
  statusText: string
  headers: Headers
  body: Uint8Array
  /** The body went past the limit and was cut off there. */
  truncated: boolean
}

/**
 * `GET` or `HEAD` against this origin, for `curl`. `no-store` keeps the HTTP cache out of
 * it; the service worker still answers whatever it precached, which is why `curl`
 * maps a bare host to `/resume.txt` rather than `/`.
 */
export async function fetchSite(
  path: string,
  method: 'GET' | 'HEAD' = 'GET',
  { limit = 256 * 1024, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<SiteResponse> {
  // A path on this origin, and only that: `//host` would be another origin's URL.
  if (!path.startsWith('/') || /^\/[\\/]/.test(path)) throw new TypeError(`not a path on this origin: ${path}`)
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(path, { method, cache: 'no-store', signal })
  } catch (error) {
    report({ method, url: path, status: 'error', bytes: 0, ms: since(started), site: true })
    throw error
  }

  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  const declared = Number(res.headers.get('content-length'))
  if (method === 'HEAD' || !res.body) {
    // Nothing to read.
  } else if (declared > limit) {
    truncated = true
    await res.body.cancel().catch(() => undefined)
  } else {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.byteLength
      if (size > limit) {
        truncated = true
        await reader.cancel().catch(() => undefined)
        break
      }
    }
  }
  const body = new Uint8Array(Math.min(size, limit))
  let at = 0
  for (const chunk of chunks) {
    const room = body.length - at
    if (room <= 0) break
    body.set(chunk.subarray(0, room), at)
    at += Math.min(chunk.byteLength, room)
  }
  report({ method, url: path, status: res.status, bytes: truncated && declared ? declared : body.byteLength, ms: since(started), site: true })
  return { status: res.status, statusText: res.statusText, headers: res.headers, body, truncated }
}

/**
 * `POST /ask`, yielding the model's answer a token at a time.
 *
 * A stream cannot go through `request()`: the interesting failures happen after
 * the promise resolves. This throws `ApiError` for anything that goes wrong
 * before the body starts, and simply stops yielding if the connection dies
 * mid-answer — the caller keeps whatever arrived.
 */
/** One of the site's pages an answer drew from: a route, or a command line a link runs. */
export interface AskSource {
  title: string
  target: string
}

/**
 * Which model wrote an answer, how fast, and from which pages: one event after the last
 * delta. Its shape is `backend/src/ask/ask.service.ts`'s `AskMeta`.
 */
export interface AskMeta {
  model: string
  label?: string
  outputTokens: number
  /** The runtime sent no count, so `outputTokens` counts the deltas. */
  approx?: boolean
  firstTokenMs: number
  totalMs: number
  tokensPerSecond: number | null
  sources: AskSource[]
}

export type AskEvent = { delta: string } | { meta: AskMeta }

/** A meta event from a backend that sends one; anything else is skipped, as an unknown event is. */
function readMeta(value: unknown): AskMeta | undefined {
  const meta = value as Partial<AskMeta> | null
  if (!meta || typeof meta.model !== 'string' || typeof meta.outputTokens !== 'number') return undefined
  const sources = Array.isArray(meta.sources)
    ? meta.sources.filter((s): s is AskSource => typeof s?.title === 'string' && typeof s?.target === 'string')
    : []
  return { ...(meta as AskMeta), sources }
}

export async function* askStream(
  question: string,
  locale: Locale,
  signal?: AbortSignal,
): AsyncGenerator<AskEvent> {
  const started = performance.now()
  const traced = observers.size > 0
  // The question's shape, never the question: strace prints keys.
  const sent = { question, locale }
  let res: Response
  try {
    res = await fetch(`${apiUrl}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sent),
      signal,
    })
  } catch (error) {
    if (traced) report({ method: 'POST', url: '/ask', status: 'error', bytes: 0, ms: since(started), sent })
    throw error
  }
  let bytes = 0
  // Once, at the end, however the stream ends: done, [DONE], an error frame or a cancel.
  const done = () => {
    if (traced) report({ method: 'POST', url: '/ask', status: res.status, bytes, ms: since(started), sent })
  }
  if (!res.ok || !res.body) {
    done()
    throw await errorFrom(res)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done: ended, value } = await reader.read()
      if (ended) return

      bytes += value.byteLength
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      // One `data:` field per event, read line by line so an event split across
      // two network chunks still parses.
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const raw = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!raw.startsWith('data:')) continue

        const payload = raw.slice('data:'.length).trim()
        if (payload === '[DONE]') return

        let event: { delta?: string; error?: string; reason?: string; meta?: unknown }
        try {
          event = JSON.parse(payload) as { delta?: string; error?: string; reason?: string; meta?: unknown }
        } catch {
          // A malformed chunk is not worth throwing away the answer for.
          continue
        }

        // A failure the backend only discovered after committing to the stream,
        // so it could not be a status code. Raised as one anyway: `ask` decides
        // what to draw from the error alone, and this keeps that one decision
        // in one place.
        if (event.error) throw new ApiError(event.error, event.error === 'busy' ? 503 : 502, event.reason)
        if (event.delta) yield { delta: event.delta }
        const meta = readMeta(event.meta)
        if (meta) yield { meta }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    done()
  }
}

export const api = {
  steamActivity: () => request<SteamActivity>('/steam/activity'),
  githubActivity: () => request<GithubActivity>('/github/activity'),
  githubContributions: () => request<GithubContributions>('/github/contributions'),
  githubPinnedRepos: () => request<GithubPinnedRepos>('/github/pinned-repos'),
  githubWorkflowStatus: () => request<GithubWorkflowStatus>('/github/workflow-status'),
  weather: () => request<WeatherReport>('/weather'),
  markets: () => request<MarketsReport>('/markets'),
  stats: () => request<StatsReport>('/stats'),
  recordSession: () => request<StatsReport>('/stats/session', { method: 'POST' }),
  wordleHistogram: (day: string, locale: Locale) =>
    request<WordleHistogram>(`/stats/wordle?day=${encodeURIComponent(day)}&locale=${locale}`),
  recordWordle: (day: string, locale: Locale, guesses: number) =>
    request<WordleHistogram>('/stats/wordle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day, locale, guesses }),
    }),
  health: () => request<HealthReport>('/health'),
  lab: (options?: RequestOptions) => request<LabReport>('/lab', undefined, options),
  /**
   * `wall`'s wave. Enabled, a bare 204 (`undefined` here), whatever became of it. The
   * empty JSON body is the point: the server takes nothing else, so the browser's CORS
   * preflight keeps other sites from sending it through their own visitors.
   */
  wall: () =>
    request<WallOff | undefined>('/presence/wall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }),
  guestbook: (options?: RequestOptions) => request<GuestbookList>('/guestbook', undefined, options),
  // `201` and the entry from an API without moderation, `202` and `{ id, status }` from
  // one with it: the two apps deploy in no fixed order, so both are read.
  sign: (name: string, message: string, locale?: Locale) =>
    request<GuestbookEntry | GuestbookPending>('/guestbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locale ? { name, message, locale } : { name, message }),
    }),
  guestbookStatus: (id: string) => request<{ status: GuestbookStatus }>(`/guestbook/${encodeURIComponent(id)}/status`),
  heldGuestbook: (password: string) =>
    request<HeldGuestbookEntry[]>('/guestbook/held', { headers: adminHeaders(password) }),
  approveGuestbookEntry: (id: string, password: string) =>
    request<void>(`/guestbook/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: adminHeaders(password),
    }),
  deleteGuestbookEntry: (id: string, password: string) =>
    request<void>(`/guestbook/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': password },
    }),
  contact: (payload: { name: string; email: string; subject?: string; message: string }) =>
    request<{ ok: boolean }>('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  askStream,
  rooms: () => request<RoomsInfo>('/rooms'),
  createRoom: (kind: RoomKind) =>
    request<RoomCreated>('/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    }),
  room: (code: string) => request<RoomSnapshot>(`/rooms/${code}`),
  updateRoom: (code: string, token: string, patch: RoomPatch) =>
    request<RoomSnapshot>(`/rooms/${code}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-room-token': token },
      body: JSON.stringify(patch),
    }),
  endRoom: (code: string, token: string) =>
    request<void>(`/rooms/${code}`, { method: 'DELETE', headers: { 'x-room-token': token } }),
  joinRoom: (code: string) => request<RoomJoined>(`/rooms/${code}/join`, { method: 'POST' }),
  move: (code: string, token: string, column: number) =>
    request<RoomSnapshot>(`/rooms/${code}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-room-token': token },
      body: JSON.stringify({ column }),
    }),
  rematch: (code: string, token: string) =>
    request<RoomSnapshot>(`/rooms/${code}/rematch`, { method: 'POST', headers: { 'x-room-token': token } }),
  jobs: (password: string, options?: RequestOptions) =>
    request<JobsInfo>('/jobs', { headers: adminHeaders(password) }, options),
  startJob: (password: string, url: string) =>
    request<DownloadJob>('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminHeaders(password) },
      body: JSON.stringify({ url }),
    }),
  job: (password: string, id: string) =>
    request<DownloadJob>(`/jobs/${id}`, { headers: adminHeaders(password) }),
  cancelJob: (password: string, id: string) =>
    request<void>(`/jobs/${id}`, { method: 'DELETE', headers: adminHeaders(password) }),
}

/**
 * `GET /jobs/:id/file`, fetch-once: the server deletes the file as soon as this
 * response is fully read. A `<a download>` cannot carry the admin header, so the
 * bytes come through `fetch` and leave through an object URL.
 */
export async function fetchJobFile(password: string, id: string): Promise<Blob> {
  const started = performance.now()
  const url = `/jobs/${id}/file`
  let res: Response
  try {
    res = await fetch(`${apiUrl}${url}`, { headers: adminHeaders(password) })
  } catch (error) {
    report({ method: 'GET', url, status: 'error', bytes: 0, ms: since(started) })
    throw error
  }
  if (!res.ok) {
    report({ method: 'GET', url, status: res.status, bytes: 0, ms: since(started) })
    throw await errorFrom(res)
  }
  const blob = await res.blob()
  report({ method: 'GET', url, status: res.status, bytes: blob.size, ms: since(started) })
  return blob
}

function adminHeaders(password: string): Record<string, string> {
  return { 'x-admin-password': password }
}

/** The SSE endpoint a room's members hold open, for `openEventSource`. */
export function roomEventsPath(code: string): string {
  return `/rooms/${code}/events`
}
