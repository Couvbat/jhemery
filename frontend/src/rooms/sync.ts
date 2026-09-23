import type { PlaybackState, RoomKind } from '@/lib/api'

/**
 * The pure half of the rooms: codes, media parsing, the drift maths and the embed
 * URLs. Nothing here touches the DOM or the network — `useRoom.ts` and the two
 * player components do — so the decisions that make a party stay in sync are all
 * testable in jsdom.
 */

export const CODE_PATTERN = /^[A-Z0-9]{5}$/

/** ` abcde `, `ABCDE`, or a pasted room link → `ABCDE`. Null for anything else. */
export function normaliseCode(input: string): string | null {
  let text = input.trim()
  const fromLink = /\/(?:watch|radio)\/([A-Za-z0-9]{5})(?:[/?#]|$)/.exec(text)
  if (fromLink) text = fromLink[1]!
  const upper = text.toUpperCase()
  return CODE_PATTERN.test(upper) ? upper : null
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** A video id as is, or the id inside any of the URL shapes YouTube hands out. */
export function parseYouTube(input: string): string | null {
  const text = input.trim()
  if (YOUTUBE_ID.test(text)) return text
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v') ?? /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}

/** A soundcloud.com track or set URL, canonicalised and stripped of tracking. */
export function parseSoundCloud(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m)\./, '')
  if (host !== 'soundcloud.com' || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null
  const path = url.pathname.replace(/\/+$/, '')
  // `/user/track` or `/user/sets/name`: a profile alone is not something the widget plays.
  if (path.split('/').filter(Boolean).length < 2) return null
  return `https://soundcloud.com${path}`
}

export function parseMedia(kind: RoomKind, input: string): string | null {
  return kind === 'watch' ? parseYouTube(input) : parseSoundCloud(input)
}

/** What the pages print for an item: the id for a video, the path for a track. */
export function mediaLabel(kind: RoomKind, media: string): string {
  if (kind === 'watch') return media
  return media.replace(/^https:\/\/soundcloud\.com\//, '')
}

/** Seconds a guest may be out before it seeks. Two: under it, a seek is more
 *  disruptive than the drift; over it, laughs land at different times. */
export const DRIFT_SECONDS = 2

/** Where the host's item is at `now` (server ms), by the last state relayed. */
export function expectedPosition(state: PlaybackState, now: number): number {
  if (!state.playing) return state.position
  return Math.max(0, state.position + (now - state.at) / 1000)
}

/** What a guest's player has to do to match the room: seek if out by more than
 *  `DRIFT_SECONDS`, and follow play/pause. `null` means leave it alone. */
export function reconcile(
  state: PlaybackState,
  actual: { position: number; playing: boolean },
  now: number,
): { seekTo: number | null; play: boolean | null } {
  const expected = expectedPosition(state, now)
  return {
    seekTo: Math.abs(actual.position - expected) > DRIFT_SECONDS ? expected : null,
    play: actual.playing === state.playing ? null : state.playing,
  }
}

/** Two successive readings of the host's player: did the position move by more
 *  than the clock did? Then the host seeked, and the room should hear about it. */
export function isSeek(
  before: { position: number; at: number },
  after: { position: number; at: number },
  playing: boolean,
): boolean {
  const elapsed = playing ? (after.at - before.at) / 1000 : 0
  return Math.abs(after.position - before.position - elapsed) > 1.5
}

/**
 * The server stamps `at` with its clock; `expectedPosition` needs that clock, not
 * the guest's. Each frame whose `at` is new is a sample of (received − at): mostly
 * network latency plus whatever the guest's clock is off by. Heartbeats resend an
 * old `at` and are not samples. The smallest sample is the closest to the truth —
 * latency only ever adds — so that is the estimate.
 */
export class ClockSkew {
  private skew: number | null = null
  private lastAt: number | null = null

  sample(serverAt: number, receivedAt: number): void {
    if (serverAt === this.lastAt) return
    this.lastAt = serverAt
    const sample = receivedAt - serverAt
    this.skew = this.skew === null ? sample : Math.min(this.skew, sample)
  }

  /** The server's clock as of `localNow`. Unsampled, it is the local clock. */
  serverNow(localNow: number): number {
    return localNow - (this.skew ?? 0)
  }
}

export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com'
export const SOUNDCLOUD_ORIGIN = 'https://w.soundcloud.com'

/**
 * The privacy-enhanced embed with its message API on. `origin` has to be the page's
 * own, or the iframe ignores every command it is sent. Guests get no controls —
 * the host drives — but keyboard and fullscreen stay for them.
 */
export function youtubeEmbed(id: string, pageOrigin: string, host: boolean): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    origin: pageOrigin,
    playsinline: '1',
    rel: '0',
    controls: host ? '1' : '0',
    fs: '1',
  })
  return `${YOUTUBE_ORIGIN}/embed/${id}?${params}`
}

/** The same widget `MusicSection` embeds, in the site's green, with every share
 *  and buy button off — a party is not a shop. */
export function soundcloudEmbed(url: string): string {
  const params = new URLSearchParams({
    url,
    color: '#00ff41',
    auto_play: 'false',
    hide_related: 'true',
    show_comments: 'false',
    show_reposts: 'false',
    show_teaser: 'false',
    visual: 'false',
    buying: 'false',
    sharing: 'false',
    download: 'false',
  })
  return `${SOUNDCLOUD_ORIGIN}/player/?${params}`
}

/** `0:07`, `12:34`, `1:02:03`. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
