import { beforeEach, describe, expect, it, vi } from 'vitest'

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
