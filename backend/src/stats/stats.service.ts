import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { UnitHealth } from '../common/health';
import {
  StatsFile,
  StatsReport,
  WordleHistogram,
  WordleLocale,
} from './stats.types';

/**
 * A vanity counter is not worth a disk write per visitor, so increments
 * accumulate in memory and land at most this often.
 */
const FLUSH_INTERVAL_MS = 30_000;

/** How many days of wordle tallies are kept. Older days are dropped on write. */
export const WORDLE_DAYS_KEPT = 14;

/** Solved in one to six, plus "not solved". */
const WORDLE_BUCKETS = 7;

const DAY_MS = 86_400_000;

function utcDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

@Injectable()
export class StatsService implements OnModuleDestroy {
  private readonly logger = new Logger(StatsService.name);
  private sessions: number | null = null;
  private wordle: Record<string, number[]> = {};
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private config: ConfigService) {}

  /** Alongside guestbook.json under DATA_DIR, which the deploy excludes — so the
   *  total survives a deploy rather than resetting to zero every release. */
  private get filePath(): string {
    const dir = this.config.get<string>('DATA_DIR') ?? 'uploads';
    return join(isAbsolute(dir) ? dir : join(process.cwd(), dir), 'stats.json');
  }

  async read(): Promise<StatsReport> {
    return { sessions: await this.load() };
  }

  /**
   * Fire-and-forget from the caller's point of view: the response is the new
   * total, and the disk write happens on the next flush.
   */
  async recordSession(): Promise<StatsReport> {
    const sessions = (await this.load()) + 1;
    this.sessions = sessions;
    this.markDirty();
    return { sessions };
  }

  /** The day's tallies in one language; seven zeros when nobody has reported yet. */
  async wordleHistogram(
    day: string,
    locale: WordleLocale,
  ): Promise<WordleHistogram> {
    await this.load();
    const counts = this.wordle[`${day}:${locale}`];
    return {
      day,
      locale,
      counts: counts ? [...counts] : new Array<number>(WORDLE_BUCKETS).fill(0),
    };
  }

  /**
   * Adds one finished daily. Only today and yesterday (UTC) are accepted — the word
   * is chosen by UTC date, and a board finished just after midnight belongs to the
   * day before — so nobody can stuff a histogram a week after it closed.
   */
  async recordWordle(
    day: string,
    locale: WordleLocale,
    guesses: number,
    now = Date.now(),
  ): Promise<WordleHistogram> {
    if (day !== utcDay(now) && day !== utcDay(now - DAY_MS)) {
      throw new BadRequestException('Only today’s daily can be reported');
    }
    await this.load();

    const key = `${day}:${locale}`;
    const counts =
      this.wordle[key] ?? new Array<number>(WORDLE_BUCKETS).fill(0);
    counts[guesses === 0 ? WORDLE_BUCKETS - 1 : guesses - 1] += 1;
    this.wordle[key] = counts;
    this.prune(now);
    this.markDirty();
    return { day, locale, counts: [...counts] };
  }

  /** Always running. The session count only once it has been read from disk. */
  health(): UnitHealth {
    return {
      unit: 'stats',
      state: 'active',
      ...(this.sessions === null
        ? {}
        : { detail: { sessions: this.sessions } }),
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    await this.flush();
  }

  private prune(now: number): void {
    const oldest = utcDay(now - (WORDLE_DAYS_KEPT - 1) * DAY_MS);
    for (const key of Object.keys(this.wordle)) {
      if (key.slice(0, 10) < oldest) delete this.wordle[key];
    }
  }

  private markDirty(): void {
    this.dirty = true;
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    // A pending write must not hold the process open at shutdown.
    this.flushTimer.unref?.();
  }

  private async load(): Promise<number> {
    if (this.sessions !== null) return this.sessions;

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StatsFile> | null;
      const value = parsed?.sessions;
      this.sessions = typeof value === 'number' && value >= 0 ? value : 0;
      this.wordle = {};
      for (const [key, counts] of Object.entries(parsed?.wordle ?? {})) {
        // Anything that is not seven non-negative integers is dropped, not trusted.
        if (
          /^\d{4}-\d{2}-\d{2}:(en|fr)$/.test(key) &&
          Array.isArray(counts) &&
          counts.length === WORDLE_BUCKETS &&
          counts.every((n) => Number.isInteger(n) && n >= 0)
        ) {
          this.wordle[key] = counts;
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Could not read stats: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.sessions = 0;
    }
    return this.sessions;
  }

  private async flush(): Promise<void> {
    if (!this.dirty || this.sessions === null) return;
    this.dirty = false;

    const path = this.filePath;
    const file: StatsFile = { sessions: this.sessions };
    // Only written once there is something in it, so a site that never runs the
    // daily keeps a file with exactly one key.
    if (Object.keys(this.wordle).length) file.wordle = this.wordle;
    try {
      await mkdir(dirname(path), { recursive: true });
      // Write-then-rename, same as the guestbook: a crash mid-write must not
      // truncate the existing total.
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(file), 'utf8');
      await rename(temp, path);
    } catch (err) {
      this.dirty = true;
      this.logger.warn(
        `Could not write stats: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
