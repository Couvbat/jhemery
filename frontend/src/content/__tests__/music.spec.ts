// @vitest-environment node
// No DOM at all: `content/` is imported by the résumé plugin at build time, so the embed
// builder must take its colour as an argument rather than reading the page.
import { describe, expect, it } from 'vitest'
import { EMBED_FALLBACK_COLOUR, embedColour, music, soundcloudEmbedSrc } from '../music'

describe('the SoundCloud embed', () => {
  it('builds the playlist widget from its arguments alone', () => {
    const url = new URL(soundcloudEmbedSrc('#fe8019'))
    expect(url.origin + url.pathname).toBe('https://w.soundcloud.com/player/')
    expect(url.searchParams.get('url')).toBe(music.playlistUrl)
    expect(url.searchParams.get('color')).toBe('#fe8019')
    expect(url.searchParams.get('visual')).toBe('false')
  })

  // `&auto_play=true` used to be appended after the `false` already in the string.
  it('says auto_play exactly once, either way', () => {
    expect(new URL(soundcloudEmbedSrc('#fe8019', true)).searchParams.getAll('auto_play')).toEqual(['true'])
    expect(new URL(soundcloudEmbedSrc('#fe8019')).searchParams.getAll('auto_play')).toEqual(['false'])
  })

  // The colour comes off a custom property and goes into another origin's URL.
  it('only lets a plain hex through, and falls back to the site green otherwise', () => {
    expect(embedColour(' #FE8019 ')).toBe('#fe8019')
    for (const odd of ['', 'oklch(0.85 0.3 145)', '#fff', '#fe8019ff', 'red', '#fe8019&visual=true']) {
      expect(embedColour(odd), odd).toBe(EMBED_FALLBACK_COLOUR)
    }
    expect(new URL(soundcloudEmbedSrc('javascript:alert(1)')).searchParams.get('color')).toBe(EMBED_FALLBACK_COLOUR)
  })
})
