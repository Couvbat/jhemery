export const apiUrl: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

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

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, init)
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body?.message) {
        detail = Array.isArray(body.message) ? body.message.join(', ') : body.message
      }
    } catch {
      // Non-JSON error body — the status code is all we have.
    }
    throw new ApiError(detail, res.status)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  steamActivity: () => request<SteamActivity>('/steam/activity'),
  githubActivity: () => request<GithubActivity>('/github/activity'),
  githubContributions: () => request<GithubContributions>('/github/contributions'),
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
}
