import { Injectable } from '@nestjs/common';

/** How long an oEmbed endpoint gets to answer, body included. */
export const LOOKUP_TIMEOUT_MS = 3_000;
/** An oEmbed answer is a few hundred bytes of JSON; past this it is not one. */
export const MAX_BODY_BYTES = 16 * 1024;
/** Characters a title may keep: one line of the sidebar, and a bound on every
 *  snapshot, which carries a title per queued item to every member. */
export const MAX_TITLE_LENGTH = 120;
/** Items remembered, titles and misses together: a few full rooms' worth. */
export const CACHE_SIZE = 500;
/** A miss is remembered this long, so a private or deleted item is not asked about
 *  again on every update of the room that holds it. */
export const MISS_TTL_MS = 10 * 60 * 1000;
/**
 * The budget, for every room at once. A host may post 50 new ids per request at the
 * state route's 120 a minute; without a global ceiling, that is this server asking
 * YouTube for thousands of titles a minute, from an IP YouTube has blocked once
 * already. Over budget, a lookup is refused without a request and without being
 * remembered, so a later update asks again.
 */
export const LOOKUPS_PER_MINUTE = 30;
export const MAX_CONCURRENT_LOOKUPS = 4;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SOUNDCLOUD_ITEM = /^https:\/\/(?:(?:www|m|api)\.)?soundcloud\.com\//;

/**
 * Control characters, the bidi embeddings, overrides and isolates, and the line and
 * paragraph separators. A title is somebody else's text set beside the next one in
 * a list, so nothing in it may break the line or reorder what follows it.
 */
const UNSAFE = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069\u2028\u2029]/gu;

/**
 * The oEmbed request for an item that has passed `validMedia()`. The endpoints are
 * fixed and the item only ever travels as a query parameter, so even a string that
 * slipped past the allowlist could not choose where this server connects.
 */
export function oembedUrl(media: string): string | null {
  if (YOUTUBE_ID.test(media)) {
    const params = new URLSearchParams({
      url: `https://www.youtube.com/watch?v=${media}`,
      format: 'json',
    });
    return `https://www.youtube.com/oembed?${params}`;
  }
  if (SOUNDCLOUD_ITEM.test(media)) {
    const params = new URLSearchParams({ url: media, format: 'json' });
    return `https://soundcloud.com/oembed?${params}`;
  }
  return null;
}

/**
 * The oEmbed `title` as given — not reshaped into "Artist — Track", which would mean
 * guessing at each site's conventions — with the unsafe characters gone, whitespace
 * folded and the length capped. Null when nothing printable is left.
 */
export function cleanTitle(raw: string): string | null {
  const text = raw.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  // Counted in code points, so the cut never splits a surrogate pair.
  const chars = Array.from(text);
  if (chars.length <= MAX_TITLE_LENGTH) return text;
  return `${chars
    .slice(0, MAX_TITLE_LENGTH - 1)
    .join('')
    .trimEnd()}…`;
}

/** The body as text, or null once it passes `max` bytes, declared or streamed. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (Number(res.headers.get('content-length')) > max || !res.body) {
    await res.body?.cancel();
    return null;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** One oEmbed request. Every failure — a status, a timeout, a body too big or not
 *  JSON, a title that isn't a string — is the same `null`. */
async function fetchTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // One lookup is one request: a redirect would be a second the budget never
      // counted, to wherever the first answer pointed.
      redirect: 'error',
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const text = await readCapped(res, MAX_BODY_BYTES);
    if (text === null) return null;
    const data = JSON.parse(text) as { title?: unknown } | null;
    return typeof data?.title === 'string' ? cleanTitle(data.title) : null;
  } catch {
    return null;
  }
}

interface Entry {
  title: string | null;
  /** Misses only; a title stays until the LRU drops it. */
  expiresAt: number;
}

/**
 * Titles for queued items, looked up by the server through YouTube's and SoundCloud's
 * oEmbed endpoints. The server, not the host's page: a title carried in the host's
 * patch would be any text the host liked, broadcast to every guest, and fetching from
 * the browser would mean widening `connect-src` for two third parties.
 *
 * Shared by every room, so an item queued in two rooms costs one request. Never
 * throws and never rejects: a lookup that fails for any reason is a `null`, and the
 * queue shows the bare item.
 */
@Injectable()
export class RoomTitles {
  /** Insertion-ordered, so the first key is the least recently used. */
  private readonly cache = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<string | null>>();
  /** When each lookup of the last minute started, oldest first. */
  private readonly started: number[] = [];

  /**
   * What is known without asking: the title, `null` for a remembered miss, or
   * `undefined` when nothing is (never asked, the miss has expired, or the answer
   * is still on its way).
   */
  peek(media: string, now = Date.now()): string | null | undefined {
    const entry = this.cache.get(media);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.cache.delete(media);
      return undefined;
    }
    // Touched, so the items rooms are still showing are the last to go.
    this.cache.delete(media);
    this.cache.set(media, entry);
    return entry.title;
  }

  /** The title, from the cache or one request; `null` for a miss or a refusal. */
  lookup(media: string, now = Date.now()): Promise<string | null> {
    const known = this.peek(media, now);
    if (known !== undefined) return Promise.resolve(known);
    const inFlight = this.pending.get(media);
    if (inFlight) return inFlight;
    const url = oembedUrl(media);
    if (!url || !this.admit(now)) return Promise.resolve(null);

    const run = fetchTitle(url).then((title) => {
      this.pending.delete(media);
      this.remember(media, title, now);
      return title;
    });
    this.pending.set(media, run);
    return run;
  }

  /** Takes one lookup out of the budget, or says there is none left. */
  private admit(now: number): boolean {
    while (this.started.length && this.started[0] <= now - 60_000) {
      this.started.shift();
    }
    if (
      this.started.length >= LOOKUPS_PER_MINUTE ||
      this.pending.size >= MAX_CONCURRENT_LOOKUPS
    ) {
      return false;
    }
    this.started.push(now);
    return true;
  }

  private remember(media: string, title: string | null, now: number): void {
    this.cache.delete(media);
    this.cache.set(media, {
      title,
      expiresAt: title === null ? now + MISS_TTL_MS : Infinity,
    });
    // Oldest first; deleting the key a Map iterator is on is safe.
    for (const oldest of this.cache.keys()) {
      if (this.cache.size <= CACHE_SIZE) break;
      this.cache.delete(oldest);
    }
  }
}
