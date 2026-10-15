import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { timedCopy } from '../common/server-timing';
import { WeatherService } from './weather.service';
import { WeatherReport } from './weather.types';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  /** Says whether it served the cache or fetched, in `Server-Timing` (see `timedCopy`). */
  @Get()
  getWeather(
    @Res({ passthrough: true }) res: Response,
  ): Promise<WeatherReport> {
    return timedCopy(
      res,
      () => this.weatherService.health().cacheAge,
      () => this.weatherService.getWeather(),
    );
  }
}
