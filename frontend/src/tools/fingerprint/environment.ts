import type { FingerprintEnv, NavigatorLike } from './fingerprint'

/**
 * The real browser, as `fingerprint.ts` takes it. Kept apart from that module so it
 * stays pure, and only ever called by the panel as it opens: importing this reads
 * nothing, and `fingerprint.spec.ts` checks no other file imports it.
 */
export function browserEnvironment(): FingerprintEnv {
  const Offline =
    window.OfflineAudioContext ??
    (window as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  return {
    navigator: navigator as NavigatorLike,
    screen: window.screen,
    devicePixelRatio: window.devicePixelRatio,
    matchMedia: typeof window.matchMedia === 'function' ? (query) => window.matchMedia(query) : undefined,
    intl: Intl,
    canvas: () => document.createElement('canvas'),
    offlineAudio: (channels, length, sampleRate) =>
      Offline ? new Offline(channels, length, sampleRate) : null,
    subtle: globalThis.crypto?.subtle,
  }
}
