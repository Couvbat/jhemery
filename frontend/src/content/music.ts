import type { Localised } from './types'

export const music = {
  genres: ['Hardcore', 'Techno', 'Acidcore', 'Hard Techno'],
  tools: ['FL Studio', 'Ableton', 'Akai MPK mini', 'Serum 2', 'Vital', 'DR910', 'Valhalla DSP'],
  playlistUrl: 'https://soundcloud.com/couvbat/sets/mon-bruit',
  profileUrl: 'https://soundcloud.com/couvbat',
  blurb: {
    en: 'Music is my second language. I produce hardcore, techno, acidcore and other hard electronic genres. Raw kicks, distorted basslines, relentless BPMs — the same drive I put into code goes straight into every track.',
    fr: "La musique est ma seconde langue. Je produis du hardcore, de la techno, de l'acidcore et d'autres genres électroniques durs. Kicks bruts, basses saturées, BPM sans répit — la même énergie que je mets dans le code passe directement dans chaque track.",
  } satisfies Localised,
} as const

/** The site's own green, which the widget falls back to. */
export const EMBED_FALLBACK_COLOUR = '#00ff41'

/**
 * The colour a SoundCloud widget is drawn in: the caller reads `--neon-green`, so the
 * player follows the scheme, but only a plain `#rrggbb` goes into a URL another origin
 * parses. Anything else is the site's own green.
 */
export function embedColour(colour: string): string {
  const trimmed = colour.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(trimmed) ? trimmed : EMBED_FALLBACK_COLOUR
}

/**
 * The playlist's widget. Pure, so the colour is the caller's to read: changing `src`
 * reloads the cross-origin player and stops it, so `MusicSection` reads the colour only
 * when it mounts the frame. `auto_play` is written once, either way — appending
 * `&auto_play=true` after a `false` used to send the widget both.
 */
export function soundcloudEmbedSrc(colour: string, autoplay = false): string {
  const params = new URLSearchParams({
    url: music.playlistUrl,
    color: embedColour(colour),
    auto_play: String(autoplay),
    hide_related: 'true',
    show_comments: 'false',
    show_reposts: 'false',
    show_teaser: 'false',
    visual: 'false',
  })
  return `https://w.soundcloud.com/player/?${params}`
}
