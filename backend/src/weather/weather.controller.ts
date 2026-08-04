import { Controller, Get } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { WeatherReport } from './weather.types';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  async getWeather(): Promise<WeatherReport> {
    return this.weatherService.getWeather();
  }
}
