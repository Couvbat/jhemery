const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** First path segments on soundcloud.com that are not a user. */
const SOUNDCLOUD_RESERVED = new Set([
  'discover',
  'search',
  'you',
  'stream',
  'charts',
  'pages',
  'tags',
  'people',
  'upload',
  'settings',
  'terms-of-use',
  'jobs',
]);

/**
 * What the runner will be handed: one video or one track, canonicalised, or
 * nothing. An allowlist rather than "whatever yt-dlp accepts", for two reasons.
 * The string becomes an argument to a process, so it should be one of a few
 * shapes this code understands. And a SoundCloud *profile* or *set* makes yt-dlp
 * walk every upload — roughly three hundred requests in a minute, which earned
 * this host's IP an hour-long 403 during the shell check (deploy.md). A single
 * track is `/<user>/<track>` and nothing else.
 */
export function acceptedUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www|m|music)\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? '';
    return YOUTUBE_ID.test(id) ? watchUrl(id) : null;
  }
  if (host === 'youtube.com') {
    const id =
      url.searchParams.get('v') ??
      /^\/(?:shorts|live|embed)\/([^/?#]+)/.exec(url.pathname)?.[1] ??
      '';
    return YOUTUBE_ID.test(id) ? watchUrl(id) : null;
  }
  if (host === 'soundcloud.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2 || SOUNDCLOUD_RESERVED.has(parts[0])) return null;
    return `https://soundcloud.com/${parts[0]}/${parts[1]}`;
  }
  return null;
}

function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
