import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let dir: string;
  let service: StatsService;

  const build = (dataDir: string) =>
    new StatsService({
      get: (key: string) => (key === 'DATA_DIR' ? dataDir : undefined),
    } as unknown as ConfigService);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stats-'));
    service = build(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts at zero when nothing has been written', async () => {
    expect(await service.read()).toEqual({ sessions: 0 });
  });

  it('counts a session', async () => {
    expect(await service.recordSession()).toEqual({ sessions: 1 });
    expect(await service.recordSession()).toEqual({ sessions: 2 });
  });

  it('persists on shutdown and reads back in a fresh instance', async () => {
    await service.recordSession();
    await service.recordSession();
    await service.onModuleDestroy();

    expect(await build(dir).read()).toEqual({ sessions: 2 });
  });

  it('writes nothing but the count', async () => {
    // The privacy claim, asserted against the file that actually lands on disk.
    await service.recordSession();
    await service.onModuleDestroy();

    const raw = await readFile(join(dir, 'stats.json'), 'utf8');
    expect(Object.keys(JSON.parse(raw) as object)).toEqual(['sessions']);
  });

  it('treats an unreadable file as zero rather than throwing', async () => {
    await writeFile(join(dir, 'stats.json'), 'not json', 'utf8');
    expect(await build(dir).read()).toEqual({ sessions: 0 });
  });

  it('ignores a negative total left behind by a bad write', async () => {
    await writeFile(join(dir, 'stats.json'), '{"sessions":-5}', 'utf8');
    expect(await build(dir).read()).toEqual({ sessions: 0 });
  });

  it('does not write when nothing was recorded', async () => {
    await service.read();
    await service.onModuleDestroy();
    await expect(readFile(join(dir, 'stats.json'), 'utf8')).rejects.toThrow();
  });
  describe('wordle', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');

    it('tallies a day per language, solved in n or not at all', async () => {
      await service.recordWordle('2026-09-24', 'en', 3, now);
      await service.recordWordle('2026-09-24', 'en', 3, now);
      await service.recordWordle('2026-09-24', 'en', 0, now);
      await service.recordWordle('2026-09-24', 'fr', 1, now);

      expect(await service.wordleHistogram('2026-09-24', 'en')).toEqual({
        day: '2026-09-24',
        locale: 'en',
        counts: [0, 0, 2, 0, 0, 0, 1],
      });
      expect(
        (await service.wordleHistogram('2026-09-24', 'fr')).counts,
      ).toEqual([1, 0, 0, 0, 0, 0, 0]);
    });

    it('answers seven zeros for a day nobody has played', async () => {
      expect(
        (await service.wordleHistogram('2026-09-23', 'en')).counts,
      ).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });

    it('accepts today and yesterday only', async () => {
      await expect(
        service.recordWordle('2026-09-23', 'en', 2, now),
      ).resolves.toBeDefined();
      await expect(
        service.recordWordle('2026-09-22', 'en', 2, now),
      ).rejects.toThrow();
      await expect(
        service.recordWordle('2026-09-25', 'en', 2, now),
      ).rejects.toThrow();
    });

    it('keeps two weeks and drops the rest on write', async () => {
      const day = 86_400_000;
      for (let i = 0; i < 20; i++) {
        const at = now - (19 - i) * day;
        await service.recordWordle(
          new Date(at).toISOString().slice(0, 10),
          'en',
          4,
          at,
        );
      }
      await service.onModuleDestroy();

      const raw = JSON.parse(
        await readFile(join(dir, 'stats.json'), 'utf8'),
      ) as { wordle: Record<string, number[]> };
      expect(Object.keys(raw.wordle)).toHaveLength(14);
      expect(Object.keys(raw.wordle).sort()[0]).toBe('2026-09-11:en');
    });

    it('writes counts and nothing else, and reads them back', async () => {
      await service.recordWordle('2026-09-24', 'en', 5, now);
      await service.recordSession();
      await service.onModuleDestroy();

      const raw = JSON.parse(
        await readFile(join(dir, 'stats.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(Object.keys(raw).sort()).toEqual(['sessions', 'wordle']);
      expect(raw.wordle).toEqual({ '2026-09-24:en': [0, 0, 0, 0, 1, 0, 0] });
      expect(
        (await build(dir).wordleHistogram('2026-09-24', 'en')).counts[4],
      ).toBe(1);
    });

    it('drops tallies that are not seven counts', async () => {
      await writeFile(
        join(dir, 'stats.json'),
        JSON.stringify({
          sessions: 1,
          wordle: { '2026-09-24:en': [1, 2], nonsense: [1, 1, 1, 1, 1, 1, 1] },
        }),
        'utf8',
      );
      expect(
        (await build(dir).wordleHistogram('2026-09-24', 'en')).counts,
      ).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });
  });

  it('reports its health without reading anything', () => {
    expect(service.health()).toEqual({ unit: 'stats', state: 'active' });
  });
});
