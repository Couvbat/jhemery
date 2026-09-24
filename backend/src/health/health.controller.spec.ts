import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../app.module';
import { cacheAge } from '../common/health';
import { HealthController } from './health.controller';

/**
 * Built from the real module graph with a stubbed configuration, so the report is the
 * one production would give for that `.env` — and a spy on `fetch` proves the other
 * half of the contract: asking for the health of a unit never calls its upstream.
 */
async function controllerWith(env: Record<string, string>) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: string) => env[key] })
    .compile();
  return moduleRef.get(HealthController);
}

describe('GET /health', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('no network in tests'));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('lists every unit, in a fixed order, and fetches nothing', async () => {
    const report = (await controllerWith({})).report();
    expect(report.units.map((u) => u.unit)).toEqual([
      'steam',
      'github',
      'weather',
      'markets',
      'presence',
      'stats',
      'guestbook',
      'rooms',
      'jobs',
      'ask',
      'contact',
      'mcp',
    ]);
    expect(typeof report.uptime).toBe('number');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports what is off as inactive, with the reason', async () => {
    const units = Object.fromEntries(
      (await controllerWith({ MARKETS_COINS: '' }))
        .report()
        .units.map((u) => [u.unit, u]),
    );
    expect(units.steam).toEqual({
      unit: 'steam',
      state: 'inactive',
      reason: 'unconfigured',
    });
    expect(units.markets).toMatchObject({
      state: 'inactive',
      reason: 'unconfigured',
    });
    expect(units.guestbook).toMatchObject({
      state: 'inactive',
      reason: 'disabled',
    });
    expect(units.ask).toMatchObject({ state: 'inactive', reason: 'disabled' });
    expect(units.mcp).toMatchObject({ state: 'inactive', reason: 'disabled' });
    expect(units.presence).toEqual({
      unit: 'presence',
      state: 'active',
      detail: { online: 0 },
    });
  });

  it('reports what is configured as active, with no cache until something asks', async () => {
    const units = Object.fromEntries(
      (
        await controllerWith({
          STEAM_API_KEY: 'k',
          STEAM_ID: 'id',
          GUESTBOOK_ENABLED: 'true',
          ROOMS_ENABLED: 'true',
          MCP_ENABLED: 'true',
          FRONTEND_URL: 'https://jhemery.xyz',
        })
      )
        .report()
        .units.map((u) => [u.unit, u]),
    );
    expect(units.steam).toEqual({
      unit: 'steam',
      state: 'active',
      cacheAge: null,
    });
    expect(units.guestbook).toEqual({ unit: 'guestbook', state: 'active' });
    expect(units.rooms).toEqual({
      unit: 'rooms',
      state: 'active',
      detail: { rooms: 0 },
    });
    expect(units.mcp).toEqual({ unit: 'mcp', state: 'active', cacheAge: null });
  });
});

describe('cacheAge', () => {
  it('works back from the expiry and the TTL it was set with', () => {
    expect(cacheAge({ expiresAt: 10_000 }, 5_000, 7_000)).toBe(2_000);
    expect(cacheAge(null, 5_000)).toBeNull();
  });
});
