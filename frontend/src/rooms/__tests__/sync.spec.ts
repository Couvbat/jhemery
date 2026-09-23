import { describe, expect, it } from 'vitest'
import {
  ClockSkew,
  DRIFT_SECONDS,
  expectedPosition,
  formatClock,
  isSeek,
  mediaLabel,
  normaliseCode,
  parseMedia,
  parseSoundCloud,
  parseYouTube,
  reconcile,
  soundcloudEmbed,
  youtubeEmbed,
} from '../sync'

const T0 = 1_700_000_000_000

describe('rooms sync', () => {
  describe('normaliseCode', () => {
    it('accepts a code in any case, with spaces, or inside a room link', () => {
      expect(normaliseCode('abcde')).toBe('ABCDE')
      expect(normaliseCode('  AB3DE ')).toBe('AB3DE')
      expect(normaliseCode('https://jhemery.xyz/watch/ab3de')).toBe('AB3DE')
      expect(normaliseCode('https://jhemery.xyz/radio/AB3DE?x=1#y')).toBe('AB3DE')
    })

    it('refuses anything that is not five letters or digits', () => {
      for (const bad of ['', 'abcd', 'abcdef', 'ab-de', 'https://jhemery.xyz/tools/json']) {
        expect(normaliseCode(bad)).toBeNull()
      }
    })
  })

  describe('parseYouTube', () => {
    const id = 'aqz-KE-bpKQ'

    it('finds the id in every URL shape, and takes a bare id', () => {
      for (const input of [
        id,
        `https://www.youtube.com/watch?v=${id}`,
        `https://youtube.com/watch?t=42&v=${id}&list=PL1`,
        `https://m.youtube.com/watch?v=${id}`,
        `https://music.youtube.com/watch?v=${id}`,
        `https://youtu.be/${id}?si=abc`,
        `https://www.youtube.com/shorts/${id}`,
        `https://www.youtube.com/embed/${id}`,
        `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
        `https://www.youtube.com/live/${id}`,
      ]) {
        expect(parseYouTube(input), input).toBe(id)
      }
    })

    it('refuses other hosts, malformed ids and playlists without a video', () => {
      for (const bad of [
        'https://vimeo.com/12345',
        'https://www.youtube.com/playlist?list=PL1',
        'https://www.youtube.com/watch?v=tooshort',
        'https://evil.com/watch?v=aqz-KE-bpKQ',
        'not a url or id',
      ]) {
        expect(parseYouTube(bad), bad).toBeNull()
      }
    })
  })

  describe('parseSoundCloud', () => {
    it('canonicalises a track or set URL', () => {
      expect(parseSoundCloud('https://soundcloud.com/couvbat/abysses?utm_source=x#t=1')).toBe(
        'https://soundcloud.com/couvbat/abysses',
      )
      expect(parseSoundCloud('http://m.soundcloud.com/couvbat/sets/mon-bruit/')).toBe(
        'https://soundcloud.com/couvbat/sets/mon-bruit',
      )
    })

    it('refuses profiles, other hosts and non-URLs', () => {
      for (const bad of ['https://soundcloud.com/couvbat', 'https://soundcloud.com.evil.com/a/b', 'https://spotify.com/a/b', 'couvbat/abysses']) {
        expect(parseSoundCloud(bad), bad).toBeNull()
      }
    })

    it('is what parseMedia dispatches to, per kind', () => {
      expect(parseMedia('watch', 'https://youtu.be/aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ')
      expect(parseMedia('radio', 'https://youtu.be/aqz-KE-bpKQ')).toBeNull()
      expect(parseMedia('radio', 'https://soundcloud.com/couvbat/abysses')).toBe('https://soundcloud.com/couvbat/abysses')
      expect(mediaLabel('radio', 'https://soundcloud.com/couvbat/abysses')).toBe('couvbat/abysses')
      expect(mediaLabel('watch', 'aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ')
    })
  })

  describe('drift', () => {
    const playing = { media: 'x', position: 100, playing: true, at: T0 }
    const paused = { ...playing, playing: false }

    it('projects a playing position forward and holds a paused one', () => {
      expect(expectedPosition(playing, T0 + 5_000)).toBe(105)
      expect(expectedPosition(paused, T0 + 5_000)).toBe(100)
      expect(expectedPosition(playing, T0 - 500_000)).toBe(0)
    })

    it('seeks only past the threshold, and follows play/pause', () => {
      expect(reconcile(playing, { position: 104, playing: true }, T0 + 5_000)).toEqual({ seekTo: null, play: null })
      expect(reconcile(playing, { position: 105 - DRIFT_SECONDS - 0.1, playing: true }, T0 + 5_000)).toEqual({
        seekTo: 105,
        play: null,
      })
      expect(reconcile(playing, { position: 105, playing: false }, T0 + 5_000)).toEqual({ seekTo: null, play: true })
      expect(reconcile(paused, { position: 130, playing: true }, T0 + 5_000)).toEqual({ seekTo: 100, play: false })
    })

    it('tells a seek from ordinary progress', () => {
      expect(isSeek({ position: 10, at: T0 }, { position: 11, at: T0 + 1_000 }, true)).toBe(false)
      expect(isSeek({ position: 10, at: T0 }, { position: 40, at: T0 + 1_000 }, true)).toBe(true)
      expect(isSeek({ position: 10, at: T0 }, { position: 10, at: T0 + 60_000 }, false)).toBe(false)
      expect(isSeek({ position: 10, at: T0 }, { position: 12, at: T0 + 60_000 }, false)).toBe(true)
    })

    it('estimates the server clock from the earliest-arriving frame and ignores heartbeats', () => {
      const skew = new ClockSkew()
      expect(skew.serverNow(T0)).toBe(T0)
      skew.sample(T0, T0 + 30_250) // the guest's clock is 30 s ahead, plus 250 ms of latency
      skew.sample(T0, T0 + 55_000) // a heartbeat resending the same `at` is not a sample
      skew.sample(T0 + 1_000, T0 + 1_000 + 30_080) // a quicker frame is a better one
      expect(skew.serverNow(T0 + 60_000)).toBe(T0 + 60_000 - 30_080)
    })
  })

  describe('embeds', () => {
    it('turns the message API on and names the page as origin', () => {
      const url = new URL(youtubeEmbed('aqz-KE-bpKQ', 'https://jhemery.xyz', false))
      expect(url.origin).toBe('https://www.youtube-nocookie.com')
      expect(url.pathname).toBe('/embed/aqz-KE-bpKQ')
      expect(url.searchParams.get('enablejsapi')).toBe('1')
      expect(url.searchParams.get('origin')).toBe('https://jhemery.xyz')
      expect(url.searchParams.get('controls')).toBe('0')
      expect(new URL(youtubeEmbed('aqz-KE-bpKQ', 'https://jhemery.xyz', true)).searchParams.get('controls')).toBe('1')
    })

    it('embeds the widget with the shop closed', () => {
      const url = new URL(soundcloudEmbed('https://soundcloud.com/couvbat/abysses'))
      expect(url.origin).toBe('https://w.soundcloud.com')
      expect(url.searchParams.get('url')).toBe('https://soundcloud.com/couvbat/abysses')
      expect(url.searchParams.get('buying')).toBe('false')
      expect(url.searchParams.get('sharing')).toBe('false')
    })
  })

  it('formats a clock', () => {
    expect(formatClock(7)).toBe('0:07')
    expect(formatClock(754)).toBe('12:34')
    expect(formatClock(3723.9)).toBe('1:02:03')
    expect(formatClock(-3)).toBe('0:00')
  })
})
