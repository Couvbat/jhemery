import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope, nextTick, ref } from 'vue'
import { EMBED_FALLBACK_COLOUR } from '@/content/music'

/**
 * The SoundCloud frame waits behind a button (see `MusicSection`), and two things count as
 * asking for it: the button, and `play`. The state is module-level, so each case re-imports.
 */
describe('useMusicPlayer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('keeps the player unloaded until asked', async () => {
    const { useMusicPlayer } = await import('../useMusicPlayer')
    expect(useMusicPlayer().playerLoaded.value).toBe(false)
  })

  it('loads it when the button asks, without autoplaying', async () => {
    const { useMusicPlayer } = await import('../useMusicPlayer')
    const player = useMusicPlayer()
    player.loadPlayer()
    expect(player.playerLoaded.value).toBe(true)
    expect(player.autoplayNonce.value).toBe(0)
  })

  it('loads it when `play` asks, and plays', async () => {
    const { requestPlayback, useMusicPlayer } = await import('../useMusicPlayer')
    requestPlayback()
    expect(useMusicPlayer().playerLoaded.value).toBe(true)
    expect(useMusicPlayer().autoplayNonce.value).toBe(1)
  })
})

/**
 * The frame's colour follows the chosen scheme, except while the player plays: a new `src`
 * reloads the cross-origin player and stops it, so a scheme picked then waits until it
 * stops. Twice a bug: first a scheme picked before the button was ignored until `play`,
 * then one picked after it was ignored for good.
 */
describe('useMusicEmbed', () => {
  const root = document.documentElement
  const colourOf = (src: string) => new URL(src).searchParams.get('color')
  const autoplayOf = (src: string) => new URL(src).searchParams.get('auto_play')
  let scope: EffectScope | undefined
  let iframe: HTMLIFrameElement

  // `useMusicPlayer` and `useTheme` from the same fresh module graph, as on a page load.
  async function load() {
    vi.resetModules()
    const player = await import('../useMusicPlayer')
    const theme = await import('../useTheme')
    scope = effectScope()
    const embed = scope.run(() => player.useMusicEmbed(ref(iframe)))!
    return { ...player, ...theme, embed }
  }

  /** The widget saying something, from its frame on its origin unless told otherwise. */
  function widget(method: string, value?: unknown, from: { origin?: string; source?: Window | null } = {}) {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ method, value }),
        origin: from.origin ?? 'https://w.soundcloud.com',
        source: from.source === undefined ? iframe.contentWindow : from.source,
      }),
    )
  }

  beforeEach(() => {
    window.localStorage.clear()
    root.removeAttribute('style')
    iframe = document.createElement('iframe')
    document.body.append(iframe)
  })

  afterEach(() => {
    scope?.stop()
    iframe.remove()
    vi.useRealTimers()
    root.removeAttribute('style')
    root.removeAttribute('data-theme')
    root.removeAttribute('data-mode')
  })

  it('draws the frame in a scheme picked before the button was pressed', async () => {
    const { embed, setTheme } = await load()
    expect(colourOf(embed.src.value)).toBe(EMBED_FALLBACK_COLOUR)

    setTheme('nord')
    const nord = root.style.getPropertyValue('--neon-green')
    expect(nord).not.toBe(EMBED_FALLBACK_COLOUR)
    embed.load()

    expect(colourOf(embed.src.value)).toBe(nord)
  })

  it('repaints a frame that isn’t playing when the scheme changes, without starting it', async () => {
    const { embed, setTheme } = await load()
    embed.load()

    setTheme('nord')
    await nextTick()

    expect(colourOf(embed.src.value)).toBe(root.style.getPropertyValue('--neon-green'))
    expect(autoplayOf(embed.src.value)).toBe('false')
  })

  it('leaves a playing frame alone, and repaints it once it has stopped', async () => {
    vi.useFakeTimers()
    const { embed, setTheme, STOP_GRACE_MS } = await load()
    embed.load()
    const before = embed.src.value
    widget('play')

    setTheme('nord')
    await nextTick()
    expect(embed.src.value).toBe(before)

    widget('pause')
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS - 1)
    expect(embed.src.value).toBe(before)
    await vi.advanceTimersByTimeAsync(1)
    expect(colourOf(embed.src.value)).toBe(root.style.getPropertyValue('--neon-green'))
  })

  it('doesn’t take the gap between two tracks for a stop', async () => {
    vi.useFakeTimers()
    const { embed, setTheme, STOP_GRACE_MS } = await load()
    embed.load()
    const before = embed.src.value
    widget('play')
    setTheme('nord')
    await nextTick()

    widget('finish')
    await vi.advanceTimersByTimeAsync(300)
    widget('play')
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS * 2)

    expect(embed.src.value).toBe(before)
  })

  // Review of #159: a queued repaint outlived a return to the frame's own colour, and the
  // next pause reloaded an unchanged frame, losing the place and `auto_play`.
  it('forgets a queued repaint when the scheme goes back to the frame’s colour', async () => {
    vi.useFakeTimers()
    const { embed, requestPlayback, setTheme, STOP_GRACE_MS } = await load()
    requestPlayback()
    await nextTick()
    const before = embed.src.value

    setTheme('nord')
    await nextTick()
    setTheme('cyberpunk')
    await nextTick()
    widget('pause')
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS * 2)

    expect(embed.src.value).toBe(before)
    expect(autoplayOf(embed.src.value)).toBe('true')
  })

  // Review of #159: the delayed repaint read whatever was painted when it fired, a preview's
  // colour included, and the frame kept it after the preview ended.
  it('paints the scheme picked, not a preview showing when the player stops', async () => {
    vi.useFakeTimers()
    const { embed, setTheme, previewTheme, STOP_GRACE_MS } = await load()
    embed.load()
    widget('play')
    setTheme('nord')
    await nextTick()
    const nord = root.style.getPropertyValue('--neon-green')

    const restore = previewTheme('dracula')!
    expect(root.style.getPropertyValue('--neon-green')).not.toBe(nord)
    widget('pause')
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS)
    restore()

    expect(colourOf(embed.src.value)).toBe(nord)
  })

  // Review of #159: a scheme picked just after `finish` reloaded at once, cutting off the
  // next track the grace is there to wait for.
  describe('a scheme picked in the grace after a stop', () => {
    it('waits out the grace, and is dropped for good if the next track starts', async () => {
      vi.useFakeTimers()
      const { embed, setTheme, STOP_GRACE_MS } = await load()
      embed.load()
      const before = embed.src.value
      widget('play')
      widget('finish')
      await vi.advanceTimersByTimeAsync(200)

      setTheme('nord')
      await nextTick()
      expect(embed.src.value).toBe(before)

      widget('play')
      await vi.advanceTimersByTimeAsync(STOP_GRACE_MS * 2)
      expect(embed.src.value).toBe(before)
    })

    it('is painted when the grace from the stop runs out, not from the pick', async () => {
      vi.useFakeTimers()
      const { embed, setTheme, STOP_GRACE_MS } = await load()
      embed.load()
      widget('play')
      widget('finish')
      await vi.advanceTimersByTimeAsync(STOP_GRACE_MS - 500)

      setTheme('nord')
      await nextTick()
      const nord = root.style.getPropertyValue('--neon-green')
      expect(colourOf(embed.src.value)).not.toBe(nord)

      await vi.advanceTimersByTimeAsync(500)
      expect(colourOf(embed.src.value)).toBe(nord)
    })

    it('takes the latest of two picks, one before the stop and one during its grace', async () => {
      vi.useFakeTimers()
      const { embed, setTheme, STOP_GRACE_MS } = await load()
      embed.load()
      widget('play')
      setTheme('nord')
      await nextTick()
      widget('pause')
      await vi.advanceTimersByTimeAsync(500)

      setTheme('dracula')
      await nextTick()
      const dracula = root.style.getPropertyValue('--neon-green')
      expect(colourOf(embed.src.value)).not.toBe(dracula)

      await vi.advanceTimersByTimeAsync(STOP_GRACE_MS - 500)
      expect(colourOf(embed.src.value)).toBe(dracula)
    })
  })

  it('takes the scheme again when `play` remounts the frame', async () => {
    const { embed, requestPlayback, setTheme } = await load()
    embed.load()
    setTheme('nord')

    requestPlayback()
    await nextTick()

    expect(colourOf(embed.src.value)).toBe(root.style.getPropertyValue('--neon-green'))
    expect(autoplayOf(embed.src.value)).toBe('true')
  })

  it('takes a `play` remount as playing, until the frame says it is paused', async () => {
    vi.useFakeTimers()
    const { embed, requestPlayback, setTheme, STOP_GRACE_MS } = await load()
    requestPlayback()
    await nextTick()
    const before = embed.src.value

    setTheme('nord')
    await nextTick()
    expect(embed.src.value).toBe(before)

    // The browser wouldn't let it autoplay: a stopped player, and a repaint that stays stopped.
    widget('isPaused', true)
    await vi.advanceTimersByTimeAsync(STOP_GRACE_MS)
    expect(colourOf(embed.src.value)).toBe(root.style.getPropertyValue('--neon-green'))
    expect(autoplayOf(embed.src.value)).toBe('false')
  })

  it('hears only its own frame, on SoundCloud’s origin', async () => {
    const { embed, setTheme } = await load()
    embed.load()
    widget('play', undefined, { origin: 'https://evil.example' })
    widget('play', undefined, { source: window })

    setTheme('nord')
    await nextTick()

    expect(colourOf(embed.src.value)).toBe(root.style.getPropertyValue('--neon-green'))
  })

  it('ignores a preview: only the chosen scheme repaints the player', async () => {
    const { embed, previewTheme } = await load()
    embed.load()
    const before = embed.src.value

    previewTheme('nord')
    await nextTick()

    expect(embed.src.value).toBe(before)
  })

  it('subscribes from each load and asks whether it is paused, until the widget answers', async () => {
    vi.useFakeTimers()
    const { embed } = await load()
    const posted = vi.spyOn(iframe.contentWindow!, 'postMessage')

    embed.onFrameLoad()
    expect(posted.mock.calls.map(([message, origin]) => [JSON.parse(message as string), origin])).toEqual([
      [{ method: 'addEventListener', value: 'play' }, 'https://w.soundcloud.com'],
      [{ method: 'addEventListener', value: 'pause' }, 'https://w.soundcloud.com'],
      [{ method: 'addEventListener', value: 'finish' }, 'https://w.soundcloud.com'],
      [{ method: 'isPaused', value: null }, 'https://w.soundcloud.com'],
    ])

    await vi.advanceTimersByTimeAsync(500)
    expect(posted).toHaveBeenCalledTimes(8)
    widget('isPaused', true)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(posted).toHaveBeenCalledTimes(8)
  })

  // Found against the real widget: its own `ready` arrives first and ends the retries, so
  // the subscriptions sent before it listened would be the only ones.
  it('subscribes again when the widget says it is ready', async () => {
    vi.useFakeTimers()
    const { embed } = await load()
    const posted = vi.spyOn(iframe.contentWindow!, 'postMessage')
    embed.onFrameLoad()
    posted.mockClear()

    widget('ready', null)

    expect(posted.mock.calls.map(([message]) => JSON.parse(message as string).method)).toEqual([
      'addEventListener',
      'addEventListener',
      'addEventListener',
      'isPaused',
    ])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(posted).toHaveBeenCalledTimes(4)
  })

  it('gives up on a frame that never answers', async () => {
    vi.useFakeTimers()
    const { embed } = await load()
    const posted = vi.spyOn(iframe.contentWindow!, 'postMessage')
    embed.onFrameLoad()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(posted.mock.calls.length).toBe(20 * 4)
  })
})
