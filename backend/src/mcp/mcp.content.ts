import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cacheAge } from '../common/health';
import { SiteContent } from './mcp.types';

/** The content changes on a frontend deploy, not by the minute. */
export const CONTENT_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Where the MCP tools get their answers: `${FRONTEND_URL}/content.json`, which the
 * frontend build emits from `src/content` beside `resume.txt`. Fetched rather than
 * imported, so the content keeps one source and the two apps stay independent.
 *
 * Cached, and a stale copy is served when a refresh fails — the same posture as the
 * Steam and GitHub caches — so a frontend deploy in progress does not take the tools
 * down with it.
 */
@Injectable()
export class McpContentService {
  private readonly logger = new Logger(McpContentService.name);
  private cache: { data: SiteContent; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get url(): string | null {
    const base = this.config.get<string>('FRONTEND_URL')?.replace(/\/+$/, '');
    return base ? `${base}/content.json` : null;
  }

  get age(): number | null {
    return cacheAge(this.cache, CONTENT_TTL_MS);
  }

  async content(): Promise<SiteContent> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.data;

    const url = this.url;
    try {
      if (!url) throw new Error('FRONTEND_URL is not set');
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`content.json answered ${res.status}`);
      const data = (await res.json()) as Partial<SiteContent> | null;
      // A shape this code was not written for is refused, not guessed at.
      if (data?.version !== 1) throw new Error('unknown content.json version');
      this.cache = {
        data: data as SiteContent,
        expiresAt: Date.now() + CONTENT_TTL_MS,
      };
      return this.cache.data;
    } catch (err) {
      if (this.cache) return this.cache.data;
      this.logger.warn(
        `Could not load content.json: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('The site content is unavailable');
    }
  }
}
