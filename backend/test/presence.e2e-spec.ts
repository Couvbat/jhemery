import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * `POST /presence/wall` through the real HTTP stack: the unit spec pins what the
 * handler returns, and only this shows that the decorator's 204 and the handler's own
 * 200 for "off" reach the wire as intended, and that the guard counts to six.
 */
describe('POST /presence/wall (e2e)', () => {
  let app: INestApplication<App>;

  async function start(wall: string | undefined) {
    if (wall === undefined) delete process.env.WALL_ENABLED;
    else process.env.WALL_ENABLED = wall;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    await app.close();
    delete process.env.WALL_ENABLED;
  });

  it('says it is off by default', async () => {
    await start(undefined);
    await request(app.getHttpServer())
      .post('/presence/wall')
      .expect(200)
      .expect({ configured: false });
  });

  it('answers a bare 204 when enabled, then 429 past six a minute', async () => {
    await start('true');
    for (let i = 0; i < 6; i++) {
      const res = await request(app.getHttpServer())
        .post('/presence/wall')
        .expect(204);
      expect(res.text).toBe('');
    }
    await request(app.getHttpServer()).post('/presence/wall').expect(429);
  });
});
