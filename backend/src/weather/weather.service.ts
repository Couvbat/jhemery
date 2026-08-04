import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  conditionFor,
  WeatherForecastDay,
  WeatherReport,
} from './weather.types';

/** Weather changes slowly and Open-Meteo asks for courtesy, not a key. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const FORECAST_DAYS = 3;
const REQUEST_TIMEOUT_MS = 8000;

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'is_day',
].join(',');

const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
].join(',');

interface OpenMeteoResponse {
  current?: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    is_day: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

/**
 * Open-Meteo needs no API key and no account, which is the whole reason it is
 * the weather source here.
 *
 * The coordinates come from server config and describe *Jules's* city, not the
 * caller's: nothing about the visitor is read, sent or stored, and the answer is
 * identical for everyone. That is deliberate — a portfolio has no business
 * asking for anyone's location, and a shared answer is what makes one cache for
 * all callers correct.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private cache: { data: WeatherReport; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  async getWeather(): Promise<WeatherReport> {
    const latitude = Number(this.config.get<string>('WEATHER_LATITUDE'));
    const longitude = Number(this.config.get<string>('WEATHER_LONGITUDE'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { configured: false };
    }

    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    try {
      const data = await this.fetchWeather(latitude, longitude);
      this.cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch weather: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { configured: false };
    }
  }

  private async fetchWeather(
    latitude: number,
    longitude: number,
  ): Promise<WeatherReport> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', CURRENT_FIELDS);
    url.searchParams.set('daily', DAILY_FIELDS);
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', String(FORECAST_DAYS));

    const res = await fetch(url, {
      headers: { 'User-Agent': 'jhemery-portfolio' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Open-Meteo failed: ${res.status}`);

    const json = (await res.json()) as OpenMeteoResponse;
    const current = json.current;
    if (!current) throw new Error('Open-Meteo returned no current conditions');

    const daily = json.daily;
    const forecast: WeatherForecastDay[] = (daily?.time ?? []).map(
      (date, i) => ({
        date,
        min: round(daily!.temperature_2m_min[i]),
        max: round(daily!.temperature_2m_max[i]),
        code: daily!.weather_code[i],
        condition: conditionFor(daily!.weather_code[i]),
      }),
    );

    return {
      configured: true,
      location: this.config.get<string>('WEATHER_LOCATION') ?? 'somewhere',
      now: {
        temperature: round(current.temperature_2m),
        apparent: round(current.apparent_temperature),
        humidity: Math.round(current.relative_humidity_2m),
        windSpeed: round(current.wind_speed_10m),
        windDirection: Math.round(current.wind_direction_10m),
        precipitation: round(current.precipitation),
        isDay: current.is_day === 1,
        code: current.weather_code,
        condition: conditionFor(current.weather_code),
      },
      forecast,
    };
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
