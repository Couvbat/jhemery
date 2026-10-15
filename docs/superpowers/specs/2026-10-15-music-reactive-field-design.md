# Design spec — the field listens: wireframes that react to the music

Status: implemented with roadmap §K. Departures: the level's hold on opacity reaches the base shapes, not the visitors' and signatures' wireframes, which keep their own fades; and x-ray's canvas tag picks up what the field follows on the layer's next measure, not the instant the music starts. Revisits *beat-synced wireframes* from the roadmap's *Dropped* list,
which turned them down for want of a "music is playing" signal. Each of the site's three sound
sources can give one, so the reason no longer holds. No backend; independent of the lab specs.
Reads the stems mixer of [stems vol. 2](2026-10-15-stems-vol2-design.md) when it has a track, and
doesn't wait for one.

## Context

Goal: make the three.js background react to the music a visitor plays on the site — SoundCloud,
the `acid` synth or the stems mixer — within the motion rules and without a single flash.

The field already reacts to a lot: the section, the weather, the season, the pointer, presence and
`wall`'s ripple, the glitch, the completionist palette. It doesn't react to the one thing on the
site that is about rhythm. *Dropped* says why: beat-synced wireframes "need a 'SoundCloud is
playing' signal the music section doesn't have (`useMusicPlayer` is only a remount nonce), plus
per-track tempo entered by hand". Both halves have answers now:

- **`acid` and the stems mixer are the site's own Web Audio graphs.** They can be heard directly
  through an `AnalyserNode`, and both already keep an exact clock: `acid`'s engine knows the step
  sounding now and the pattern's tempo, and the stems engine knows its position in the loop and,
  with vol. 2, the track's `bpm`. Their beat is a fact, not a detection.
- **SoundCloud can't be heard, only followed.** Its audio plays inside a cross-origin frame, so no
  analyser can reach it. The widget does report play, pause and position over `postMessage`, and a
  tempo can be entered by hand per track, which is the second half *Dropped* asked for.

## The signal — `lib/music-signal.ts`

One small module that every source attaches to and the background reads:

```ts
export interface MusicSource {
  id: 'acid' | 'stems' | 'soundcloud'
  /** Beats since the grid's first downbeat, fractional, by the source's own clock; null without a tempo. */
  beats: () => number | null
  bpm: number | null
  /** Fills a buffer the caller owns with 0–255 frequency bins; absent when the source can't be heard. */
  spectrum?: (into: Uint8Array) => void
}

/** Attaches a source and returns its detach; the source started last is the one the field follows. */
export function attachMusic(source: MusicSource): () => void
export function currentMusic(): MusicSource | null
```

- A source attaches when it starts sounding and detaches when it stops, pauses, or its tab is
  hidden (`acid` and the stems mixer already stop on a hidden tab).
- Not reactive: the background reads `currentMusic()` at draw time, as it reads colours, so
  nothing re-renders and nothing allocates per frame.
- Imported only by lazy chunks (the background, `acid`, the mixer, the SoundCloud bridge), so the
  home page's eager chunk doesn't grow.

## The three sources

### `acid`

- An `AnalyserNode` (`fftSize` 256) in series just before the destination, so every browser pulls
  it; an analyser hanging off a branch with no output isn't reliably processed.
- `beats()` is the engine's current step over four (sixteenth-note steps), plus how far into that
  step the audio clock is. `bpm` is the pattern's.
- Attaches on play, detaches on stop, from both the tool and the shell's `acid`.

### The stems mixer

- An analyser in series after the limiter, so it hears the mix as the visitor set it: soloing the
  kick makes the field follow the kick.
- `beats()` is `engine.position()` times `bpm` over 60. The prep script's whole-bar check puts the
  excerpt's start on a downbeat, so beat 0 is one.
- Without a `bpm` (a track entered by hand without one), `beats()` is null and the field follows
  the level alone.

### SoundCloud

- **A bridge**, `components/music/soundcloud-bridge.ts`, imported when the visitor loads the
  player (`loadPlayer()`), never before: the frame waits behind a button for its cookies, and the
  bridge waits with it.
- It speaks the widget's `postMessage` protocol by hand: asks the frame for `play`, `pause`,
  `finish` and `playProgress` events, and for the current sound on each `play`. It accepts
  messages only from `https://w.soundcloud.com`, parses them defensively (another origin's input,
  like a save link's), and ignores anything it doesn't know.
- **The protocol is the risk.** It is what SoundCloud's own `api.js` sends, not a documented
  contract. Read `api.js` before building and match it exactly. If SoundCloud changes it, the
  bridge hears nothing and the field simply doesn't react, which is the degraded path. The
  alternative, loading `api.js` itself once the player is loaded, adds `https://w.soundcloud.com`
  to `script-src`, and the comment in `useMusicPlayer.ts` records the site's choice not to; that
  stays the owner's call, and this spec doesn't make it.
- **The tempo is entered by hand**, in `content/music.ts`: `tempos`, keyed by a track's permalink
  path, each `{ bpm, firstBeatMs }`. `beats()` is the widget's position less `firstBeatMs`, times
  `bpm` over 60, re-anchored on every `playProgress` so it can't drift. A track with no entry has
  no beat: the field follows "playing" alone.
- No `spectrum`: there is nothing to hear.
- The bridge also gives `useMusicPlayer` the play state it never had, so the comment there that
  SoundCloud offers no post-load API is updated to say what the bridge does.

## How the field reacts — `components/music-react.ts`

A pure function, like `ripple.ts`, from the current source, the elapsed time and the frame factor
`f` to a handful of numbers `ThreeBackground` multiplies in. It holds its envelopes in a few
preallocated numbers and allocates nothing. Every term scales by `f` or eases with `ease(k, f)`,
as the loop's other terms do.

| Input | Drives | Bound |
|---|---|---|
| The level: RMS of the spectrum, 250 ms attack, 600 ms release | the drift speed, multiplied in beside the weather's and the season's | ×1 to ×1.6 |
| The low band (the kick and the bass) | the shapes' scale, a slow breath | at most +6 % |
| Each beat, from `beats()` | a scale pulse on every shape, eased out | at most +4 % |
| Each bar's downbeat | a ripple through `ripple.ts` from the centre | a third of `wall`'s amplitude, at most one per 1.5 s |
| "Playing" with no spectrum (SoundCloud) | a constant lift instead of the level | ×1.2 speed |

### No flashing

The music on this site runs at 150 to 200 BPM, three beats a second and more, which is exactly the
rate at which flashing becomes a seizure risk (WCAG 2.3.1 sets the line at three flashes a
second). So:

- **Beats move geometry, never light.** Scale, position and the ripple follow the beat; opacity,
  colour and brightness never do.
- Opacity may follow the level envelope only, within ±10 %, and only through its 600 ms release,
  so it can't swing at beat rate.
- A spec holds it: a 200 BPM beat train and a square-wave level, run through `music-react.ts` at
  60 frames a second for ten seconds, never move opacity by more than 0.1 within any 333 ms
  window, and beats never touch the colour terms at all.

### Motion

- *full*: everything in the table.
- *calm*: the level envelope only, on speed. No pulses, no ripples. Calm is for a visitor who
  wants the page to move less, and a beat is movement.
- *paused*: nothing, and the background isn't even loaded at *paused*, as today.
- `scene music off` turns the reaction off for the session and `scene music on` back, beside the
  other `scene` flags, unsaved like them.

### Seen from the rest of the site

- X-ray's canvas tag adds what the field is following:
  `ThreeBackground.vue · 18 shapes · listening to acid, 138 BPM`.
- Nothing is stored and nothing leaves the page: the spectrum is read into a buffer and
  overwritten next frame, and from SoundCloud the bridge reads only play state, position and the
  permalink.

## Tests

- `music-signal.ts`: attach, detach, the last started wins, detaching the current one falls back
  to the one before it if it's still attached.
- `acid`: steps to beats across a pattern's tempo change. The stems: position and `bpm` to beats,
  and null without a `bpm`.
- The SoundCloud bridge: messages from any other origin are ignored; malformed JSON, unknown
  methods and missing fields are ignored; `playProgress` re-anchors the beat; a track without a
  tempo gives a null `beats()`.
- `music-react.ts`: each row of the table against its bound; `f` scaling at 30 and 60 frames a
  second gives the same motion; the flash spec above; *calm* gives no pulses and no ripples.
- A content spec: every `tempos` entry has a positive `bpm` and a non-negative `firstBeatMs`.
- No e2e: WebGL isn't in reach, and the pure functions carry the behaviour.

## Out of scope

- Detecting beats from audio. The two sources that can be heard already know their beat exactly,
  and the one that can't be heard can't be analysed either.
- The radio room's SoundCloud and YouTube players. They have their own frames and a host's clock;
  they can attach to the same signal later.
- An ambient drone, which *Dropped* turned down with the wireframes. It stays dropped.
- Colour that follows the music. It is the most obvious reaction and the one the flash rule rules
  out.
