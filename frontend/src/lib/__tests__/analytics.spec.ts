import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The two things that can go wrong with a third-party tracker, neither of which
 * shows up as a test failure anywhere else: it loads when it was supposed to be
 * off (dev traffic in the production dashboard), and events fired before the
 * script arrives vanish. `analytics.ts` reads its config at module scope, so
 * every case re-imports the module under a different env.
 */
describe('analytics', () => {
  const SRC = 'https://umami.jhemery.xyz/script.js'
  const ID = '0f8c2c9e-1b3a-4d5e-9c7f-2a1b3c4d5e6f'

  /** Re-imports `analytics.ts` with `env` applied, so module-scope config is re-read. */
  async function load(env: Record<string, string> = {}) {
    vi.resetModules()
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
    return import('@/lib/analytics')
  }

  function tracker(): HTMLScriptElement | null {
    return document.querySelector('script[data-umami-tracker]')
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    document.head.querySelectorAll('script').forEach((el) => el.remove())
    delete window.umami
  })

  it('injects nothing when unconfigured', async () => {
    const { initAnalytics, track } = await load()

    initAnalytics()
    track('terminal-opened')

    expect(tracker()).toBeNull()
  })

  it('injects nothing when only one of the two settings is present', async () => {
    const { initAnalytics } = await load({ VITE_UMAMI_SRC: SRC })

    initAnalytics()

    expect(tracker()).toBeNull()
  })

  it('injects the tracker with the website ID once configured', async () => {
    const { initAnalytics } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })

    initAnalytics()

    const script = tracker()
    expect(script?.src).toBe(SRC)
    expect(script?.dataset.websiteId).toBe(ID)
    expect(script?.defer).toBe(true)
    // Only sent when set: an empty `data-domains` is not the same as no allowlist.
    expect(script?.dataset.domains).toBeUndefined()
  })

  it('passes a domain allowlist through when set', async () => {
    const { initAnalytics } = await load({
      VITE_UMAMI_SRC: SRC,
      VITE_UMAMI_WEBSITE_ID: ID,
      VITE_UMAMI_DOMAINS: 'jhemery.xyz',
    })

    initAnalytics()

    expect(tracker()?.dataset.domains).toBe('jhemery.xyz')
  })

  it('injects a single tracker when called twice', async () => {
    const { initAnalytics } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })

    initAnalytics()
    initAnalytics()

    expect(document.querySelectorAll('script[data-umami-tracker]')).toHaveLength(1)
  })

  it('replays events fired before the script finished loading, in order', async () => {
    const { initAnalytics, track } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })
    const umamiTrack = vi.fn()

    initAnalytics()
    track('terminal-opened')
    track('command-run', { name: 'whoami' })

    expect(umamiTrack).not.toHaveBeenCalled()

    window.umami = { track: umamiTrack }
    tracker()?.dispatchEvent(new Event('load'))

    expect(umamiTrack.mock.calls).toEqual([
      ['terminal-opened', undefined],
      ['command-run', { name: 'whoami' }],
    ])
  })

  it('forwards events directly once loaded', async () => {
    const { initAnalytics, track } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })
    const umamiTrack = vi.fn()

    initAnalytics()
    window.umami = { track: umamiTrack }
    tracker()?.dispatchEvent(new Event('load'))
    track('terminal-opened')

    expect(umamiTrack).toHaveBeenCalledExactlyOnceWith('terminal-opened', undefined)
  })

  it('drops events once the script has failed, rather than queueing forever', async () => {
    const { initAnalytics, track } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })
    const umamiTrack = vi.fn()

    initAnalytics()
    track('terminal-opened')
    tracker()?.dispatchEvent(new Event('error'))
    track('command-run')

    // A blocker cancelled the request; nothing arrives later to replay into.
    window.umami = { track: umamiTrack }
    tracker()?.dispatchEvent(new Event('load'))

    expect(umamiTrack).not.toHaveBeenCalled()
  })
})
