import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { timedCopy } from '../common/server-timing';
import { parseApps, SteamService } from './steam.service';
import { SteamActivity } from './steam.types';

@Controller('steam')
export class SteamController {
  constructor(private readonly steamService: SteamService) {}

  /**
   * Says whether it served the cache or fetched, in `Server-Timing` (see `timedCopy`).
   * `?apps=` names the favourites whose hours and achievements to add (`parseApps`).
   */
  @Get('activity')
  getActivity(
    @Query('apps') apps: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SteamActivity> {
    return timedCopy(
      res,
      () => this.steamService.copyAge(),
      () => this.steamService.getActivity(parseApps(apps)),
    );
  }
}
