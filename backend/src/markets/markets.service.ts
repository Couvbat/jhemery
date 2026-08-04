import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { downsample, MarketQuote, MarketsReport } from './markets.types';

/**
 * CoinGecko's free tier is generous but not unlimited, and the answer is the
 * same for every caller, so one shared five-minute cache is both the polite and
 * the correct thing.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
/** Points kept per series — roughly a terminal sparkline's width. */
const SPARKLINE_POINTS = 48;

const DEFAULT_COINS = 'bitcoin,ethereum';
const DEFAULT_CURRENCY = 'eur';

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price: number[] };
}

/**
 * The browser cannot call an exchange directly — CORS — so this is a proxy and
 * nothing more. It forwards no caller data of any kind: the coin list comes from
 * config, not from the request, so there is no query string a visitor can steer.
 *
 * CoinGecko is the source because its public endpoint needs no key and no
 * account, the same reason Open-Meteo is the weather source.
 */
@Injectable()
export class MarketsService {
  private readonly logger = new Logger(MarketsService.name);
  private cache: { data: MarketsReport; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {}

  async getQuotes(): Promise<MarketsReport> {
    const coins = (this.config.get<string>('MARKETS_COINS') ?? DEFAULT_COINS).trim();
    if (!coins) return { configured: false };

    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.data;
    }

    const currency = (
      this.config.get<string>('MARKETS_CURRENCY') ?? DEFAULT_CURRENCY
    )
      .trim()
      .toLowerCase();

    try {
      const quotes = await this.fetchQuotes(coins, currency);
      const data: MarketsReport = { configured: true, quotes };
      this.cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch market quotes: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { configured: false };
    }
  }

  private async fetchQuotes(
    coins: string,
    currency: string,
  ): Promise<MarketQuote[]> {
    const url = new URL('https://api.coingecko.com/api/v3/coins/markets');
    url.searchParams.set('vs_currency', currency);
    url.searchParams.set('ids', coins);
    url.searchParams.set('sparkline', 'true');
    url.searchParams.set('price_change_percentage', '24h');

    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'jhemery-portfolio' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`CoinGecko failed: ${res.status}`);

    const json = (await res.json()) as CoinGeckoMarket[];
    if (!Array.isArray(json)) throw new Error('CoinGecko returned no list');

    return json.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      currency,
      change24h: coin.price_change_percentage_24h ?? null,
      sparkline: downsample(
        coin.sparkline_in_7d?.price ?? [],
        SPARKLINE_POINTS,
      ),
    }));
  }
}
