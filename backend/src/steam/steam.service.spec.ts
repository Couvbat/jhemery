import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { SteamController } from './steam.controller';
import { MAX_FAVOURITES, parseApps, SteamService } from './steam.service';

/**
 * The favourites' receipts (roadmap §L, *Steam with receipts*): the hours and achievement
 * counts `content/gaming.ts` used to type by hand, asked for by app id beside the live
 * activity. The library is one call a day whatever is asked, a game outside it is never
 * looked up, and nothing about them can fail the activity they ride along with.
 */
describe('SteamService', () => {
  const STEAM_ID = '76561197960287930';
  const ISAAC = 250900;
  const FACTORIO = 427520;
  const ZOMBOID = 108600;
  const NOT_OWNED = 1030300;

  let fetchMock: jest.Mock;
  let now: number;
  let warn: jest.SpyInstance;
  /** Steam's answers by method, each `{ status, body }`; the method is the URL's second segment. */
  type Answer = { status?: number; body?: unknown };
  let answers: Record<string, (url: URL) => Answer | Promise<Answer>>;

  const service = () =>
    new SteamService({
      get: (key: string) => ({ STEAM_API_KEY: 'key', STEAM_ID: STEAM_ID })[key],
    } as unknown as ConfigService);
  const calls = (method: string) =>
    fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname.split('/')[2] === method);

  beforeEach(() => {
    now = Date.parse('2026-10-16T12:00:00Z');
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    answers = {
      GetPlayerSummaries: () => ({
        body: {
          response: {
            players: [
              {
                personaname: 'Couvbat',
                avatarfull: 'avatar',
                profileurl: 'profile',
                personastate: 1,
              },
            ],
          },
        },
      }),
      GetRecentlyPlayedGames: () => ({ body: { response: { games: [] } } }),
      GetOwnedGames: () => ({
        body: {
          response: {
            games: [
              { appid: ISAAC, playtime_forever: 72_240 },
              { appid: FACTORIO, playtime_forever: 9_000 },
              { appid: ZOMBOID, playtime_forever: 600 },
            ],
          },
        },
      }),
      GetPlayerAchievements: (url) => {
        const appId = Number(url.searchParams.get('appid'));
        if (appId === ISAAC) {
          return {
            body: {
              playerstats: {
                achievements: [
                  { achieved: 1 },
                  { achieved: 1 },
                  { achieved: 0 },
                ],
              },
            },
          };
        }
        if (appId === FACTORIO) {
          return {
            status: 400,
            body: { playerstats: { error: 'Requested app has no stats' } },
          };
        }
        return { status: 503 };
      },
    };
    fetchMock = jest.fn(async (input: URL) => {
      const url = new URL(String(input));
      const { status = 200, body = {} } =
        await answers[url.pathname.split('/')[2]](url);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      };
    });
    global.fetch = fetchMock;
  });

  afterEach(() => jest.restoreAllMocks());

  describe('parseApps', () => {
    it('takes up to eight app ids, each once', () => {
      expect(parseApps('250900,427520,250900')).toEqual([250900, 427520]);
      const eight = Array.from({ length: MAX_FAVOURITES }, (_, i) => i + 1);
      expect(parseApps(eight.join(','))).toEqual(eight);
    });

    it('reads anything else as no favourites, not as an error', () => {
      for (const raw of [
        undefined,
        '',
        '250900,',
        'abc',
        '250900;427520',
        '-1',
        Array.from({ length: MAX_FAVOURITES + 1 }, (_, i) => i + 1).join(','),
        ['250900', '427520'],
      ]) {
        expect(parseApps(raw)).toEqual([]);
      }
    });
  });

  it('asks Steam nothing when it is unconfigured', async () => {
    const unconfigured = new SteamService({
      get: () => undefined,
    } as unknown as ConfigService);
    expect(await unconfigured.getActivity([ISAAC])).toEqual({
      configured: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the library alone when no favourites are asked about', async () => {
    const activity = await service().getActivity();
    expect(activity.configured).toBe(true);
    expect(activity.favourites).toBeUndefined();
    expect(calls('GetOwnedGames')).toHaveLength(0);
  });

  it('answers each owned favourite, in the order asked, with its hours and any achievements', async () => {
    const activity = await service().getActivity([
      ZOMBOID,
      NOT_OWNED,
      ISAAC,
      FACTORIO,
    ]);
    expect(activity.favourites).toEqual([
      { appId: ZOMBOID, minutes: 600 },
      {
        appId: ISAAC,
        minutes: 72_240,
        achievements: { achieved: 2, total: 3 },
      },
      { appId: FACTORIO, minutes: 9_000 },
    ]);
    // A game outside the library is never looked up, so a forged list costs nothing more.
    expect(
      calls('GetPlayerAchievements').map((url) =>
        url.searchParams.get('appid'),
      ),
    ).not.toContain(String(NOT_OWNED));
  });

  it('keeps the library and the counts for a day', async () => {
    const steam = service();
    await steam.getActivity([ISAAC, FACTORIO]);
    now += 23 * 60 * 60_000;
    await steam.getActivity([ISAAC, FACTORIO]);
    expect(calls('GetOwnedGames')).toHaveLength(1);
    expect(calls('GetPlayerAchievements')).toHaveLength(2);

    now += 2 * 60 * 60_000;
    await steam.getActivity([ISAAC, FACTORIO]);
    expect(calls('GetOwnedGames')).toHaveLength(2);
    expect(calls('GetPlayerAchievements')).toHaveLength(4);
  });

  it('keeps the hours when the profile hides achievements, and says why in the log', async () => {
    answers.GetPlayerAchievements = () => ({
      status: 403,
      body: { playerstats: { error: 'Profile is not public', success: false } },
    });
    const steam = service();
    expect((await steam.getActivity([ISAAC])).favourites).toEqual([
      { appId: ISAAC, minutes: 72_240 },
    ]);
    expect(warn).toHaveBeenCalledWith(
      `Steam achievements for ${ISAAC}: Profile is not public`,
    );
    // An answer, not a blip: asked again tomorrow, not in five minutes.
    now += 6 * 60_000;
    await steam.getActivity([ISAAC]);
    expect(calls('GetPlayerAchievements')).toHaveLength(1);
  });

  it('says nothing in the log for a game that keeps no achievements', async () => {
    await service().getActivity([FACTORIO]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('tries a count that failed again in five minutes, not a day', async () => {
    const steam = service();
    await steam.getActivity([ZOMBOID]);
    now += 6 * 60_000;
    await steam.getActivity([ZOMBOID]);
    expect(calls('GetPlayerAchievements')).toHaveLength(2);
  });

  it('keeps an empty library only briefly: game details private, or a blip', async () => {
    answers.GetOwnedGames = () => ({ body: { response: {} } });
    const steam = service();
    expect((await steam.getActivity([ISAAC])).favourites).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"Game details" public?'),
    );
    now += 6 * 60_000;
    await steam.getActivity([ISAAC]);
    expect(calls('GetOwnedGames')).toHaveLength(2);
  });

  it('still answers the activity when the library can’t be read', async () => {
    answers.GetOwnedGames = () => ({ status: 500 });
    const activity = await service().getActivity([ISAAC]);
    expect(activity.configured).toBe(true);
    expect(activity.profile?.name).toBe('Couvbat');
    expect(activity).not.toHaveProperty('favourites');
  });

  // Found in review: a failing GetOwnedGames was asked again on every page load.
  it('asks again five minutes after a failed read, keeping the last library meanwhile', async () => {
    const steam = service();
    await steam.getActivity([ISAAC]);
    answers.GetOwnedGames = () => ({ status: 500 });
    now += 25 * 60 * 60_000;
    const stale = await steam.getActivity([ISAAC]);
    expect(stale.favourites?.[0]).toMatchObject({
      appId: ISAAC,
      minutes: 72_240,
    });
    now += 60_000;
    await steam.getActivity([ISAAC]);
    expect(calls('GetOwnedGames')).toHaveLength(2);
    now += 5 * 60_000;
    await steam.getActivity([ISAAC]);
    expect(calls('GetOwnedGames')).toHaveLength(3);
  });

  it('gives every call to Steam a deadline', async () => {
    await service().getActivity([ISAAC, FACTORIO]);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit | undefined)?.signal).toBeInstanceOf(
        AbortSignal,
      );
    }
  });

  // Review of #171: the age a request read off the last call's start let a slow lookup,
  // one second after another call, read as the copy served. The trace says it went.
  it('tells Server-Timing a request went to Steam, however long Steam took', async () => {
    const steam = service();
    const controller = new SteamController(steam);
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (name: string, value: string) => (headers[name] = value),
    } as unknown as Response;
    await steam.getActivity([ISAAC]);
    now += 1000;
    const answer = answers.GetPlayerAchievements;
    answers.GetPlayerAchievements = (url) => {
      now += 2000;
      return answer(url);
    };
    await controller.getActivity(`${ISAAC},${FACTORIO}`, res);
    expect(headers['Server-Timing']).toMatch(
      /^cache;desc="miss", upstream;dur=/,
    );
    // Nothing left to fetch: the copy, three seconds old.
    await controller.getActivity(`${ISAAC},${FACTORIO}`, res);
    expect(headers['Server-Timing']).toBe('cache;desc="hit", age;dur=3000');
  });

  // Review of #171: requests that overlapped on a cold cache each asked Steam again.
  it('shares one call among requests that overlap, the library’s and each game’s', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const owned = answers.GetOwnedGames;
    answers.GetOwnedGames = async (url) => {
      await held;
      return owned(url);
    };
    const steam = service();
    const both = Promise.all([
      steam.getActivity([ISAAC, FACTORIO]),
      steam.getActivity([ISAAC, FACTORIO]),
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const [first, second] = await both;
    expect(second.favourites).toEqual(first.favourites);
    expect(calls('GetOwnedGames')).toHaveLength(1);
    expect(calls('GetPlayerAchievements')).toHaveLength(2);
  });
});
