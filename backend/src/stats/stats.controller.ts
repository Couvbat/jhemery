import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { StatsService } from './stats.service';
import { StatsReport } from './stats.types';

@Controller('stats')
@UseGuards(RateLimitGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  async read(): Promise<StatsReport> {
    return this.stats.read();
  }

  /**
   * Rate-limited not because the write is expensive but because the number is
   * only worth printing if it means something — without a limit, inflating it
   * is a `for` loop.
   */
  @Post('session')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000 })
  async recordSession(): Promise<StatsReport> {
    return this.stats.recordSession();
  }
}
