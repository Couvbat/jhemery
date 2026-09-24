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
}

export interface GuestbookList {
  enabled: boolean
  entries?: GuestbookEntry[]
}

export type RoomKind = 'watch' | 'radio'

/** The host's playback, anchored to the server clock — see `rooms/sync.ts` for the maths. */
export interface PlaybackState {
  /** A YouTube video id (`watch`) or a soundcloud.com URL (`radio`); null when nothing is loaded. */
  media: string | null
  /** Seconds into the item as of `at`. */
  position: number
  playing: boolean
  /** Server time in ms when the state was set. */
  at: number
}

/** One frame of a room's event stream. `members` is a count, as in `/presence`. */
export interface RoomSnapshot {
  code: string
  kind: RoomKind
  state: PlaybackState
  queue: string[]
  members: number
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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let detail = `${res.status}`
  try {
    const body = (await res.json()) as { message?: string | string[] }
    if (body?.message) {
      detail = Array.isArray(body.message) ? body.message.join(', ') : body.message
    }
  } catch {
    // Non-JSON error body — the status code is all we have.
  }
  return new ApiError(detail, res.status)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, init)
  if (!res.ok) throw await errorFrom(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * `POST /ask`, yielding the model's answer a token at a time.
 *
 * A stream cannot go through `request()`: the interesting failures happen after
 * the promise resolves. This throws `ApiError` for anything that goes wrong
 * before the body starts, and simply stops yielding if the connection dies
 * mid-answer — the caller keeps whatever arrived.
 */
export async function* askStream(
  question: string,
  locale: Locale,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(`${apiUrl}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, locale }),
    signal,
  })
  if (!res.ok || !res.body) throw await errorFrom(res)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return

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

        let event: { delta?: string; error?: string }
        try {
          event = JSON.parse(payload) as { delta?: string; error?: string }
        } catch {
          // A malformed chunk is not worth throwing away the answer for.
          continue
        }

        // A failure the backend only discovered after committing to the stream,
        // so it could not be a status code. Raised as one anyway: `ask` decides
        // what to draw from the error alone, and this keeps that one decision
        // in one place.
        if (event.error) throw new ApiError(event.error, event.error === 'busy' ? 503 : 502)
        if (event.delta) yield event.delta
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
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
  guestbook: () => request<GuestbookList>('/guestbook'),
  sign: (name: string, message: string) =>
    request<GuestbookEntry>('/guestbook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, message }),
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
  jobs: (password: string) => request<JobsInfo>('/jobs', { headers: adminHeaders(password) }),
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
  const res = await fetch(`${apiUrl}/jobs/${id}/file`, { headers: adminHeaders(password) })
  if (!res.ok) throw await errorFrom(res)
  return res.blob()
}

function adminHeaders(password: string): Record<string, string> {
  return { 'x-admin-password': password }
}

/** The SSE endpoint a room's members hold open; `EventSource` wants a URL, not a fetch. */
export function roomEventsUrl(code: string): string {
  return `${apiUrl}/rooms/${code}/events`
}
