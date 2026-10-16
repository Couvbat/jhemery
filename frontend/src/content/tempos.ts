/**
 * Each SoundCloud track's tempo, for the background to beat with while the music section's
 * player plays it (`components/music/soundcloud-bridge.ts`). The frame can't be heard from
 * the page, only followed, so a beat has to be known rather than heard: these were detected
 * from the tracks' audio by `npm run tempos -- <file or SoundCloud URL> --write`, which writes
 * this declaration; entering one by hand is fine too. A track with no entry still breathes
 * with its drops and breakdowns, read off its waveform; it just has no pulse and no
 * downbeat ripple.
 *
 * A module of its own, imported by the bridge alone: in `content/music.ts` the list sat in
 * the home page's first load, which has a byte budget (`lighthouserc.yml`), for a player
 * most visits never load.
 */

/** A track's tempo. */
export interface Tempo {
  bpm: number
  /** Where the first downbeat falls, in milliseconds from the track's start. */
  firstBeatMs: number
}

/** Keyed by a track's path on soundcloud.com, `/couvbat/track`. */
export const tempos: Readonly<Record<string, Tempo>> = {
  '/c2jtm/blauwburglavallee': { bpm: 141.5, firstBeatMs: 9618 },
  '/c2jtm/couvbat-x-k8k-cqankonsor': { bpm: 180, firstBeatMs: 215 },
  '/c2jtm/couvbat-x-k8k-munchausen': { bpm: 176, firstBeatMs: 248 },
  '/c2jtm/faisattention': { bpm: 200, firstBeatMs: 125 },
  '/couvbat/abysses': { bpm: 200, firstBeatMs: 230 },
  '/couvbat/acid-attack': { bpm: 155, firstBeatMs: 245 },
  '/couvbat/alien-radio': { bpm: 210, firstBeatMs: 194 },
  '/couvbat/amen': { bpm: 180, firstBeatMs: 10888 },
  '/couvbat/armageddon': { bpm: 165, firstBeatMs: 233 },
  '/couvbat/constellation': { bpm: 170, firstBeatMs: 225 },
  '/couvbat/cosmic-rays': { bpm: 150, firstBeatMs: 226 },
  '/couvbat/cosmic-trip': { bpm: 160, firstBeatMs: 192 },
  '/couvbat/couvbat-x-k8k-rester-zen': { bpm: 180, firstBeatMs: 172 },
  '/couvbat/couvbat-x-k8k-s7e9-wip': { bpm: 180, firstBeatMs: 2879 },
  '/couvbat/cultist': { bpm: 180, firstBeatMs: 215 },
  '/couvbat/dichotomie': { bpm: 160, firstBeatMs: 239 },
  '/couvbat/distortion': { bpm: 180, firstBeatMs: 12218 },
  '/couvbat/duality': { bpm: 200, firstBeatMs: 9648 },
  '/couvbat/final-boss': { bpm: 120, firstBeatMs: 2135 },
  '/couvbat/first-contact': { bpm: 199.99, firstBeatMs: 196 },
  '/couvbat/grenaaaaaade': { bpm: 160, firstBeatMs: 192 },
  '/couvbat/helene': { bpm: 176, firstBeatMs: 222 },
  '/couvbat/kss-kss': { bpm: 159.99, firstBeatMs: 186 },
  '/couvbat/le-minoutor': { bpm: 180, firstBeatMs: 218 },
  '/couvbat/less-is-more': { bpm: 179.99, firstBeatMs: 14881 },
  '/couvbat/mind-melting': { bpm: 160, firstBeatMs: 192 },
  '/couvbat/pulsar': { bpm: 200, firstBeatMs: 504 },
  '/couvbat/sarah-mone': { bpm: 170, firstBeatMs: 183 },
  '/couvbat/satabass': { bpm: 150, firstBeatMs: 248 },
  '/couvbat/silene': { bpm: 150, firstBeatMs: 203 },
  '/couvbat/tu-fais-que-dme-recopier': { bpm: 170, firstBeatMs: 222 },
}
