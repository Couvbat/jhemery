import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { GithubController } from '../github/github.controller';
import { HealthController } from '../health/health.controller';
import { MarketsController } from '../markets/markets.controller';
import { SteamController } from '../steam/steam.controller';
import { WeatherController } from '../weather/weather.controller';
import {
  allowedOrigins,
  formatServerTiming,
  timedCopy,
  timingAllowOrigin,
} from './server-timing';

function fakeResponse() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  return { res, headers };
}

describe('server timing', () => {
  it('names the origins CORS admits, and only those', () => {
    expect(allowedOrigins({ FRONTEND_URL: 'https://jhemery.xyz' })).toEqual([
      'http://localhost:5173',
      'https://jhemery.xyz',
    ]);
    expect(allowedOrigins({})).toEqual(['http://localhost:5173']);
  });

  it('formats a hit with its age and a miss with the upstream time', () => {
    expect(formatServerTiming({ cache: 'hit', ageMs: 180_000.4 })).toBe(
      'cache;desc="hit", age;dur=180000',
    );
    expect(formatServerTiming({ cache: 'miss', upstreamMs: 812.6 })).toBe(
      'cache;desc="miss", upstream;dur=813',
    );
  });

  describe('timedCopy', () => {
    const clock = () => {
      let t = 0;
      return () => (t += 400);
    };

    it('reads the same age after as a hit', async () => {
      const { res, headers } = fakeResponse();
      await timedCopy(
        res,
        () => 90_000,
        () => Promise.resolve(1),
        clock(),
      );
      expect(headers['Server-Timing']).toBe('cache;desc="hit", age;dur=90000');
    });

    it('reads a younger copy, or a first one, as a fetch this request made', async () => {
      for (const before of [90_000, null]) {
        const { res, headers } = fakeResponse();
        let age: number | null = before;
        await timedCopy(
          res,
          () => age,
          () => {
            age = 0;
            return Promise.resolve(1);
          },
          clock(),
        );
        expect(headers['Server-Timing']).toBe(
          'cache;desc="miss", upstream;dur=400',
        );
      }
    });

    it('says nothing when nothing is cached', async () => {
      const { res, headers } = fakeResponse();
      await expect(
        timedCopy(
          res,
          () => null,
          () => Promise.resolve('x'),
        ),
      ).resolves.toBe('x');
      expect(headers).toEqual({});
    });

    // Review of #160: a refresh that failed after the copy expired answered
    // `{ configured: false }` and kept the old copy, whose age read as a hit.
    it('says nothing when the answer served nothing, an old copy or not', async () => {
      const { res, headers } = fakeResponse();
      await timedCopy(
        res,
        () => 900_000,
        () => Promise.resolve({ configured: false }),
        clock(),
      );
      expect(headers).toEqual({});
    });
  });
});

/**
 * Over HTTP: every caching route carries `Server-Timing`, hit or miss, from its
 * service's own cache age; `/health`, which caches nothing, carries none; and every
 * response names the page's origins in `Timing-Allow-Origin`.
 */
describe('server timing (HTTP)', () => {
  let app: INestApplication<App>;
  const state = { age: null as number | null, fetches: false };

  beforeAll(async () => {
    const answer = () => {
      if (state.fetches) state.age = 0;
      return Promise.resolve({ ok: true });
    };
    const service = {
      health: () => ({ unit: 'unit', state: 'active', cacheAge: state.age }),
      cacheAges: () => ({
        activity: state.age,
        contributions: state.age,
        pinnedRepos: state.age,
        workflowStatus: state.age,
      }),
      getActivity: answer,
      getContributions: answer,
      getPinnedRepos: answer,
      getWorkflowStatus: answer,
      getWeather: answer,
      getQuotes: answer,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [
        SteamController,
        GithubController,
        WeatherController,
        MarketsController,
        HealthController,
      ],
    })
      .useMocker(() => service)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(
      timingAllowOrigin(
        allowedOrigins({ FRONTEND_URL: 'https://jhemery.xyz' }),
      ),
    );
    await app.init();
  });

  afterAll(() => app.close());

  const caching = [
    '/steam/activity',
    '/github/activity',
    '/github/contributions',
    '/github/pinned-repos',
    '/github/workflow-status',
    '/weather',
    '/markets',
  ];

  it.each(caching)('%s says a hit with the copy’s age', async (route) => {
    Object.assign(state, { age: 180_000, fetches: false });
    const res = await request(app.getHttpServer()).get(route).expect(200);
    expect(res.headers['server-timing']).toBe(
      'cache;desc="hit", age;dur=180000',
    );
  });

  it.each(caching)('%s says a miss with the upstream time', async (route) => {
    Object.assign(state, { age: null, fetches: true });
    const res = await request(app.getHttpServer()).get(route).expect(200);
    expect(res.headers['server-timing']).toMatch(
      /^cache;desc="miss", upstream;dur=\d+$/,
    );
  });

  it('says nothing on a route that caches nothing', async () => {
    Object.assign(state, { age: 180_000, fetches: false });
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['server-timing']).toBeUndefined();
  });

  it('names only the page’s origins in Timing-Allow-Origin, never a wildcard', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['timing-allow-origin']).toBe(
      'http://localhost:5173, https://jhemery.xyz',
    );
  });
});
