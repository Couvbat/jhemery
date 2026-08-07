import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

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
  const allowedOrigins = [
    'http://localhost:5173',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];
  app.enableCors({
    origin: allowedOrigins,
    // DELETE is used by the guestbook moderation endpoint.
    methods: ['GET', 'POST', 'DELETE'],
    // x-admin-password is what GuestbookController reads; the preflight for
    // DELETE /guestbook/:id fails in the browser if it is not listed here.
    allowedHeaders: ['Content-Type', 'x-admin-password'],
  });
  // Apache fronts this app, so req.ip must come from X-Forwarded-For for the
  // per-IP rate limiter to see real clients rather than the proxy.
  app.set('trust proxy', 1);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
