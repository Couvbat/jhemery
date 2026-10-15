# Design spec — stems, vol. 2: see the track, read its notes, and get one in

Status: implemented with roadmap §K; the list still ships empty. One addition: `StemTrack` takes an optional `beatsPerBar`, which the script's bar check and the transport's step both read. Extends §J's *Stems* (#152). Its engine, mix codes, limits and
placement in the music section all stay; this adds what the first version left for later.

## Context

Goal: turn the stems mixer into a player worth opening: waveforms before any audio loads, a
playhead that seeks, notes on how each stem was made, and a script that turns DAW exports into a
track.

#152 shipped the mixer: mute, solo and level per stem, a low-pass over the mix, a sample-locked
looping excerpt, mix codes shared as `/?mix=` links, and a cap on decoded size. `stemTracks` is
still an empty list, so none of it has ever rendered, and the mixer only appears once there is a
track. Two things stand between the code and a first track:

- **Preparing one is manual.** Cut the same excerpt from every stem at the same sample, encode
  each to AAC, count the bytes, write the entry, and hope the loop point lands on a bar. The
  spec that holds `bytes` to the file catches a mistake after the fact; nothing helps make it
  right the first time.
- **Loaded, it is faders without a picture.** There is nothing to see until a visitor has paid
  for megabytes of audio and pressed play, and nothing that says what they are hearing.

Four parts, plus a command: a prep script, waveform lanes from precomputed peaks, seeking, and
liner notes.

## 1. `frontend/scripts/stems.mjs`

`npm run stems -- <folder>`, beside `scripts/build-wordlists.mjs`. A dev-time script that calls
the system's `ffmpeg` and `ffprobe`; principle 5 is about runtime dependencies, and nothing here
ships.

**Input:** a folder of stems exported from the DAW (WAV, AIFF or FLAC, all from bar 1, all the
same length, which is how FL Studio and Ableton export them), and a `track.json`:

```json
{
  "id": "night-shift",
  "title": "Night Shift",
  "start": "1:04.000",
  "seconds": 32,
  "bpm": 165,
  "key": "F minor",
  "daw": "FL Studio",
  "url": "https://soundcloud.com/couvbat/…",
  "note": { "en": "…", "fr": "…" },
  "stems": [
    { "file": "Kick.wav", "id": "kick", "name": { "en": "Kick", "fr": "Kick" }, "chain": ["DR910", "Valhalla Room"] }
  ]
}
```

Stems separated from a finished master (Demucs, UVR) work as well as DAW exports: they come out
aligned and the same length. They sum close to the master rather than exactly to it, and the
limiter that already sits after the filter catches the difference.

**What it does, refusing with a table of what's wrong at the first failed check:**

1. Probes every input: one sample rate, one length to the millisecond, at most `MAX_STEMS`.
2. Warns when `seconds` isn't a whole number of bars at `bpm` (four beats a bar unless the json
   says otherwise). A loop that isn't a whole number of bars jars at the seam, and that is the
   one musical mistake a script can catch.
3. Cuts `[start, start + seconds]` sample-accurately from each stem (seeking after the input, or
   `atrim`, never a keyframe seek).
4. Encodes AAC-LC at 192 kb/s, 48 kHz stereo, as `.m4a` with `+faststart`, into
   `public/stems/<id>/`.
5. Checks the decoded cost against `MAX_DECODED_BYTES`: eight stems of 32 s is about 98 MB, under
   the 160 MB cap.
6. Writes `peaks.json` (part 2).
7. **Prints** the `StemTrack` literal, bytes filled in, to paste into `content/stems.ts`. It
   prints rather than edits: a script rewriting a content module is a write that drifts, and the
   existing bytes spec catches a stale paste.

**A seam to listen for:** AAC encoders add priming and padding samples, and browsers trim them
differently. Every stem goes through one encoder with one setting, so the stems stay locked to
each other; the risk is a gap at the loop point. The engine loops over the shortest buffer
today; it should loop over exactly `track.seconds` instead (`loopStart`/`loopEnd` on each
source), which removes the padding from the question. Listen to the seam in Chrome, Firefox and
Safari before the first track ships.

## 2. Peaks and waveform lanes

- `public/stems/<id>/peaks.json`: `{ "v": 1, "points": 480, "stems": { "kick": "<base64>" } }`,
  each value the stem's absolute peak per bucket as one byte. About 4 kB for eight stems.
- **Normalised per track, not per stem**, with a square-root curve: the lanes show the balance
  of the mix, which is the point of a mixer, and the curve keeps a quiet pad visible beside the
  kick.
- **Fetched when the mixer mounts**, before the visitor loads any audio. The waveforms are the
  preview: 4 kB that show what the megabytes will be. The mixer is already its own chunk and
  already mounts only when there is a track.
- Each stem row becomes name, lane, mute, solo, level. A lane's opacity follows its gain, so
  muting a stem greys its waveform.
- Lanes are canvases, `aria-hidden`; the row's controls are what assistive technology reads, as
  today. Colours are read from the tokens at draw time and redrawn on a scheme switch, as
  CLAUDE.md requires of anything that reads colours in JS.
- **One playhead** crosses every lane, from `engine.position()`. It is information, not
  decoration, but it moves, so it follows the motion level: every frame at *full*, ten times a
  second at *calm*, once a second at *paused*.
- Live level meters are left out: the waveform already shows where the energy is, and eight
  analysers a frame is not free on a phone.

## 3. Seeking

- `engine.seek(seconds)`. Playing, it books a new source per stem at one `when` with the new
  offset and stops the old ones at that same `when`, so the stems stay sample-locked across the
  jump exactly as they do across a loop. Paused, it stores the offset for `play()`.
- Clicking or dragging on any lane seeks.
- A transport `<input type="range">` does the same from the keyboard, with `aria-valuetext`
  such as *0:12 of 0:32*. The arrow keys step one bar when the track has a `bpm`, one second
  when it doesn't.
- Mix codes are unchanged: a mix is levels, not a position. `MIX_VERSION` stays 1.

## 4. Liner notes

- `StemTrack` gains optional `bpm`, `key`, `daw` and `released` (an ISO date). `Stem` gains an
  optional `chain`, its plugins in order. All are facts, so plain strings, not `Localised`.
- The mixer's header reads `Night Shift · 165 BPM · F minor · FL Studio`, and each stem has a
  disclosure for its chain: `Serum 2 → OTT → Valhalla Room`.
- `content/stems.ts` is read on the home page, whose byte budget is nearly spent, so the new
  fields cost bytes only where they are filled, and anything computed from them stays in the
  mixer's chunk (the rule §J's review set for this file).

## 5. The `stems` command

- `stems` lists the tracks: title, BPM, key, excerpt length, how many stems, and where to open
  them.
- `stems <id>` goes to `/#music` with that track selected, through the existing mix-code path
  with a default mix.
- `group: 'content'`, `writes: 'none'`, linkable, with the track ids offered for Tab. Listed in
  `help` even while the list is empty, as `calendar` is, because a linkable command can't be
  hidden. Empty, it says no stems are published yet.
- Off the curl pages: there is no audio in a terminal.

## Tests

- The script's pure parts in `scripts/stems-lib.mjs`, under vitest: bar arithmetic and the
  whole-bar warning, peak bucketing and normalisation, the printed literal. The `ffmpeg` calls
  are not unit-tested.
- `components/stems/peaks.ts`, pure: decoding a peaks file and the lane geometry, beside the
  existing `stems.spec.ts`.
- The engine: `seek()` books every source at one `when`, playing and paused; the loop is
  `track.seconds` long.
- A content spec: every track has a `peaks.json` with one entry per stem and the declared number
  of points, alongside the existing bytes check.
- No e2e: the list ships empty, and jsdom reaches all of the above.

## For the owner to decide

- Which track goes first, and where its excerpt starts. Its stems are still to be extracted, so
  the code can ship ahead of them: with the list empty, the mixer stays hidden as it is today.
- A licence line in the track's `note`. Stems served from `public/` can be fetched by anyone; the
  note can say what they are for (listening and remixing here, say, and not release).

## Out of scope

- Whole tracks. Holding every stem decoded is what keeps them locked, and the reason #152 chose
  an excerpt; media elements can't promise the same lock.
- A studio log of a track's versions, from loop to master. It was in the brainstorm and deserves
  its own row.
- Downloading the stems as an archive, and rendering a mix to a file.
- Beat-synced wireframes, which have [a spec of their own](2026-10-15-music-reactive-field-design.md):
  the mixer attaches to it with an analyser after the limiter and its `bpm`, and that spec doesn't
  wait for a track.
