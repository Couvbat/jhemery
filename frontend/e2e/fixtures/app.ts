import type { Page } from '@playwright/test'

/**
 * The persisted state the app reads before it paints.
 *
 * Every one of these is read at *module scope* — `i18n/index.ts` picks a locale
 * while the module is evaluating, `terminal/history.ts` and `terminal/aliases.ts`
 * load on import, `BootSequence` checks its key on mount. So seeding has to happen
 * through `addInitScript`, before the first script runs; setting localStorage after
 * `page.goto` changes nothing until a reload.
 */
export interface SeedState {
  /** `false` replays the first-visit boot sequence. */
  booted?: boolean
  locale?: 'en' | 'fr'
  crt?: boolean
  achievements?: string[]
  history?: string[]
}

// Only the keys the suite actually seeds or reads. The app persists more of them —
// `couvbat:achievements:sections`, `couvbat:aliases`, `couvbat:games:<id>` — and they
// belong here the day a spec needs one, not before.
const KEYS = {
  booted: 'couvbat:booted',
  locale: 'couvbat:locale',
  crt: 'couvbat:crt',
  achievements: 'couvbat:achievements',
  history: 'couvbat:history',
} as const

/**
 * Booted and English by default.
 *
 * The boot sequence is eleven steps at 130 ms and swallows the first keypress or
 * click that follows it — paid on every single test, it would be both a second and a
 * race per test for no coverage. It gets tested once, deliberately, in `boot.spec.ts`.
 * The locale is pinned because it otherwise falls back to `navigator.language`, which
 * differs between a French laptop and a CI runner.
 */
const DEFAULTS: SeedState = { booted: true, locale: 'en' }

export class AppState {
  constructor(private readonly page: Page) {}

  async install(): Promise<void> {
    await this.seed(DEFAULTS)
  }

  /**
   * Merges into whatever is already seeded. Init scripts accumulate and run in order,
   * so a later `seed()` overwrites the keys it names and leaves the rest alone.
   * Must be called before `page.goto`.
   */
  async seed(state: SeedState): Promise<void> {
    const entries: [string, string | null][] = []

    if (state.booted !== undefined) entries.push([KEYS.booted, state.booted ? '1' : null])
    if (state.locale !== undefined) entries.push([KEYS.locale, state.locale])
    if (state.crt !== undefined) entries.push([KEYS.crt, String(state.crt)])
    if (state.achievements) entries.push([KEYS.achievements, JSON.stringify(state.achievements)])
    if (state.history) entries.push([KEYS.history, JSON.stringify(state.history)])

    await this.page.addInitScript((pairs: [string, string | null][]) => {
      for (const [key, value] of pairs) {
        if (value === null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, value)
      }
    }, entries)
  }

  /** Reads a key back out of the live page — for asserting that something persisted. */
  read(key: keyof typeof KEYS): Promise<string | null> {
    return this.page.evaluate((name) => window.localStorage.getItem(name), KEYS[key])
  }

  /** The same, parsed. Returns `null` for a missing or unparseable value. */
  async readJson<T>(key: keyof typeof KEYS): Promise<T | null> {
    const raw = await this.read(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }
}
