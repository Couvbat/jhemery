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
    localStorage.clear()
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

  it('injects nothing and drops every event once the visitor has refused', async () => {
    const { analyticsRefused, initAnalytics, refuseAnalytics, track } = await load({
      VITE_UMAMI_SRC: SRC,
      VITE_UMAMI_WEBSITE_ID: ID,
    })
    const umamiTrack = vi.fn()
    window.umami = { track: umamiTrack }

    refuseAnalytics(true)
    initAnalytics()
    track('terminal-opened')

    expect(analyticsRefused()).toBe(true)
    expect(tracker()).toBeNull()
    expect(umamiTrack).not.toHaveBeenCalled()
  })

  it('counts again once the refusal is withdrawn', async () => {
    const { analyticsRefused, initAnalytics, refuseAnalytics } = await load({
      VITE_UMAMI_SRC: SRC,
      VITE_UMAMI_WEBSITE_ID: ID,
    })

    refuseAnalytics(true)
    refuseAnalytics(false)
    initAnalytics()

    expect(analyticsRefused()).toBe(false)
    expect(localStorage.getItem('couvbat:analytics')).toBeNull()
    expect(localStorage.getItem('umami.disabled')).toBeNull()
    expect(tracker()).not.toBeNull()
  })

  // Found in review: an event queued while the script downloaded still went out on `load`.
  it('drops the events waiting for the script when the visitor refuses before it arrives', async () => {
    const { initAnalytics, refuseAnalytics, track } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })
    const umamiTrack = vi.fn()

    initAnalytics()
    track('terminal-opened')
    expect(refuseAnalytics(true)).toBe(true)
    window.umami = { track: umamiTrack }
    tracker()?.dispatchEvent(new Event('load'))

    expect(umamiTrack).not.toHaveBeenCalled()
  })

  // Found in review: refusing in one tab left a tracker running in another.
  it('silences a tracker already running, in this tab and any other', async () => {
    const { initAnalytics, refuseAnalytics, track } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })
    const umamiTrack = vi.fn()
    initAnalytics()
    window.umami = { track: umamiTrack }
    tracker()?.dispatchEvent(new Event('load'))

    // What a second tab's module would write: the same shared storage.
    refuseAnalytics(true)

    // Umami's own switch, which its tracker reads before every send, page views included.
    expect(localStorage.getItem('umami.disabled')).not.toBeNull()
    track('terminal-opened')
    expect(umamiTrack).not.toHaveBeenCalled()
  })

  it('says so, and changes nothing, when the browser won’t keep the refusal', async () => {
    const { analyticsRefused, refuseAnalytics } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })
    const setItem = Storage.prototype.setItem
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      // The switch fits and the record doesn't: the half-written state the rollback undoes.
      if (key === 'couvbat:analytics') throw new DOMException('full', 'QuotaExceededError')
      setItem.call(this, key, value)
    })

    expect(refuseAnalytics(true)).toBe(false)
    full.mockRestore()

    expect(analyticsRefused()).toBe(false)
    expect(localStorage.getItem('umami.disabled')).toBeNull()
  })

  it('takes back a switch it set once the record is gone, and leaves the owner’s alone', async () => {
    const { initAnalytics } = await load({ VITE_UMAMI_SRC: SRC, VITE_UMAMI_WEBSITE_ID: ID })

    // `rm settings` cleared the record and left the switch.
    localStorage.setItem('umami.disabled', 'couvbat:analytics')
    initAnalytics()
    expect(localStorage.getItem('umami.disabled')).toBeNull()

    document.head.querySelectorAll('script').forEach((el) => el.remove())
    localStorage.setItem('umami.disabled', '1')
    initAnalytics()
    expect(localStorage.getItem('umami.disabled')).toBe('1')
  })
})
