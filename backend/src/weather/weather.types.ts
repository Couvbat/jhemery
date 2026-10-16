/**
 * A coarse bucket over WMO weather codes. The frontend picks a glyph and a
 * background mood from this rather than from the raw code, so the mapping lives
 * once, here, instead of being reimplemented next to every renderer.
 */
export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunder';

export interface WeatherNow {
  /** °C. */
  temperature: number;
  /** °C, "feels like". */
  apparent: number;
  /** %. */
  humidity: number;
  /** km/h. */
  windSpeed: number;
  /** Degrees clockwise from north. */
  windDirection: number;
  /** mm in the last hour. */
  precipitation: number;
  isDay: boolean;
  /** Raw WMO code, kept so the frontend can say something more specific. */
  code: number;
  condition: WeatherCondition;
}

export interface WeatherForecastDay {
  /** `YYYY-MM-DD`. */
  date: string;
  min: number;
  max: number;
  code: number;
  condition: WeatherCondition;
}

export interface WeatherReport {
  configured: boolean;
  /** A display name from config — never derived from the caller. */
  location?: string;
  now?: WeatherNow;
  forecast?: WeatherForecastDay[];
}

/** WMO code → bucket. Anything unrecognised reads as cloudy rather than throwing. */
export function conditionFor(code: number): WeatherCondition {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rain';
  if (code <= 86) return 'snow';
  if (code <= 99) return 'thunder';
  return 'cloudy';
}
