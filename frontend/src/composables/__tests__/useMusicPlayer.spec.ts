import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope, nextTick } from 'vue'
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
 * The frame's colour is read when a frame is built, never while one is up. Found after the
 * button went in: setup and the frame's mount stopped being the same moment, and a scheme
 * picked in between was ignored until `play`.
 */
describe('useMusicEmbed', () => {
  const root = document.documentElement
  const colourOf = (src: string) => new URL(src).searchParams.get('color')
  let scope: EffectScope | undefined

  // `useMusicPlayer` and `useTheme` from the same fresh module graph, as on a page load.
  async function load() {
    vi.resetModules()
    const player = await import('../useMusicPlayer')
    const theme = await import('../useTheme')
    scope = effectScope()
    const embed = scope.run(() => player.useMusicEmbed())!
    return { ...player, ...theme, embed }
  }

  beforeEach(() => {
    window.localStorage.clear()
    root.removeAttribute('style')
  })

  afterEach(() => {
    scope?.stop()
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

  // A new `src` reloads the cross-origin player and stops it.
  it('leaves a live frame alone when the scheme changes', async () => {
    const { embed, setTheme } = await load()
    embed.load()
    const before = embed.src.value

    setTheme('nord')

    expect(embed.src.value).toBe(before)
  })

  it('takes the scheme again when `play` remounts the frame', async () => {
    const { embed, requestPlayback, setTheme } = await load()
    embed.load()
    setTheme('nord')

    requestPlayback()
    await nextTick()

    expect(colourOf(embed.src.value)).toBe(root.style.getPropertyValue('--neon-green'))
    expect(new URL(embed.src.value).searchParams.get('auto_play')).toBe('true')
  })
})
