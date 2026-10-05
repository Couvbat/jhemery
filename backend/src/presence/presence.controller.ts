import {
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  Sse,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { PresenceService } from './presence.service';
import { PresenceFrame, WallOff } from './presence.types';

@Controller('presence')
@UseGuards(RateLimitGuard)
export class PresenceController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Nest's own `@Sse()` — no new dependency, and the connection is the
   * subscription, so a visitor closing the tab is a plain unsubscribe.
   */
  @Sse()
  stream(): Observable<PresenceFrame> {
    return this.presenceService.stream();
  }

  /**
   * `wall`: a wave to everyone else on the site. SSE only flows one way, so the
   * sending half is this POST. It would be the first unauthenticated route that
   * makes other visitors' pages react, so it is off unless `WALL_ENABLED` is set,
   * like every other publicly writable one, and rate-limited per IP on top of the
   * site-wide coalescing: two in ten minutes, far below the one wave in 15 s that
   * anyone can be shown. Enabled, it answers 204 whatever happened — dropped or
   * broadcast — so it says nothing about anyone else.
   *
   * It takes JSON only. A bare POST is a CORS "simple request", which any other site
   * could have its own visitors' browsers send, each from a real address of its own;
   * a JSON one is preflighted, and CORS lets only this site's origin through.
   */
  @Post('wall')
  @HttpCode(204)
  @RateLimit({ limit: 2, windowMs: 10 * 60_000 })
  wall(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): WallOff | undefined {
    if (this.config.get<string>('WALL_ENABLED') !== 'true') {
      res.status(200);
      return { configured: false };
    }
    if (!req.is('application/json'))
      throw new UnsupportedMediaTypeException('wall takes application/json');
    this.presenceService.wave();
    return undefined;
  }
}
