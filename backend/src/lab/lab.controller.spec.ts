import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { LabModule } from './lab.module';

const TOKEN = 'a-long-enough-lab-ingest-token-0123456789';

/**
 * Over HTTP, through the real pipes and guards, because the order is the point: the
 * token is checked before the body, the route's own pipe refuses what the global one
 * would only strip, and `GET /lab` carries its cache header.
 */
describe('LabController (HTTP)', () => {
  let app: INestApplication<App>;
  let dir: string;

  async function start(env: Record<string, string>) {
    dir = await mkdtemp(join(tmpdir(), 'lab-http-'));
    const values: Record<string, string> = { DATA_DIR: dir, ...env };
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true }), LabModule],
    })
      .overrideProvider(ConfigService)
      .useValue({ get: (key: string) => values[key] })
      .compile();
    app = moduleRef.createNestApplication();
    // As main.ts sets it, so the test sees the pipeline production does.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }

  afterEach(async () => {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const on = {
    LAB_ENABLED: 'true',
    LAB_INGEST_TOKEN: TOKEN,
    LAB_NODES: 'poseidon',
  };
  const body = () => ({
    takenAt: new Date().toISOString(),
    machines: [{ id: 'poseidon', up: true, cpu: 8 }],
    services: [],
  });

  it('GET /lab says unconfigured when the feed is off, and is cacheable', async () => {
    await start({});
    const res = await request(app.getHttpServer()).get('/lab').expect(200);
    expect(res.body).toEqual({ configured: false });
    expect(res.headers['cache-control']).toBe('public, max-age=15');
    expect(res.headers['server-timing']).toBeUndefined();
  });

  it('takes a push with the token, and serves it back', async () => {
    await start(on);
    await request(app.getHttpServer())
      .post('/lab/snapshot')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(body())
      .expect(200, { accepted: 1, dropped: [] });
    const res = await request(app.getHttpServer()).get('/lab').expect(200);
    expect(res.body).toMatchObject({
      configured: true,
      stale: false,
      snapshot: { machines: [{ id: 'poseidon', up: true, cpu: 8 }] },
    });
    // The copy's age, as the caching routes give theirs.
    expect(res.headers['server-timing']).toMatch(
      /^cache;desc="hit", age;dur=\d+$/,
    );
  });

  it.each([
    ['no token', undefined],
    ['a wrong token', 'Bearer this-is-not-the-token-it-is-wrong-0000'],
  ])('answers a bare 403 to %s, before reading the body', async (_, header) => {
    await start(on);
    const req = request(app.getHttpServer()).post('/lab/snapshot');
    if (header) req.set('Authorization', header);
    // A body the pipe would refuse: a 403 rather than a 400 means the guard ran first.
    await req.send({ nonsense: true }).expect(403);
  });

  it('answers 403 when the server has no token at all', async () => {
    await start({ LAB_ENABLED: 'true', LAB_NODES: 'poseidon' });
    await request(app.getHttpServer())
      .post('/lab/snapshot')
      .set('Authorization', 'Bearer ')
      .send(body())
      .expect(403);
  });

  it('refuses an unknown property with a 400 that names it', async () => {
    await start(on);
    const res = await request(app.getHttpServer())
      .post('/lab/snapshot')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        ...body(),
        machines: [{ id: 'poseidon', up: true, ip: '10.0.0.2' }],
      })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('ip should not exist');
  });
});
