import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { timedCopy } from '../common/server-timing';
import { MarketsService } from './markets.service';
import { MarketsReport } from './markets.types';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  /** Says whether it served the cache or fetched, in `Server-Timing` (see `timedCopy`). */
  @Get()
  getQuotes(@Res({ passthrough: true }) res: Response): Promise<MarketsReport> {
    return timedCopy(
      res,
      () => this.marketsService.health().cacheAge,
      () => this.marketsService.getQuotes(),
    );
  }
}
