import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RateLimit, RateLimitGuard } from '../common/rate-limit.guard';
import { WordleQueryDto, WordleResultDto } from './stats.dto';
import { StatsService } from './stats.service';
import { StatsReport, WordleHistogram } from './stats.types';

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

  @Get('wordle')
  async wordle(@Query() query: WordleQueryDto): Promise<WordleHistogram> {
    return this.stats.wordleHistogram(query.day, query.locale);
  }

  /**
   * One finished daily wordle: day, language, guess count — and nothing else, so the
   * histogram can never say who played. Limited like `/stats/session`, for the same
   * reason: a distribution anyone can skew with a loop is not worth drawing.
   */
  @Post('wordle')
  @HttpCode(200)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000 })
  async recordWordle(@Body() body: WordleResultDto): Promise<WordleHistogram> {
    return this.stats.recordWordle(body.day, body.locale, body.guesses);
  }
}
