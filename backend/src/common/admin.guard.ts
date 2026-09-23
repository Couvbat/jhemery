import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * The owner's gate: `x-admin-password` against `ADMIN_PASSWORD`, on every route
 * of a controller. Unset means locked, not open — an empty env var must never
 * turn into an empty header that matches it. The guestbook's DELETE predates
 * this and checks the same thing inline; this is that check made reusable for a
 * surface that is admin-only end to end.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_PASSWORD');
    const given = context.switchToHttp().getRequest<Request>().headers[
      'x-admin-password'
    ];
    if (
      !expected ||
      typeof given !== 'string' ||
      !sameSecret(given, expected)
    ) {
      throw new ForbiddenException('Not the admin');
    }
    return true;
  }
}

/** Constant-time, so a wrong password costs the same however wrong it is. */
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
