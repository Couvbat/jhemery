export interface MarketQuote {
  /** CoinGecko's id, e.g. `bitcoin`. */
  id: string;
  /** Upper-cased ticker, e.g. `BTC`. */
  symbol: string;
  name: string;
  price: number;
  /** Lower-case ISO currency the price is quoted in. */
  currency: string;
  /** Percent change over 24h; null when the source didn't provide one. */
  change24h: number | null;
  /** Seven days of closes, already downsampled for an ASCII sparkline. */
  sparkline: number[];
}

export interface MarketsReport {
  configured: boolean;
  quotes?: MarketQuote[];
}

/**
 * Averages `values` into `buckets` evenly-sized groups.
 *
 * The source hands back 168 hourly points; a terminal sparkline is about 48
 * characters wide. Downsampling here rather than in the browser keeps the
 * payload small and means every renderer sees the same series.
 */
export function downsample(values: number[], buckets: number): number[] {
  if (buckets <= 0) return [];
  if (values.length <= buckets) return [...values];

  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor((i * values.length) / buckets);
    const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / buckets));
    const slice = values.slice(start, end);
    out.push(slice.reduce((sum, v) => sum + v, 0) / slice.length);
  }
  return out;
}
