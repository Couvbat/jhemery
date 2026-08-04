import { ExecutionContext, HttpStatus, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard, RateLimitOptions } from './rate-limit.guard';

/**
 * The only thing standing between `POST /contact` / `POST /guestbook` and a bot
 * with a loop. Its bucket key mixes controller, handler and client IP, so the
 * cases that matter are the ones where those differ.
 */
describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let reflector: Reflector;
  let options: RateLimitOptions | undefined;

  function context({
    ip = '1.2.3.4',
    forwarded,
    handler = 'sign',
    controller = 'GuestbookController',
  }: {
    ip?: string;
    forwarded?: string | string[];
    handler?: string;
    controller?: string;
  } = {}): ExecutionContext {
    const request = {
      ip,
      headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
      socket: { remoteAddress: ip },
    };
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
    it('trusts the first hop of x-forwarded-for over the socket address', () => {
      // Apache fronts the Node app, so the socket address is always the proxy —
      // without this every visitor would share one bucket.
      const proxied = (forwarded: string) =>
        context({ ip: '10.0.0.1', forwarded });

      expect(guard.canActivate(proxied('9.9.9.9, 10.0.0.1'))).toBe(true);
      expect(guard.canActivate(proxied('8.8.8.8, 10.0.0.1'))).toBe(true);
      expect(() => guard.canActivate(proxied('9.9.9.9, 10.0.0.1'))).toThrow(
        HttpException,
      );
    });

    it('handles x-forwarded-for arriving as a repeated header', () => {
      expect(
        guard.canActivate(context({ ip: '10.0.0.1', forwarded: ['7.7.7.7'] })),
      ).toBe(true);
      expect(() =>
        guard.canActivate(context({ ip: '10.0.0.1', forwarded: ['7.7.7.7'] })),
      ).toThrow(HttpException);
    });

    it('falls back to the socket address when the header is absent', () => {
      expect(guard.canActivate(context({ ip: '5.5.5.5' }))).toBe(true);
      expect(() => guard.canActivate(context({ ip: '5.5.5.5' }))).toThrow(
        HttpException,
      );
    });

    it('ignores an empty x-forwarded-for rather than bucketing everyone together', () => {
      expect(guard.canActivate(context({ ip: '5.5.5.5', forwarded: '' }))).toBe(
        true,
      );
      expect(guard.canActivate(context({ ip: '6.6.6.6', forwarded: '' }))).toBe(
        true,
      );
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
});
