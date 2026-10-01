import {
  Controller,
  HttpCode,
  Post,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
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
   * site-wide coalescing. Enabled, it answers 204 whatever happened — dropped or
   * broadcast — so it says nothing about anyone else.
   */
  @Post('wall')
  @HttpCode(204)
  @RateLimit({ limit: 6, windowMs: 60_000 })
  wall(@Res({ passthrough: true }) res: Response): WallOff | undefined {
    if (this.config.get<string>('WALL_ENABLED') !== 'true') {
      res.status(200);
      return { configured: false };
    }
    this.presenceService.wave();
    return undefined;
  }
}
