import type {
  GithubActivity,
  GithubContributions,
  GithubPinnedRepos,
  GithubWorkflowStatus,
  GuestbookList,
  MarketsReport,
  StatsReport,
  SteamActivity,
  WeatherReport,
} from '@/lib/api'

/**
 * Canned API responses, typed against the real interfaces in `src/lib/api.ts` so a
 * change to a payload shape breaks the type-check here rather than producing a suite
 * that keeps passing against a contract the backend no longer serves.
 *
 * The values are deliberately fixed and slightly absurd (a Steam profile that is
 * always in-game, weather that is always 21°C). Nothing in a test should depend on
 * live data — that is the whole reason none of these calls reach the network.
 */

export const steamConfigured: SteamActivity = {
  configured: true,
  profile: {
    name: 'e2e-tester',
    avatar: 'https://example.invalid/avatar.png',
    profileUrl: 'https://example.invalid/profile',
    status: 'Online',
    inGame: 'Factorio',
  },
  recentGames: [
    {
      appId: 427520,
      name: 'Factorio',
      iconUrl: 'https://example.invalid/factorio.png',
      playtime2Weeks: 420,
      playtimeForever: 12_000,
    },
    {
      appId: 275850,
      name: 'No Man’s Sky',
      iconUrl: 'https://example.invalid/nms.png',
      playtime2Weeks: 90,
      playtimeForever: 3_600,
    },
  ],
}

export const githubActivityConfigured: GithubActivity = {
  configured: true,
  commits: [
    {
      repo: 'couvbat/jhemery.xyz',
      sha: 'abc1234',
      message: 'feat(e2e): a commit that only exists in a fixture',
      url: 'https://example.invalid/commit/abc1234',
      date: '2026-08-01T10:00:00.000Z',
    },
  ],
}

/**
 * One full week, one contribution per day, escalating through every level bucket.
 * The heatmap pads partial weeks itself, so a whole week keeps the fixture honest
 * about what the component is actually handed.
 */
export const githubContributionsConfigured: GithubContributions = {
  configured: true,
  total: 21,
  weeks: [
    [
      { date: '2026-07-26', count: 0, level: 0 },
      { date: '2026-07-27', count: 1, level: 1 },
      { date: '2026-07-28', count: 2, level: 1 },
      { date: '2026-07-29', count: 4, level: 2 },
      { date: '2026-07-30', count: 6, level: 3 },
      { date: '2026-07-31', count: 8, level: 4 },
      { date: '2026-08-01', count: 0, level: 0 },
    ],
  ],
}

export const githubPinnedConfigured: GithubPinnedRepos = {
  configured: true,
  repos: [
    {
      name: 'jhemery.xyz',
      description: 'This very site',
      url: 'https://example.invalid/repo',
      language: 'Vue',
      languageColor: '#41b883',
      stars: 42,
      forks: 7,
    },
  ],
}

export const githubWorkflowConfigured: GithubWorkflowStatus = {
  configured: true,
  repo: 'couvbat/jhemery.xyz',
  runs: [
    {
      name: 'Frontend PR Check',
      status: 'completed',
      conclusion: 'success',
      branch: 'dev',
      sha: 'abc1234',
      url: 'https://example.invalid/run/1',
      startedAt: '2026-08-01T10:00:00.000Z',
      durationMs: 92_000,
    },
  ],
}

export const weatherConfigured: WeatherReport = {
  configured: true,
  location: 'Rennes',
  now: {
    temperature: 21,
    apparent: 20,
    humidity: 64,
    windSpeed: 12,
    windDirection: 220,
    precipitation: 0,
    isDay: true,
    code: 0,
    condition: 'clear',
  },
  forecast: [
    { date: '2026-08-08', min: 14, max: 24, code: 0, condition: 'clear' },
    { date: '2026-08-09', min: 15, max: 22, code: 61, condition: 'rain' },
  ],
}

export const marketsConfigured: MarketsReport = {
  configured: true,
  quotes: [
    {
      id: 'bitcoin',
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 64_000,
      currency: 'EUR',
      change24h: 1.5,
      sparkline: [61_000, 62_000, 61_500, 63_000, 63_500, 64_200, 64_000],
    },
  ],
}

export const statsConfigured: StatsReport = { sessions: 1337 }

export const guestbookConfigured: GuestbookList = {
  enabled: true,
  entries: [
    { id: 'entry-1', name: 'ada', message: 'first!', date: '2026-08-01T10:00:00.000Z' },
    {
      id: 'entry-2',
      // Rendered as literal text or the OutputLine contract is broken — this is
      // guestbook data, which is the one place the terminal prints something a
      // stranger wrote. `forms.spec.ts` asserts on it.
      name: '<script>alert(1)</script>',
      message: 'hello <b>world</b>',
      date: '2026-08-02T10:00:00.000Z',
    },
  ],
}

/**
 * The degraded shape. Every optional integration answers this rather than erroring
 * when its key is missing, and the frontend is required to render it as an honest
 * "not available" — see the backend section of CLAUDE.md. `guestbook` and `ask` use
 * their own flags (`enabled`, and a 503) because they are off by default rather than
 * merely unconfigured.
 */
export const unconfigured = { configured: false } as const

export const guestbookDisabled: GuestbookList = { enabled: false }
