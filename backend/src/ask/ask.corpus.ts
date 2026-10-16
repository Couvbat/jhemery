import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isCorpus, type CorpusLang } from './corpus.types';
import {
  buildIndex,
  retrieve,
  type PassageIndex,
  type Retrieved,
} from './retrieve';

/** The passages change on a frontend deploy. */
export const CORPUS_TTL_MS = 60 * 60 * 1000;
const CORPUS_TIMEOUT_MS = 5_000;
/** How long to wait after a failed fetch before dialling again. */
const CORPUS_RETRY_MS = 5 * 60 * 1000;
/** The file is a few hundred kilobytes; this guards against a surprise. */
const MAX_CORPUS_BYTES = 2_000_000;

/**
 * `ask`'s second tier: the site's passages, from `${FRONTEND_URL}/corpus.json`, indexed
 * once per fetch. Fetched in the background and cached for an hour, **never on a
 * question's path**: an awaited fetch from the backend to its own frontend once wedged on
 * a loopback and took `ask` down with it (the corpus correction in the `ask` spec). Not
 * fetched yet, failed, or of a version this code doesn't know, `ask` answers from its
 * first tier alone, as it did before passages existed.
 */
@Injectable()
export class AskCorpusService {
  private readonly logger = new Logger(AskCorpusService.name);
  private index: Record<CorpusLang, PassageIndex> | null = null;
  private expiresAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  private get url(): string | null {
    const base = this.config.get<string>('FRONTEND_URL')?.replace(/\/+$/, '');
    return base ? `${base}/corpus.json` : null;
  }

  /** How many passages are held: 0 until a fetch has landed. `/health` reports it. */
  get size(): number {
    return this.index?.en.docs.length ?? 0;
  }

  /**
   * The passages for a question, from what is in hand. Starts a refresh when the copy
   * has expired, and never waits for it.
   */
  passagesFor(question: string, locale: CorpusLang): Retrieved[] {
    if (Date.now() >= this.expiresAt) void this.refresh();
    return this.index ? retrieve(question, this.index[locale]) : [];
  }

  /** One refresh at a time, so questions can't pile up dials. Exposed for the specs. */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const url = this.url;
    if (!url) {
      // Nowhere to read from, and nothing changes that until a restart.
      this.expiresAt = Date.now() + CORPUS_TTL_MS;
      return Promise.resolve();
    }

    this.refreshing = (async () => {
      try {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(CORPUS_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`corpus.json answered ${res.status}`);
        const body = await res.text();
        if (body.length > MAX_CORPUS_BYTES)
          throw new Error('corpus.json is too large');
        const corpus: unknown = JSON.parse(body);
        // A shape this code was not written for is refused, not guessed at.
        if (!isCorpus(corpus)) throw new Error('unknown corpus.json version');
        this.index = {
          en: buildIndex(corpus.passages, 'en'),
          fr: buildIndex(corpus.passages, 'fr'),
        };
        this.expiresAt = Date.now() + CORPUS_TTL_MS;
      } catch (err) {
        this.logger.warn(
          `Could not refresh ask's passages: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.expiresAt = Date.now() + CORPUS_RETRY_MS;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
}
