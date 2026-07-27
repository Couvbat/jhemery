# SoundCloud embed for the Music section

## Context

The "Terminal music player mock" card in [`MusicSection.vue`](../../../frontend/src/components/sections/MusicSection.vue)
is a fake `ncmpcpp`-styled player: hardcoded "now playing" text, a static ASCII progress
bar, and a link to `soundcloud.com/couvbat`. It doesn't actually play anything.

Goal: replace the fake content with a real, playable embed of a curated SoundCloud
playlist, while keeping the card's existing terminal-window chrome (colored dots +
title bar) so it stays visually consistent with the rest of the site.

## Decisions

- **Content**: embed the playlist `https://soundcloud.com/couvbat/sets/mes-sons`
  (already created), not the full profile or a single track.
- **Framing**: keep the existing outer `div.rounded border border-border bg-card
  overflow-hidden` wrapper and the title-bar div (dots + `ncmpcpp — music player`
  label) untouched. Only the inner content (currently lines 74–94 of
  `MusicSection.vue`) is replaced.
- **Embed mechanism**: a plain `<iframe>` using SoundCloud's public embed URL — no
  Widget JS API, no custom playback UI. Considered building a fully custom
  progress-bar/controls synced via `w.soundcloud.com/player/api.js` (Approach B) to
  more closely match the old ASCII mock, but rejected for now: meaningfully more code
  (event wiring, lifecycle, state sync) for a portfolio site where the plain widget
  already satisfies the ask. Can be revisited later as an enhancement if desired.
- **Widget appearance**: compact mode (`visual=false`), not the tall cover-art layout
  or a full scrolling tracklist — matches the small footprint of the current mock.
  Height ~166px.
- **Theming**: `color=%2300ff41` ties the widget's waveform/button tint to the site's
  `--neon-green` custom property.
- **Playback**: `auto_play=false` — no audio on page load.
- **Credit link**: the existing "Listen on SoundCloud: soundcloud.com/couvbat" line
  stays below the iframe as a fallback/direct link to the profile.

## Implementation

In `MusicSection.vue`:

1. Add a `const PLAYLIST_URL = 'https://soundcloud.com/couvbat/sets/mes-sons'` next to
   the existing `genres`/`tools` constants.
2. Replace the inner `<div class="p-4 font-mono text-xs space-y-2">...</div>` block
   (the fake now-playing text) with:
   - an `<iframe>` pointed at
     `https://w.soundcloud.com/player/?url=<encodeURIComponent(PLAYLIST_URL)>&color=%2300ff41&auto_play=false&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false&visual=false`,
     `width="100%"`, `height="166"`, `frameborder="0"`, `allow="autoplay"`.
   - the existing "Listen on SoundCloud" credit line, kept below the iframe.

No new props, state, or API calls — this is a static embed, consistent with how
`genres`/`tools` are already hardcoded in this file.

## Error handling

None added. If an ad-blocker blocks the SoundCloud iframe (common), the box renders
blank. Accepted limitation for a portfolio site — not worth fallback UI.

## Verification

Manual: load the page, confirm the widget renders and plays, confirm the green tint
is applied, confirm the card doesn't break layout at mobile/desktop widths (same grid
the card already sits in).

## Out of scope

- Widget JS API / fully custom playback UI (Approach B) — noted above as a possible
  future enhancement, not built now.
- Steam game-log integration — separate feature, tracked independently.
