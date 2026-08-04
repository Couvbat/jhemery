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
});
