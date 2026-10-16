import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { timedCopy } from '../common/server-timing';
import { SteamService } from './steam.service';
import { SteamActivity } from './steam.types';

@Controller('steam')
export class SteamController {
  constructor(private readonly steamService: SteamService) {}

  /** Says whether it served the cache or fetched, in `Server-Timing` (see `timedCopy`). */
  @Get('activity')
  getActivity(
    @Res({ passthrough: true }) res: Response,
  ): Promise<SteamActivity> {
    return timedCopy(
      res,
      () => this.steamService.health().cacheAge,
      () => this.steamService.getActivity(),
    );
  }
}
