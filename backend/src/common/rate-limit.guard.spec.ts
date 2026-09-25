import { ExecutionContext, HttpStatus, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  MAX_BUCKETS,
  RateLimitGuard,
  RateLimitOptions,
} from './rate-limit.guard';

/**
 * The only thing standing between `POST /contact` / `POST /guestbook` and a bot
 * with a loop. Its bucket key mixes controller, handler and client IP, so the
 * cases that matter are the ones where those differ.
 */
describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let reflector: Reflector;
  let options: RateLimitOptions | undefined;

  /**
   * `ip` stands in for what Express derives from `trust proxy`: the peer that
   * connected to Apache. The headers are passed through raw, as a client or
   * Cloudflare would have written them.
   */
  function context({
    ip = '1.2.3.4',
    forwarded,
    cfConnectingIp,
    handler = 'sign',
    controller = 'GuestbookController',
  }: {
    ip?: string;
    forwarded?: string;
    cfConnectingIp?: string;
    handler?: string;
    controller?: string;
  } = {}): ExecutionContext {
    const headers: Record<string, string> = {};
    if (forwarded !== undefined) headers['x-forwarded-for'] = forwarded;
    if (cfConnectingIp !== undefined)
      headers['cf-connecting-ip'] = cfConnectingIp;
    const request = { ip, headers, socket: { remoteAddress: ip } };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({ name: handler }),
      getClass: () => ({ name: controller }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    options = { limit: 1, windowMs: 60_000 };
    reflector = {
      getAllAndOverride: () => options,
    } as unknown as Reflector;
    // Before the guard is built, not after: its `lastSweep` is stamped in the
    // constructor, and stamping it from the real clock while `canActivate` reads
    // the fake one makes the sweep test pass or fail on the time of day.
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(new Date('2026-08-04T10:00:00Z'));
    guard = new RateLimitGuard(reflector);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows a route with no @RateLimit metadata through untouched', () => {
    options = undefined;
    for (let i = 0; i < 100; i++) {
      expect(guard.canActivate(context())).toBe(true);
    }
  });

  it('allows the first request', () => {
    expect(guard.canActivate(context())).toBe(true);
  });

  it('blocks the second request inside the window', () => {
    guard.canActivate(context());
    expect(() => guard.canActivate(context())).toThrow(HttpException);
  });

  it('answers 429 with a retry hint rather than a generic error', () => {
    expect.assertions(2);
    guard.canActivate(context());
    try {
      guard.canActivate(context());
    } catch (err) {
      const error = err as HttpException;
      expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.message).toMatch(/try again in \d+s/);
    }
  });

  it('allows the request again once the window has passed', () => {
    guard.canActivate(context());
    jest.advanceTimersByTime(60_001);
    expect(guard.canActivate(context())).toBe(true);
  });

  it('keeps blocking right up to the edge of the window', () => {
    guard.canActivate(context());
    jest.advanceTimersByTime(59_000);
    expect(() => guard.canActivate(context())).toThrow(HttpException);
  });

  it('honours a limit above one', () => {
    options = { limit: 3, windowMs: 60_000 };
    expect(guard.canActivate(context())).toBe(true);
    expect(guard.canActivate(context())).toBe(true);
    expect(guard.canActivate(context())).toBe(true);
    expect(() => guard.canActivate(context())).toThrow(HttpException);
  });

  it('counts each client IP separately', () => {
    expect(guard.canActivate(context({ ip: '1.1.1.1' }))).toBe(true);
    expect(guard.canActivate(context({ ip: '2.2.2.2' }))).toBe(true);
    expect(() => guard.canActivate(context({ ip: '1.1.1.1' }))).toThrow(
      HttpException,
    );
  });

  it('counts each handler separately', () => {
    // Signing the guestbook must not consume the contact form's budget.
    expect(guard.canActivate(context({ handler: 'sign' }))).toBe(true);
    expect(
      guard.canActivate(
        context({ handler: 'send', controller: 'ContactController' }),
      ),
    ).toBe(true);
    expect(() => guard.canActivate(context({ handler: 'sign' }))).toThrow(
      HttpException,
    );
  });

  describe('client IP resolution', () => {
    // An address in Cloudflare's 172.64.0.0/13 and one outside every range it
    // publishes, for a request sent straight to the origin.
    const edge = '172.64.1.1';
    const direct = '198.51.100.7';

    it('does not open a new bucket for a client-supplied x-forwarded-for', () => {
      // The bypass this guard used to allow: the leftmost entry is the
      // client's to write, so a random one per request was a fresh bucket each
      // time.
      expect(
        guard.canActivate(context({ ip: direct, forwarded: '9.9.9.9' })),
      ).toBe(true);
      expect(() =>
        guard.canActivate(context({ ip: direct, forwarded: '8.8.8.8' })),
      ).toThrow(HttpException);
      expect(() =>
        guard.canActivate(
          context({ ip: direct, forwarded: `7.7.7.7, ${direct}` }),
        ),
      ).toThrow(HttpException);
    });

    it('prefers cf-connecting-ip when the request came through Cloudflare', () => {
      // Without it every visitor behind the same edge node would share a
      // bucket.
      const viaEdge = (visitor: string) =>
        context({ ip: edge, cfConnectingIp: visitor });

      expect(guard.canActivate(viaEdge('203.0.113.1'))).toBe(true);
      expect(guard.canActivate(viaEdge('203.0.113.2'))).toBe(true);
      expect(() => guard.canActivate(viaEdge('203.0.113.1'))).toThrow(
        HttpException,
      );
    });

    it('follows a visitor across Cloudflare edges', () => {
      expect(
        guard.canActivate(
          context({ ip: '104.16.0.1', cfConnectingIp: '203.0.113.1' }),
        ),
      ).toBe(true);
      expect(() =>
        guard.canActivate(
          context({ ip: '162.158.0.1', cfConnectingIp: '203.0.113.1' }),
        ),
      ).toThrow(HttpException);
    });

    it.each(['2606:4700::1', '::ffff:104.16.0.1'])(
      'recognises the Cloudflare edge %s',
      (peer) => {
        const viaPeer = (visitor: string) =>
          context({ ip: peer, cfConnectingIp: visitor });

        expect(guard.canActivate(viaPeer('203.0.113.1'))).toBe(true);
        expect(guard.canActivate(viaPeer('203.0.113.2'))).toBe(true);
      },
    );

    it('ignores cf-connecting-ip from a peer that is not Cloudflare', () => {
      // Anyone who connects to the origin directly can write the header; only
      // Cloudflare's copy is Cloudflare's.
      expect(
        guard.canActivate(context({ ip: direct, cfConnectingIp: '9.9.9.9' })),
      ).toBe(true);
      expect(() =>
        guard.canActivate(context({ ip: direct, cfConnectingIp: '8.8.8.8' })),
      ).toThrow(HttpException);
    });

    it('ignores an empty cf-connecting-ip rather than bucketing everyone together', () => {
      expect(
        guard.canActivate(context({ ip: '172.64.0.1', cfConnectingIp: '' })),
      ).toBe(true);
      expect(
        guard.canActivate(context({ ip: '172.64.0.2', cfConnectingIp: '' })),
      ).toBe(true);
    });
  });

  it('sweeps expired buckets so the map cannot grow without bound', () => {
    for (let i = 0; i < 50; i++) {
      guard.canActivate(context({ ip: `10.0.0.${i}` }));
    }
    expect(guard['hits'].size).toBe(50);

    // Past both the window and the sweep interval.
    jest.advanceTimersByTime(120_000);
    guard.canActivate(context({ ip: '172.16.0.1' }));

    expect(guard['hits'].size).toBe(1);
  });

  describe('bucket cap', () => {
    const address = (i: number) =>
      `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

    it('holds at MAX_BUCKETS, dropping the oldest bucket for a new one', () => {
      // All inside one window, so the sweep has nothing to reclaim.
      for (let i = 0; i <= MAX_BUCKETS; i++) {
        guard.canActivate(context({ ip: address(i) }));
      }
      expect(guard['hits'].size).toBe(MAX_BUCKETS);

      // The first bucket made room for the last; the last is still counting.
      expect(guard.canActivate(context({ ip: address(0) }))).toBe(true);
      expect(() =>
        guard.canActivate(context({ ip: address(MAX_BUCKETS) })),
      ).toThrow(HttpException);
      expect(guard['hits'].size).toBe(MAX_BUCKETS);
    });

    it('counts a reopened window as new, not as the oldest', () => {
      // Short enough to expire long before the 60s sweep would drop it.
      options = { limit: 1, windowMs: 1_000 };
      guard.canActivate(context({ ip: 'reopened' }));
      jest.advanceTimersByTime(2_000);
      for (let i = 1; i < MAX_BUCKETS; i++) {
        guard.canActivate(context({ ip: address(i) }));
      }
      guard.canActivate(context({ ip: 'reopened' }));

      // Full again, so this evicts: address(1), not the window that just
      // reopened.
      guard.canActivate(context({ ip: 'newcomer' }));

      expect(() => guard.canActivate(context({ ip: 'reopened' }))).toThrow(
        HttpException,
      );
      expect(guard.canActivate(context({ ip: address(1) }))).toBe(true);
    });
  });
});
