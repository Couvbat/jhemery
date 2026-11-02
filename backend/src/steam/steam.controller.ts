import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { timedCopy } from '../common/server-timing';
import { parseApps, SteamService, UpstreamTrace } from './steam.service';
import { SteamActivity } from './steam.types';

@Controller('steam')
export class SteamController {
  constructor(private readonly steamService: SteamService) {}

  /**
   * Says whether it served the cache or fetched, in `Server-Timing` (see `timedCopy`).
   * `?apps=` names the favourites whose hours and achievements to add (`parseApps`). The
   * service marks the request's own trace when it goes to Steam for any of it, and an age
   * younger than any copy then reads as the fetch it was, however long the call took (review
   * of #171).
   */
  @Get('activity')
  getActivity(
    @Query('apps') apps: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SteamActivity> {
    const trace: UpstreamTrace = { upstream: false };
    return timedCopy(
      res,
      () => (trace.upstream ? -1 : this.steamService.health().cacheAge),
      () => this.steamService.getActivity(parseApps(apps), trace),
    );
  }
}
