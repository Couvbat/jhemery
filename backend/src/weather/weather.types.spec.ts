import { conditionFor, WeatherCondition } from './weather.types';

/**
 * The bucketing every renderer downstream depends on — a glyph, a label and a
 * background mood are all picked from the bucket rather than from the raw WMO
 * code, so a wrong boundary here is wrong in three places at once.
 */
describe('conditionFor', () => {
  const cases: Array<[number, WeatherCondition]> = [
    [0, 'clear'], // clear sky
    [1, 'clear'], // mainly clear
    [2, 'cloudy'], // partly cloudy
    [3, 'cloudy'], // overcast
    [45, 'fog'],
    [48, 'fog'], // depositing rime fog
    [51, 'drizzle'],
    [57, 'drizzle'], // freezing drizzle
    [61, 'rain'],
    [67, 'rain'], // freezing rain
    [71, 'snow'],
    [77, 'snow'], // snow grains
    [80, 'rain'], // rain showers
    [82, 'rain'],
    [85, 'snow'], // snow showers
    [86, 'snow'],
    [95, 'thunder'],
    [99, 'thunder'], // thunderstorm with heavy hail
  ];

  it.each(cases)('maps WMO %i to %s', (code, expected) => {
    expect(conditionFor(code)).toBe(expected);
  });

  it('falls back to cloudy for a code it has never seen', () => {
    // Open-Meteo adding a code must not throw in front of a visitor.
    expect(conditionFor(1234)).toBe('cloudy');
  });
});
