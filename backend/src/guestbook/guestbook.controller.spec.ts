import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { GuestbookController } from './guestbook.controller';
import { GuestbookService } from './guestbook.service';

// Test fixtures, not credentials — named so a secret scanner does not read them as
// one, as in admin.guard.spec.ts. The gate compares the header to the env var.
const EXPECTED = 'letmein';
const WRONG = 'guess';

/**
 * Over HTTP, through the real guards, because the guard is the point: every owner route
 * sits behind `AdminGuard` (the DELETE's old inline `!==` was not constant-time), and
 * `sign` answers `201` or `202` by whether moderation is on. The service spec covers
 * storage and the lifecycle; these cover the gates and the status codes in front of it.
 */
describe('GuestbookController (HTTP)', () => {
  let app: INestApplication<App>;
  const service = {
    enabled: true,
    sign: jest.fn(),
    status: jest.fn(),
    held: jest.fn(),
    approve: jest.fn(),
    remove: jest.fn(),
    clearReply: jest.fn(),
    list: jest.fn(),
  };
  let env: Record<string, string>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GuestbookController],
      providers: [
        { provide: GuestbookService, useValue: service },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    })
      // The limits are `rate-limit.guard.spec.ts`'s; here they would only make the
      // second signing in one run a 429.
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    env = { ADMIN_PASSWORD: EXPECTED };
    for (const fn of Object.values(service)) {
      if (typeof fn === 'function') fn.mockReset();
    }
    service.remove.mockResolvedValue(true);
    service.approve.mockResolvedValue(true);
    service.clearReply.mockResolvedValue(true);
    service.held.mockResolvedValue([]);
  });

  const owner: Array<[string, string]> = [
    ['get', '/guestbook/held'],
    ['post', '/guestbook/abc/approve'],
    ['delete', '/guestbook/abc'],
    ['delete', '/guestbook/abc/reply'],
  ];

  it.each(owner)(
    '%s %s answers the owner, and refuses anyone else',
    async (method, path) => {
      const server = app.getHttpServer();
      const call = (password?: string) => {
        const req = request(server)[method as 'get'](path);
        return password === undefined
          ? req
          : req.set('x-admin-password', password);
      };
      await call().expect(403);
      await call(WRONG).expect(403);
      await call(EXPECTED).expect((res) => {
        expect([200, 204]).toContain(res.status);
      });
    },
  );

  it('stays locked when ADMIN_PASSWORD is unset', async () => {
    // An unset env var must not turn into an open door for an empty header.
    env = {};
    await request(app.getHttpServer())
      .delete('/guestbook/abc')
      .set('x-admin-password', '')
      .expect(403);
    expect(service.remove).not.toHaveBeenCalled();
  });

  it('reports an unknown id as 404 rather than a silent success', async () => {
    service.remove.mockResolvedValue(false);
    await request(app.getHttpServer())
      .delete('/guestbook/no-such-id')
      .set('x-admin-password', EXPECTED)
      .expect(404);
  });

  it('answers a sign 201 and the entry with moderation off, as it always did', async () => {
    const entry = { id: 'a', name: 'Ada', message: 'Nice', date: 'd' };
    service.sign.mockResolvedValue(entry);
    const res = await request(app.getHttpServer())
      .post('/guestbook')
      .send({ name: 'Ada', message: 'Nice' })
      .expect(201);
    expect(res.body).toEqual(entry);
  });

  it('answers a sign 202 and only the id with moderation on', async () => {
    service.sign.mockResolvedValue({
      id: 'b',
      name: 'Ada',
      message: 'Nice',
      date: 'd',
      status: 'pending',
      signedAt: 'd',
    });
    const res = await request(app.getHttpServer())
      .post('/guestbook')
      .send({ name: 'Ada', message: 'Nice', locale: 'fr' })
      .expect(202);
    expect(res.body).toEqual({ id: 'b', status: 'pending' });
    expect(service.sign).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'fr' }),
    );
  });

  it('tells a signer the status alone, and 404 for an id it doesn’t know', async () => {
    service.status.mockResolvedValueOnce('held').mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/guestbook/b/status')
      .expect(200, { status: 'held' });
    await request(app.getHttpServer()).get('/guestbook/x/status').expect(404);
  });
});
