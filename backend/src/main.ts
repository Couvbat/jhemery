import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { allowedOrigins, timingAllowOrigin } from './common/server-timing';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Before enableCors, so the hardening headers are on the preflight responses
  // too. Everything this app returns is JSON, so the defaults are close to
  // right; only the two below need adjusting.
  app.use(
    helmet({
      // helmet's default `same-origin` would be a promise this API cannot keep:
      // it is a public, cross-origin API that jhemery.xyz reads by design, and
      // the frontend's own CSP already names it in connect-src. CORS remains
      // the control that decides who may read a response.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // helmet defaults this to SAMEORIGIN, which would contradict the
      // `frame-ancestors 'none'` below for any browser old enough to still be
      // reading X-Frame-Options in the first place.
      frameguard: { action: 'deny' },
      contentSecurityPolicy: {
        // A JSON API needs no source list at all — nothing here is ever a
        // document. Denying everything means an endpoint that someday returns
        // HTML by accident cannot load or run anything with it.
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
    }),
  );
  const origins = allowedOrigins();
  // Resource Timing hides a cross-origin response's sizes and Server-Timing unless it
  // names the page's origin. The same origins CORS admits, and only those: x-ray reads
  // its own requests, and no other site learns this API's cache ages.
  app.use(timingAllowOrigin(origins));
  app.enableCors({
    origin: origins,
    // DELETE is used by the guestbook moderation endpoint.
    methods: ['GET', 'POST', 'DELETE'],
    // x-admin-password is what GuestbookController reads; the preflight for
    // DELETE /guestbook/:id fails in the browser if it is not listed here.
    // x-room-token is the same story for the rooms' host routes.
    allowedHeaders: ['Content-Type', 'x-admin-password', 'x-room-token'],
    // Not CORS-safelisted, so a page can read it only when it is named: the rate
    // limit's seconds until the window frees.
    exposedHeaders: ['Retry-After'],
  });
  // One hop, not two, although Cloudflare and Apache both append to
  // X-Forwarded-For. Passenger forwards the header it was given, then adds its
  // own line carrying Apache's peer address, and Node joins the two, so at 1
  // req.ip is that peer: the one entry no client can write. 2 would take the
  // entry before it, which is Cloudflare's own only for traffic that went
  // through Cloudflare. The origin also answers anyone who connects to it
  // directly, and for them that entry is whatever they sent. Visitors who did
  // come through Cloudflare are told apart by CF-Connecting-IP instead; see
  // clientIp() in common/rate-limit.guard.ts.
  app.set('trust proxy', 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
