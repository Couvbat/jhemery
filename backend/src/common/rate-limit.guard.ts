import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { BlockList, isIPv6 } from 'node:net';

export interface RateLimitOptions {
  /** Allowed requests per window, per client IP. */
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'rate-limit';

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Buckets held at once, across every limited route. Keys are real addresses, so
 * filling this takes that many distinct clients inside one window. Past it the
 * oldest bucket is dropped rather than the newcomer refused: refusing would let
 * whoever filled the map lock every new visitor out, where dropping only lets a
 * botnet that size do what it could do anyway.
 */
export const MAX_BUCKETS = 10_000;

/**
 * Per-IP fixed-window limiter held in memory.
 *
 * A single low-traffic Node process behind Passenger makes this adequate; it is not
 * shared across instances, so scaling out would need Redis or the platform's own
 * limiter instead.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const key = `${context.getClass().name}.${context.getHandler().name}:${clientIp(request)}`;
    const now = Date.now();

    this.sweep(now);

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      // Delete before re-setting so the Map's insertion order stays the order the
      // windows opened, which is what makes its first key the oldest bucket.
      this.hits.delete(key);
      if (this.hits.size >= MAX_BUCKETS) {
        const [oldest] = this.hits.keys();
        this.hits.delete(oldest);
      }
      this.hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (entry.count >= options.limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      throw new HttpException(
        `Too many requests — try again in ${retryAfter}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    entry.count += 1;
    return true;
  }

  /** Drop expired entries occasionally, leaving MAX_BUCKETS as only a backstop. */
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
  }
}

/**
 * Cloudflare's published edge ranges (https://www.cloudflare.com/ips/, as of
 * 25 September 2026). A range added later fails safe: visitors arriving through it
 * are bucketed by edge address, so they are over-limited, never unlimited.
 */
const CLOUDFLARE = new BlockList();
for (const cidr of [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
]) {
  const [network, prefix] = cidr.split('/');
  CLOUDFLARE.addSubnet(
    network,
    Number(prefix),
    isIPv6(network) ? 'ipv6' : 'ipv4',
  );
}

/**
 * Production is Cloudflare → Apache → Passenger → Node, and every hop appends to
 * X-Forwarded-For, so the header's first entry is whatever the client chose to
 * send. Keying on it let a fresh random header open a fresh bucket per request.
 *
 * `request.ip` is the last entry instead: with `trust proxy` at 1 (main.ts says
 * why 1) it is the address Passenger appended, the peer that opened the
 * connection to Apache, which nothing upstream can write. Behind Cloudflare that
 * peer is an edge node shared by many visitors, so there the visitor comes from
 * CF-Connecting-IP, which Cloudflare overwrites on every request. But only when
 * the peer really is Cloudflare: the origin answers anyone who connects to it
 * directly, and for them the header is theirs to invent.
 */
function clientIp(request: Request): string {
  const peer = request.ip ?? request.socket.remoteAddress;
  if (!peer) return 'unknown';

  const visitor = request.headers['cf-connecting-ip'];
  if (typeof visitor === 'string' && visitor.length > 0 && isCloudflare(peer)) {
    return visitor.trim();
  }
  return peer;
}

function isCloudflare(address: string): boolean {
  return CLOUDFLARE.check(address, isIPv6(address) ? 'ipv6' : 'ipv4');
}
