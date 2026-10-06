import { UnsupportedMediaTypeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { of } from 'rxjs';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../common/rate-limit.guard';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

/**
 * `POST /presence/wall` is the first unauthenticated route that makes other
 * visitors' pages react, so its gate is the thing to pin: off unless opted in,
 * a bare 204 when on whatever happened, two in ten minutes per IP, JSON only.
 */
/** A handler's own options, read off the function `@RateLimit` decorated. */
function rateLimitOf(method: 'wall' | 'stream'): RateLimitOptions | undefined {
  const handler = Object.getOwnPropertyDescriptor(
    PresenceController.prototype,
    method,
  )?.value as object;
  return Reflect.getMetadata(RATE_LIMIT_KEY, handler) as
    RateLimitOptions | undefined;
}

describe('PresenceController', () => {
  let wave: jest.Mock;
  let status: jest.Mock;
  let res: Response;

  function build(env: Record<string, string> = {}): PresenceController {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new PresenceController(
      {
        wave,
        stream: () => of({ data: { online: 1 } }),
      } as unknown as PresenceService,
      config,
    );
  }

  beforeEach(() => {
    wave = jest.fn();
    status = jest.fn();
    res = { status } as unknown as Response;
  });

  /** A JSON POST, which is preflighted; anything else is a CORS simple request. */
  const json = {
    is: (type: string) => (type === 'application/json' ? type : false),
  } as unknown as Request;
  const plain = { is: () => false } as unknown as Request;

  describe('wall', () => {
    it('is off by default, says so, and waves at nobody', () => {
      const reply = build().wall(json, res);

      expect(reply).toEqual({ configured: false });
      expect(status).toHaveBeenCalledWith(200);
      expect(wave).not.toHaveBeenCalled();
    });

    it('stays off for anything but an explicit true', () => {
      for (const value of ['false', '1', 'yes', '']) {
        expect(build({ WALL_ENABLED: value }).wall(json, res)).toEqual({
          configured: false,
        });
      }
      expect(wave).not.toHaveBeenCalled();
    });

    it('refuses anything but JSON when enabled, so other sites can’t send it unseen', () => {
      expect(() => build({ WALL_ENABLED: 'true' }).wall(plain, res)).toThrow(
        UnsupportedMediaTypeException,
      );
      expect(wave).not.toHaveBeenCalled();
    });

    it('waves when enabled, and answers with nothing at all', () => {
      const reply = build({ WALL_ENABLED: 'true' }).wall(json, res);

      expect(reply).toBeUndefined();
      // The decorator's 204 stands: the handler never picks a status of its own.
      expect(status).not.toHaveBeenCalled();
      expect(wave).toHaveBeenCalledTimes(1);
    });

    it('is limited to two in ten minutes per IP', () => {
      expect(rateLimitOf('wall')).toEqual({ limit: 2, windowMs: 600_000 });
    });
  });

  it('leaves the stream unlimited and unchanged', () => {
    expect(rateLimitOf('stream')).toBeUndefined();
    let first: unknown;
    build()
      .stream()
      .subscribe((frame) => (first = frame));
    expect(first).toEqual({ data: { online: 1 } });
  });
});
